import { ObjectId } from "mongodb";
import { Sources, ensureIngestIndexes, logScrape, type SourceDoc } from "../lib/ingest/collections";
import { crawlHackerNews } from "../lib/ingest/sources/hackernews";
import { crawlDiscourse } from "../lib/ingest/sources/discourse";
import { crawlStackExchange } from "../lib/ingest/sources/stackexchange";
import { backfillEmbeddings, classifyBacklog, ingestDocuments, refreshSourceYield } from "../lib/ingest/pipeline";
import { hasEmbeddingProvider } from "../lib/ingest/embed";
import { isPermanentSourceError } from "../lib/ingest/errors";
import { enrichPeopleBacklog } from "../lib/ingest/people";
import { ensureSearchIndexes, searchIndexStatus } from "../lib/ingest/searchIndexes";

// The ingestion worker. Runs on Railway, NOT on Vercel.
//
// This is the half of the architecture that serverless cannot host: it crawls continuously and
// holds state between polls. Vercel functions are capped at 60s and have no long-running workers —
// that ceiling is precisely what this whole architecture exists to route around.
//
// One loop, not a cron per source. Sources are polled by priority (highest yield first) so that
// when the worker is behind, the productive sources are the ones that still get served.
//
// Run: npm run worker

const TICK_MS = 60_000;
const SOURCES_PER_TICK = 20;
// Classification is the only paid step here. Draining a few batches per tick keeps the backlog
// moving without letting a large crawl spike the Anthropic bill in one go.
const CLASSIFY_BATCHES_PER_TICK = 3;
// People looked up per tick. Free, but rate-limited by the platforms rather than by cost, and
// every one is a separate request — 25/tick is ~36k/day, which drains any realistic backlog while
// staying far under Stack Exchange's quota and well inside Discourse's tolerance.
const ENRICH_PEOPLE_PER_TICK = 25;

let running = true;

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args);
}

async function dueSources(limit: number): Promise<SourceDoc[]> {
  const sources = await Sources();
  const now = new Date();
  const all = await sources
    .find({ enabled: true, health: { $ne: "blocked" } })
    // Highest yield first — when behind, serve the sources that actually produce.
    .sort({ docYield30d: -1 })
    .limit(limit * 4)
    .toArray();
  return all
    .filter((s) => !s.lastPolled || s.lastPolled.getTime() + s.pollIntervalMinutes * 60_000 < now.getTime())
    .slice(0, limit);
}

