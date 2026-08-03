import { ObjectId } from "mongodb";
import { Sources, ensureIngestIndexes, logScrape, type SourceDoc } from "../lib/ingest/collections";
import { crawlHackerNews } from "../lib/ingest/sources/hackernews";
import { crawlDiscourse } from "../lib/ingest/sources/discourse";
import { crawlStackExchange } from "../lib/ingest/sources/stackexchange";
import { crawlLemmy } from "../lib/ingest/sources/lemmy";
import { crawlBluesky, BLUESKY_STANDING_QUERIES } from "../lib/ingest/sources/bluesky";
import { crawlReddit } from "../lib/ingest/sources/reddit";
import { blueskyCredentialProblems } from "../lib/search/bluesky";
import {
  backfillEmbeddings,
  classifyBacklog,
  ingestDocuments,
  isInfrastructureFailure,
  refreshSourceYield,
  repairClassifyBacklog,
  unclassifiedCount,
} from "../lib/ingest/pipeline";
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
// Was 20, with 197 sources in the registry — a ceiling of 20 polls a minute could not keep even one
// pass over the registry moving, and the corpus grew at a fraction of its potential.
const SOURCES_PER_TICK = 60;

/**
 * How many sources of one platform may be in flight at once.
 *
 * Polling used to be strictly sequential, with a comment saying per-platform caps would arrive
 * "when the registry has real breadth". It has: 166 Stack Exchange sites and 31 Discourse forums.
 * Sequential polling meant one slow host stalled every other source behind it, and a tick could not
 * finish inside its own 60 seconds.
 *
 * Capped per platform rather than globally, because politeness is per host. Stack Exchange sites
 * are one API with a shared quota, Discourse forums are 31 unrelated servers, and Hacker News is a
 * single endpoint that gets exactly one request at a time.
 */
const CONCURRENCY: Record<string, number> = {
  hn: 1,
  stackexchange: 4,
  discourse: 5,
  // Same reasoning as Discourse: unrelated servers, most of them volunteer-run and small, so the
  // limit is per-host politeness rather than a shared quota.
  lemmy: 5,
  // One account's app password against one API. Bluesky rate-limits per session, and the standing
  // queries are worth nothing individually, so there is no reason to run them side by side.
  bluesky: 1,
  // The most timid entry in the registry, on purpose. Unauthenticated Reddit is rate-limited far
  // harder than a token would be — and Reddit's Responsible Builder Policy means there is no token
  // to get without an approval process, so this access is the only access. Two concurrent requests
  // to save a few seconds is not worth being the reason it stops working.
  reddit: 1,
};
const DEFAULT_CONCURRENCY = 2;
// Classification is the only paid step here. Draining a few batches per tick keeps the backlog
// moving without letting a large crawl spike the Anthropic bill in one go.
//
// Raised with the crawl rate, and it has to be: retrieval only ever reads documents with an
// intentType, so an unclassified document is invisible to search. Crawling faster without
// classifying faster would grow the collection and not the corpus — storage with nothing to show
// for it. 6 batches x 20 documents is 120/tick, which stays ahead of the new poll rate.
const CLASSIFY_BATCHES_PER_TICK = 6;
/**
 * Batches run at once while there is a real backlog to drain.
 *
 * Classification was strictly sequential, so a tick could fit about six model calls into its own 60
 * seconds and no more — fine for keeping up with the crawl, useless for clearing a backlog of
 * thousands. Three at a time with a deeper batch count turns roughly 120 documents a tick into
 * roughly 480, which is the difference between draining 6,700 documents in an hour and in five.
 *
 * Capped at 3 rather than opened up: this is the only paid step in the worker, and the point is to
 * drain a backlog in an evening, not to spend a month's classification budget in ten minutes.
 */
const CLASSIFY_CONCURRENCY = 3;
/** Batches per tick while catching up. Ignored once the backlog is small. */
const CLASSIFY_CATCHUP_BATCHES = 12;
/** Above this many unclassified documents, the classifier runs in catch-up mode. */
const CLASSIFY_CATCHUP_THRESHOLD = 500;
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
            : source.platform === "lemmy"
              ? await crawlLemmy({ host: source.identifier, cursor: source.lastCursor })
              : source.platform === "bluesky"
                ? // The identifier IS the standing query — Bluesky has no communities to enumerate.
                  await crawlBluesky({ query: source.identifier, cursor: source.lastCursor })
                : source.platform === "reddit"
                  ? await crawlReddit({ subreddit: source.identifier, cursor: source.lastCursor })
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

