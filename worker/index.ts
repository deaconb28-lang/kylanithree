import { ObjectId } from "mongodb";
import { Sources, ensureIngestIndexes, type SourceDoc } from "../lib/ingest/collections";
import { crawlHackerNews } from "../lib/ingest/sources/hackernews";
import { crawlDiscourse } from "../lib/ingest/sources/discourse";
import { crawlStackExchange } from "../lib/ingest/sources/stackexchange";
import { backfillEmbeddings, classifyBacklog, ingestDocuments, refreshSourceYield } from "../lib/ingest/pipeline";
import { hasEmbeddingProvider } from "../lib/ingest/embed";

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

async function pollSource(source: SourceDoc & { _id?: ObjectId }): Promise<void> {
  const sources = await Sources();
  const id = String(source._id);

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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`ERROR polling ${source.platform}:${source.identifier} — ${message}`);
    // Back off rather than hammer. Three strikes and it stops being polled at all until a human
    // looks — a blocked source that keeps being hit is how API access gets revoked.
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
  const sources = await dueSources(SOURCES_PER_TICK);
  if (sources.length > 0) {
    log(`polling ${sources.length} source(s)`);
    // Sequential on purpose for M1: one source, one platform, and a polite crawler is worth more
    // than a fast one. Per-platform concurrency caps go in when the registry has real breadth.
    for (const s of sources) {
      if (!running) return;
      await pollSource(s);
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
      "workplace",
      "money",
      "freelancing",
      "webmasters",
      "softwarerecs",
      "productivity",
      "cooking",
      "gardening",
      "photo",
      "diy",
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
    ...[
      "meta.discourse.org",
      "forum.obsidian.md",
      "community.n8n.io",
      "forum.rclone.org",
      "community.home-assistant.io",
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

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set.");
  if (!process.env.ANTHROPIC_API_KEY) log("WARNING: ANTHROPIC_API_KEY is not set — crawling will run, classification will not.");

  log("worker starting");
  await ensureIngestIndexes();
  await seedSources();
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