async function pollSource(source: SourceDoc & { _id?: ObjectId }, correlationId: string): Promise<void> {
  const sources = await Sources();
  const id = String(source._id);
  const startedAt = new Date();
  const label = `${source.platform}:${source.identifier}`;

  try {
    const page =
      source.platform === "hn"
        ? await crawlHackerNews({ cursor: source.lastCursor })
        : source.platform === "discourse"
          ? await crawlDiscourse({ baseUrl: source.baseUrl ?? `https://${source.identifier}`, cursor: source.lastCursor })
          : source.platform === "stackexchange"
            ? await crawlStackExchange({ site: source.identifier, cursor: source.lastCursor })
            : null;

    if (!page) {
      log(`skip ${source.platform}:${source.identifier} — no crawler for this platform`);
      await logScrape({
        correlationId,
        phase: "crawl",
        source: label,
        startedAt,
        ms: Date.now() - startedAt.getTime(),
        itemsFound: 0,
        budgetHit: false,
        error: "no crawler for this platform",
      });
      return;
    }
    const stats = await ingestDocuments({ sourceId: id, documents: page.documents });

    log(
      `${source.platform}:${source.identifier} fetched=${stats.fetched} stored=${stats.stored} ` +
        `gate=${stats.droppedGate} short=${stats.droppedShort} lang=${stats.droppedLanguage} dupe=${stats.duplicates}`,
    );

    await sources.updateOne(
      { _id: source._id },
      {
        $set: {
          lastPolled: new Date(),
          // A null cursor means the window is exhausted; clearing it restarts from now next tick,
          // which is what keeps the crawler tracking the live feed once backfill has caught up.
          lastCursor: page.nextCursor ?? undefined,
          health: "ok",
          updatedAt: new Date(),
        },
      },
    );

    await logScrape({
      correlationId,
      phase: "crawl",
      source: label,
      startedAt,
      ms: Date.now() - startedAt.getTime(),
      // What was STORED, not what was fetched: a source returning 200 documents that all fail the
      // gate is contributing nothing, and "fetched" would hide that behind a healthy-looking number.
      itemsFound: stats.stored,
      budgetHit: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`ERROR polling ${source.platform}:${source.identifier} — ${message}`);

    await logScrape({
      correlationId,
      phase: "crawl",
      source: label,
      startedAt,
      ms: Date.now() - startedAt.getTime(),
      itemsFound: 0,
      budgetHit: false,
      error: message,
    });

    // A permanent failure retires the source immediately. Retrying a slug that does not exist is
    // not politeness, it is waste — and it hides the real failures in the log.
    if (isPermanentSourceError(err)) {
      log(`RETIRED ${source.platform}:${source.identifier} — permanent failure, will not be polled again`);
      await sources.updateOne(
        { _id: source._id },
        { $set: { health: "retired", enabled: false, lastPolled: new Date(), updatedAt: new Date() } },
      );
      return;
    }

    // Otherwise back off rather than hammer. Three strikes and it stops being polled at all until a
    // human looks — a blocked source that keeps being hit is how API access gets revoked.
    const degraded = source.health === "degraded";
    await sources.updateOne(
      { _id: source._id },
      {
        $set: {
          health: degraded ? "blocked" : "degraded",
          pollIntervalMinutes: Math.min(1440, source.pollIntervalMinutes * 2),
          lastPolled: new Date(),
          updatedAt: new Date(),
        },
      },
    );
  }
}

async function tick(): Promise<void> {
  // One id per tick, so every row a single pass wrote can be pulled back together afterwards.
  const correlationId = `tick:${new Date().toISOString()}`;
  const sources = await dueSources(SOURCES_PER_TICK);
  if (sources.length > 0) {
    log(`polling ${sources.length} source(s)`);
    // Sequential on purpose for M1: one source, one platform, and a polite crawler is worth more
    // than a fast one. Per-platform concurrency caps go in when the registry has real breadth.
    for (const s of sources) {
      if (!running) return;
      await pollSource(s, correlationId);
      await refreshSourceYield(String((s as SourceDoc & { _id?: ObjectId })._id)).catch(() => {});
    }
  }

  // Catches anything classified while the embedding provider was unset or failing. Without this
  // those documents would stay lexical-only forever, silently retrievable at half strength.
  if (hasEmbeddingProvider() && running) {
    try {
      const filled = await backfillEmbeddings();
      if (filled > 0) log(`backfilled ${filled} embedding(s)`);
    } catch (err) {
      log(`ERROR backfilling embeddings — ${err instanceof Error ? err.message : err}`);
    }
  }

  // Scraping people, not just posts. Runs every tick regardless of whether a source was polled —
  // the backlog outlives any single crawl, and a tick with nothing due is exactly when there is
  // spare budget to put faces to the names already collected.
  if (running) {
    const startedAt = new Date();
    try {
      const enriched = await enrichPeopleBacklog({ limit: ENRICH_PEOPLE_PER_TICK });
      if (enriched.considered > 0) {
        log(
          `enriched people considered=${enriched.considered} ok=${enriched.enriched} ` +
            `failed=${enriched.failed} unaddressable=${enriched.unaddressable}`,
        );
        await logScrape({
          correlationId,
          phase: "enrich_people",
          source: "people",
          startedAt,
          ms: Date.now() - startedAt.getTime(),
          itemsFound: enriched.enriched,
          budgetHit: enriched.considered >= ENRICH_PEOPLE_PER_TICK,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`ERROR enriching people — ${message}`);
      await logScrape({
        correlationId,
        phase: "enrich_people",
        source: "people",
        startedAt,
        ms: Date.now() - startedAt.getTime(),
        itemsFound: 0,
        budgetHit: false,
        error: message,
      });
    }
  }

  for (let i = 0; i < CLASSIFY_BATCHES_PER_TICK && running; i++) {
    try {
      const stats = await classifyBacklog({});
      if (stats.considered === 0) break;
      log(
        `classified considered=${stats.considered} leads=${stats.leads} none=${stats.none} ` +
          `review=${stats.forReview} embedded=${stats.embedded}`,
      );
    } catch (err) {
      log(`ERROR classifying — ${err instanceof Error ? err.message : err}`);
      break;
    }
  }
}

async function seedSources(): Promise<void> {
  const sources = await Sources();
  const now = new Date();
  // The seed registry. All three are free, permissive by design, and need no registration —
  // deliberately NOT Reddit or X, whose terms are enforced by revoking access entirely.
  //
  // Stack Exchange sites are chosen to span consumer and professional topics as well as technical
  // ones: the network is ~180 sites, and treating it as a developer-only source wastes most of it.
  const seeds: Omit<SourceDoc, "createdAt" | "updatedAt">[] = [
    { platform: "hn", identifier: "all", accessMethod: "api", baseUrl: "https://hn.algolia.com/api/v1", pollIntervalMinutes: 15, health: "ok", docYield30d: 0, enabled: true },
    ...[
      // Every niche, not a shortlist — this is the whole Stack Exchange network, all 166 sites that
      // are currently live and not a meta. A corpus covering ten topics can only find buyers for
      // products in those ten, and the failure is invisible: a founder outside them gets the
      // live-shallow fallback and never learns the corpus simply had nothing for their niche.
      //
      // The list is derived from GET /2.3/sites rather than typed from memory. That matters — of
      // ten slugs guessed by hand for this change, seven did not exist, and "projectmanagement" in
      // the previous seed was one of them (the real slug is "pm"). A wrong slug 400s, gets retired
      // by isPermanentSourceError, and silently never contributes.
      //
      // Ordering is irrelevant: dueSources() sorts by observed yield, so whichever sites actually
      // produce leads rise on their own within a day or two and the rest cost one poll an hour.
      "3dprinting", "academia", "ai", "alcohol", "android", "anime", "apple", "arduino", "askubuntu",
      "astronomy", "aviation", "bicycles", "bioinformatics", "biology", "bitcoin", "blender", "boardgames",
      "bricks", "buddhism", "cardano", "chemistry", "chess", "chinese", "christianity", "civicrm",
      "codegolf", "codereview", "coffee", "computergraphics", "cooking", "craftcms", "crafts", "crypto",
      "cs", "cseducators", "cstheory", "datascience", "dba", "devops", "diy", "drones", "drupal", "dsp",
      "earthscience", "ebooks", "economics", "electronics", "ell", "emacs", "engineering", "english",
      "eosio", "es.stackoverflow", "esperanto", "ethereum", "expatriates", "expressionengine", "fitness",
      "freelancing", "french", "gamedev", "gaming", "gardening", "genealogy", "german", "gis",
      "graphicdesign", "ham", "hermeneutics", "hinduism", "history", "homebrew", "hsm", "iot", "iota",
      "islam", "italian", "ja.stackoverflow", "japanese", "joomla", "judaism", "korean",
      "languagelearning", "latin", "law", "lifehacks", "linguistics", "literature", "magento",
      "martialarts", "math", "matheducators", "mathematica", "mathoverflow.net", "mattermodeling",
      "mechanics", "monero", "money", "movies", "music", "mythology", "networkengineering", "opensource",
      "or", "outdoors", "parenting", "pets", "philosophy", "photo", "physics", "pm", "poker", "politics",
      "portuguese", "psychology", "pt.stackoverflow", "puzzling", "quant", "quantumcomputing",
      "raspberrypi", "retrocomputing", "reverseengineering", "robotics", "rpg", "ru.stackoverflow", "rus",
      "russian", "salesforce", "scicomp", "scifi", "security", "serverfault", "sharepoint", "sitecore",
      "skeptics", "softwareengineering", "softwarerecs", "solana", "sound", "space", "spanish", "sports",
      "sqa", "stackapps", "stackoverflow", "stats", "stellar", "superuser", "sustainability", "tex",
      "tezos", "tor", "travel", "tridion", "ukrainian", "unix", "ux", "vi", "video", "webapps",
      "webmasters", "woodworking", "wordpress", "workplace", "worldbuilding", "writing",
    ].map((site) => ({
      platform: "stackexchange" as const,
      identifier: site,
      accessMethod: "api" as const,
      pollIntervalMinutes: 60,
      health: "ok" as const,
      docYield30d: 0,
      enabled: true,
    })),
    // Discourse instances that are public, active, and run by communities that discuss tooling and
    // process rather than the product hosting the forum.
    //
    // Each host below was verified by actually calling /latest.json before being added — of 42
    // plausible-looking candidates, 11 were not reachable Discourse JSON at all (404, 403, 503, or
    // an HTML login wall), so a hand-written list would have seeded a quarter dead sources.
    ...[
      "community.auth0.com", "community.cloudflare.com", "community.frame.work", "community.grafana.com",
      "community.home-assistant.io", "community.letsencrypt.org", "community.n8n.io",
      "community.openai.com", "community.shopify.com", "community.wanikani.com", "discourse.mozilla.org",
      "discourse.nixos.org", "discuss.circleci.com", "discuss.hashicorp.com", "discuss.python.org",
      "discuss.pytorch.org", "discuss.streamlit.io", "forum.bubble.io", "forum.djangoproject.com",
      "forum.ghost.org", "forum.gitlab.com", "forum.makerforums.info", "forum.manjaro.org",
      "forum.obsidian.md", "forum.photostructure.com", "forum.rclone.org", "forum.snapcraft.io",
      "forums.docker.com", "meta.discourse.org", "talk.tiddlywiki.org", "users.rust-lang.org"
    ].map((host) => ({
      platform: "discourse" as const,
      identifier: host,
      accessMethod: "json" as const,
      baseUrl: `https://${host}`,
      pollIntervalMinutes: 60,
      health: "ok" as const,
      docYield30d: 0,
      enabled: true,
    })),
  ];

  await sources.bulkWrite(
    seeds.map((s) => ({
      updateOne: {
        filter: { platform: s.platform, identifier: s.identifier },
        update: { $setOnInsert: { ...s, createdAt: now, updatedAt: now } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  log(`registry seeded with ${seeds.length} source(s)`);
}

/**
 * Validates the connection string SHAPE before the driver ever tries to use it.
 *
 * Worth doing because the failure modes are otherwise indistinguishable from a network problem:
 * point the worker at an Atlas SQL / Data Federation endpoint and every write fails with a
 * server-selection timeout, which reads exactly like Atlas Network Access blocking the IP. That is
 * an hour of debugging the wrong thing.
 */
function describeMongoUriProblem(uri: string): string | null {
  // atlas-sql-*.a.query.mongodb.net is the Atlas SQL / Data Federation endpoint, meant for BI tools
  // and SQL clients. It is not the cluster, it is read-oriented, and the worker does nothing but
  // write — bulkWrite, createIndex, upserts.
  if (/atlas-sql-|\.query\.mongodb\.net/i.test(uri)) {
    return (
      "this is an Atlas SQL / Data Federation endpoint, not a cluster connection string. " +
      "The worker only writes, and that endpoint cannot accept writes. Use Atlas > your cluster > " +
      "Connect > Drivers, which gives a mongodb+srv:// string."
    );
  }
  if (/mongodb\.net/i.test(uri) && !uri.startsWith("mongodb+srv://")) {
    return (
      "an Atlas host needs the mongodb+srv:// scheme so the driver can discover the replica set. " +
      "A plain mongodb:// against an Atlas hostname will not resolve."
    );
  }
  // No credentials between the scheme and the host.
  const afterScheme = uri.replace(/^mongodb(\+srv)?:\/\//, "");
  if (!afterScheme.includes("@")) {
    return "no username or password in the string — authentication will fail. Copy the full string from Atlas > Connect > Drivers.";
  }
  if (/<password>|<db_password>|<user>/i.test(uri)) {
    return "the placeholder <password> is still in the string — replace it with the real database user's password.";
  }
  return null;
}

async function main(): Promise<void> {
  // Every missing variable at once, not just the first — a crash loop that reveals one problem per
  // deploy is a miserable way to configure a service.
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Add it in Railway > this service > Variables.");
  }
  const uriProblem = describeMongoUriProblem(uri);
  if (uriProblem) {
    throw new Error(`MONGODB_URI looks wrong — ${uriProblem}`);
  }
  if (!process.env.ANTHROPIC_API_KEY) log("WARNING: ANTHROPIC_API_KEY is not set — crawling will run, classification will not.");
  if (!process.env.VOYAGE_API_KEY) log("WARNING: VOYAGE_API_KEY is not set — documents will be stored without embeddings, so retrieval stays lexical-only. They are backfilled automatically once the key is added.");

  log("worker starting");
  // Indexes are a query optimisation, never a precondition for crawling — so a failure here is
  // logged and stepped over rather than thrown. It threw once, and the worker crash-looped
  // indefinitely because one index definition had changed shape.
  await ensureIngestIndexes();

  // The Atlas Search and Vector Search indexes. These were a manual Atlas-console step and the top
  // blocker on the whole retrieval path for months; on M10 with driver v6 they are just a call.
  // Non-fatal like every other index here — retrieval degrading is survivable, a worker that will
  // not start is not.
  for (const r of await ensureSearchIndexes()) {
    if (r.state === "created") log(`search index ${r.name} CREATED — it will take a few minutes to build`);
    else if (r.state === "exists") log(`search index ${r.name} already present`);
    else if (r.state === "unsupported") log(`search index ${r.name} NOT SUPPORTED on this cluster tier — ${r.detail}`);
    else log(`ERROR creating search index ${r.name} — ${r.detail}`);
  }
  // Creation returns before the build finishes, and until `queryable` is true a $search still
  // errors — which pass 1 reads as "missing index" and downgrades to a regex scan. Logging the
  // build state is what makes that window explainable instead of looking like a regression.
  for (const s of await searchIndexStatus()) {
    log(`search index ${s.name}: status=${s.status ?? "?"} queryable=${s.queryable ?? "?"}`);
  }
  try {
    await seedSources();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A server-selection timeout here is almost always one of three things, and the driver's own
    // message names none of them.
    if (/server selection|ENOTFOUND|ETIMEDOUT|querySrv/i.test(message)) {
      throw new Error(
        `cannot reach MongoDB (${message}). Most likely, in order: (1) Atlas > Network Access does ` +
          `not allow Railway's egress IPs — Railway does not egress from Vercel's, so an entry that ` +
          `works for the app does not cover this; (2) the cluster is paused; (3) the connection ` +
          `string points somewhere other than the cluster.`,
      );
    }
    if (/authentication failed|bad auth/i.test(message)) {
      throw new Error(`MongoDB rejected the credentials (${message}). Check the database user's password in the connection string.`);
    }
    throw err;
  }
  log("indexes ensured, sources seeded");

  // SIGTERM is how Railway asks a service to stop. Finishing the current tick rather than dying
  // mid-batch keeps the cursor consistent — a half-written poll would re-read or skip documents.
  const stop = () => {
    log("shutdown requested, finishing current tick");
    running = false;
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  while (running) {
    const started = Date.now();
    try {
      await tick();
    } catch (err) {
      log(`ERROR in tick — ${err instanceof Error ? err.message : err}`);
    }
    const elapsed = Date.now() - started;
    if (running && elapsed < TICK_MS) {
      await new Promise((resolve) => setTimeout(resolve, TICK_MS - elapsed));
    }
  }

  log("worker stopped");
  process.exit(0);
}

main().catch((err) => {
  log("FATAL", err instanceof Error ? err.message : err);
  process.exit(1);
});