/** Runs `work` over `items`, at most `limit` at a time. Stops early if the worker is shutting down. */
async function pool<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      if (!running) return;
      const i = next++;
      if (i >= items.length) return;
      await work(items[i]);
    }
  });
  await Promise.all(runners);
}

async function tick(): Promise<void> {
  // One id per tick, so every row a single pass wrote can be pulled back together afterwards.
  const correlationId = `tick:${new Date().toISOString()}`;
  const sources = await dueSources(SOURCES_PER_TICK);
  if (sources.length > 0) {
    // Grouped by platform, each group with its own cap, all groups running at once. A slow
    // Discourse host now delays only the other Discourse hosts behind it in its own lane, instead
    // of every Stack Exchange site in the tick.
    const byPlatform = new Map<string, SourceDoc[]>();
    for (const s of sources) {
      const list = byPlatform.get(s.platform);
      if (list) list.push(s);
      else byPlatform.set(s.platform, [s]);
    }
    log(`polling ${sources.length} source(s) across ${byPlatform.size} platform(s)`);

    await Promise.all(
      [...byPlatform.entries()].map(([platform, list]) =>
        pool(list, CONCURRENCY[platform] ?? DEFAULT_CONCURRENCY, async (s) => {
          await pollSource(s, correlationId);
          await refreshSourceYield(String((s as SourceDoc & { _id?: ObjectId })._id)).catch(() => {});
        }),
      ),
    );
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

  await classifyPass();
}

/**
 * Drain the classify backlog for one tick.
 *
 * Retrieval only reads documents that have an `intentType`, so this is the step that decides
 * whether a crawled document is reachable at all. Everything else in the tick grows the collection;
 * this is what grows the corpus.
 *
 * Two modes. Keeping up with the crawl needs a handful of sequential batches. Clearing a backlog of
 * thousands needs concurrency, because each batch is a model call of ten to twenty seconds and six
 * of them in series is the whole tick.
 */
async function classifyPass(): Promise<void> {
  let backlog = 0;
  try {
    backlog = await unclassifiedCount();
  } catch {
    // The count is an optimisation, not a precondition — fall through to the steady-state mode.
  }
  const catchUp = backlog > CLASSIFY_CATCHUP_THRESHOLD;
  const budget = catchUp ? CLASSIFY_CATCHUP_BATCHES : CLASSIFY_BATCHES_PER_TICK;
  const width = catchUp ? CLASSIFY_CONCURRENCY : 1;
  if (catchUp) log(`classify catch-up: ${backlog} unclassified, ${budget} batches ${width} at a time`);

  // Set by any worker in the group to stop the whole pass: an empty backlog (nothing left to do) or
  // an infrastructure failure (nothing will work this tick, so retrying it 11 more times is just
  // noise in the log and load on an API that is already unhappy).
  let stop = false;
  let done = 0;

  await Promise.all(
    Array.from({ length: Math.min(width, budget) }, async () => {
      for (;;) {
        if (stop || !running || done >= budget) return;
        done += 1;
        try {
          const stats = await classifyBacklog({});
          if (stats.considered === 0) {
            stop = true;
            return;
          }
          log(
            `classified considered=${stats.considered} leads=${stats.leads} none=${stats.none} ` +
              `review=${stats.forReview} embedded=${stats.embedded}`,
          );
        } catch (err) {
          log(`ERROR classifying — ${err instanceof Error ? err.message : err}`);
          // An infrastructure failure ends the pass; a content failure has already charged its
          // batch an attempt, and the next batch is a different set of documents worth trying.
          if (isInfrastructureFailure(err)) stop = true;
          return;
        }
      }
    }),
  );
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
    // 5 minutes, down from 15. Algolia's HN index needs no auth, has generous limits, and is one
    // endpoint polled one request at a time — it is the cheapest volume in the whole registry.
    { platform: "hn", identifier: "all", accessMethod: "api", baseUrl: "https://hn.algolia.com/api/v1", pollIntervalMinutes: 5, health: "ok", docYield30d: 0, enabled: true },
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
      // 45 minutes, down from 60, and the arithmetic matters here because this is the one platform
      // with a hard quota. 166 sites at 45min is ~5,300 requests/day against a keyed limit of
      // 10,000 — which deliberately leaves room for people enrichment, which spends the same quota
      // one profile at a time. Going to 20 minutes would put crawling alone over the limit and the
      // failure would present as sources mysteriously degrading, not as a quota error.
      pollIntervalMinutes: 45,
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
      // 30 minutes, down from 60. These are 31 unrelated servers rather than one shared API, so
      // the constraint is per-host politeness rather than a global quota — and a Discourse poll
      // costs one list request plus a fetch per new topic, which is why it is not lower.
      pollIntervalMinutes: 30,
      health: "ok" as const,
      docYield30d: 0,
      enabled: true,
    })),
    // Lemmy — the open-door substitute for the source this product most obviously wants and least
    // plausibly gets. Reddit is paid, its terms are enforced by revoking access, and it answers 403
    // to datacenter traffic; Lemmy is the same shape of conversation with none of that.
    //
    // Every host below answered `/api/v3/post/list` unauthenticated when this list was written —
    // 17 of 20 candidates did, and the three that did not failed in three different ways (HTML at
    // the API path, `instance_is_private`, a Cloudflare interstitial). Verified by calling them,
    // the same discipline the Stack Exchange and Discourse lists were rebuilt under, and for the
    // same reason: a hand-written list seeds dead sources that fail silently.
    ...[
      "lemmy.world", "lemmy.ml", "sh.itjust.works", "programming.dev", "beehaw.org", "sopuli.xyz",
      "feddit.org", "lemmy.dbzer0.com", "hexbear.net", "lemmy.zip", "discuss.tchncs.de",
      "midwest.social", "slrpnk.net", "reddthat.com", "lemmy.sdf.org", "startrek.website",
      "lemmy.blahaj.zone",
    ].map((host) => ({
      platform: "lemmy" as const,
      identifier: host,
      accessMethod: "api" as const,
      baseUrl: `https://${host}`,
      // 20 minutes. A poll is ONE request returning up to 50 posts — no per-item fetch, unlike
      // Discourse — so it is much cheaper per document than anything else in the registry, which is
      // what buys the shorter interval.
      pollIntervalMinutes: 20,
      health: "ok" as const,
      docYield30d: 0,
      enabled: true,
    })),
    // Bluesky, where the crawl unit is a phrase rather than a place. See sources/bluesky.ts —
    // there are no communities to enumerate on a flat network, so the standing queries ARE the
    // registry, and a phrase that yields nothing sinks in the scheduler's own ordering.
    // Reddit, through the public `.json` endpoints — see lib/ingest/sources/reddit.ts for why that
    // path rather than OAuth (the Responsible Builder Policy closed self-service credentials).
    //
    // UNVERIFIED, unlike every other list in this file. The Stack Exchange, Discourse and Lemmy
    // registries were each built by calling the API and keeping what answered; reddit.com is
    // blocked by the sandbox's egress policy, so these slugs could not be probed the same way.
    // They are well-known communities rather than guesses, but the honest status is "expected to
    // exist", and the registry is built to survive being wrong about that: a subreddit that does
    // not exist answers 404, which `crawlReddit` raises as a PermanentSourceError, and the source
    // retires itself on its first poll. Read the first tick's log rather than trusting this list.
    //
    // Chosen for people describing operational pain in public — the trades, agencies, practices and
    // back-office roles that buy software to stop doing something by hand. Deliberately not the
    // big general technology subreddits, which are mostly discussion rather than need.
    ...[
      "smallbusiness", "Entrepreneur", "startups", "SaaS", "ecommerce", "shopify", "Etsy",
      "dropship", "FulfillmentByAmazon", "consulting", "freelance", "marketing", "SEO", "PPC",
      "digital_marketing", "sales", "accounting", "Bookkeeping", "tax", "humanresources",
      "recruiting", "projectmanagement", "ProductManagement", "agency", "msp", "sysadmin",
      "devops", "webdev", "web_design", "graphic_design", "photography", "videography",
      "copywriting", "nonprofit", "realtors", "RealEstate", "PropertyManagement", "restaurateur",
      "Construction", "Contractor", "HVAC", "electricians", "Plumbing", "landscaping",
      "logistics", "supplychain", "manufacturing", "dentistry", "physicaltherapy", "therapists",
      "lawfirm", "paralegal", "veterinary", "gyms", "personaltraining", "eventplanning",
      "catering", "Trucking", "fleetmanagement",
    ].map((subreddit) => ({
      platform: "reddit" as const,
      identifier: subreddit,
      accessMethod: "json" as const,
      baseUrl: "https://www.reddit.com",
      // 60 minutes, and this is the arithmetic that keeps the source alive. 60 subreddits at one
      // request each per hour is one request a minute against an unauthenticated limit that is
      // measured in tens per minute — an order of magnitude of headroom, deliberately, because
      // there is no keyed tier to fall back to if Reddit decides this is too much.
      pollIntervalMinutes: 60,
      health: "ok" as const,
      docYield30d: 0,
      enabled: true,
    })),
    //
    // Seeded ONLY when credentials exist. Without them every poll throws, and two throws is all it
    // takes for `pollSource`'s backoff to mark a source `blocked` — so seeding these on a worker
    // with no app password would bury twenty rows that never recover on their own once the
    // password is finally set. Nothing is seeded and a warning is logged instead.
    ...(process.env.BLUESKY_IDENTIFIER && process.env.BLUESKY_APP_PASSWORD ? BLUESKY_STANDING_QUERIES : []).map((query) => ({
      platform: "bluesky" as const,
      identifier: query,
      accessMethod: "api" as const,
      baseUrl: "https://bsky.social",
      // 15 minutes across 20 phrases is ~1,900 requests/day on one session, which is well inside
      // Bluesky's limits and keeps each phrase tracking the live feed rather than backfilling.
      pollIntervalMinutes: 15,
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
  // Seeding is $setOnInsert, so every source already in the registry keeps whatever interval it was
  // created with. Without this, changing the defaults above would silently do nothing at all for
  // the 197 sources that already exist — the change would look applied and have no effect.
  //
  // Healthy sources only. A degraded or blocked source has had its interval deliberately doubled by
  // the backoff in pollSource, and resetting that here would undo the one mechanism that stops the
  // crawler hammering a host that is already unhappy with it.
  // A credential that was wrong is not a source that is dead.
  //
  // While BLUESKY_APP_PASSWORD was rejected, every standing query failed twice and the backoff in
  // pollSource marked it `blocked` — correct behaviour for a host that does not want us, and wrong
  // here, because the fix is a variable rather than anything about the source. Nothing else would
  // ever revive them: `dueSources` skips blocked rows, so fixing the password would have left 20
  // permanently silent sources and no error to explain it.
  //
  // Only Bluesky, and only when credentials are present. This does NOT touch the other platforms'
  // backoff, which is doing exactly its job.
  if (process.env.BLUESKY_IDENTIFIER && process.env.BLUESKY_APP_PASSWORD) {
    const revived = await sources.updateMany(
      { platform: "bluesky", health: { $in: ["degraded", "blocked"] } },
      { $set: { health: "ok", pollIntervalMinutes: 15, updatedAt: new Date() } },
    );
    if (revived.modifiedCount > 0) {
      log(`revived ${revived.modifiedCount} bluesky source(s) that a rejected credential had blocked`);
    }
  }

  const intervals: Record<string, number> = { hn: 5, stackexchange: 45, discourse: 30, lemmy: 20, bluesky: 15, reddit: 60 };
  for (const [platform, minutes] of Object.entries(intervals)) {
    const res = await sources.updateMany(
      { platform, health: "ok", pollIntervalMinutes: { $gt: minutes } },
      { $set: { pollIntervalMinutes: minutes, updatedAt: new Date() } },
    );
    if (res.modifiedCount > 0) log(`retimed ${res.modifiedCount} ${platform} source(s) to ${minutes}min`);
  }

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
  if (!process.env.BLUESKY_IDENTIFIER || !process.env.BLUESKY_APP_PASSWORD) {
    log(
      "WARNING: BLUESKY_IDENTIFIER / BLUESKY_APP_PASSWORD are not set — the Bluesky standing " +
        "queries will not be seeded. searchPosts answers 403 to unauthenticated datacenter traffic, " +
        "so there is no unkeyed mode to fall back to. Set both and restart to add the source.",
    );
  } else {
    // Checked at startup rather than only on the first 401, because a shape problem is knowable
    // before spending a login attempt on it — and a bad login is the expensive kind of mistake
    // here, since Bluesky rate-limits failures and the account is shared by 20 sources.
    for (const problem of blueskyCredentialProblems()) {
      log(`WARNING: ${problem}`);
    }
  }
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

  // Undo the credit outage before the first tick.
  //
  // While the Anthropic balance was empty every batch threw, and the old catch charged all 20 of
  // its documents a failed attempt — so thousands of good documents burned through all three and
  // dropped out of the backlog query permanently. They were never judged; they were billed for the
  // API being down. This puts them back, once, and stamps them so a genuinely unclassifiable
  // document cannot loop forever on it.
  try {
    const repaired = await repairClassifyBacklog();
    if (repaired.unblocked > 0 || repaired.staged > 0) {
      log(
        `classify backlog repaired: ${repaired.unblocked} document(s) unblocked after an outage ` +
          `burned their retries, ${repaired.staged} staged that had never entered the queue`,
      );
    }
    log(`${await unclassifiedCount()} document(s) waiting on a verdict`);
  } catch (err) {
    // Never fatal. A worker that will not start because a repair failed is strictly worse than one
    // that crawls and classifies at the old rate.
    log(`WARNING: classify backlog repair failed — ${err instanceof Error ? err.message : err}`);
  }

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
