# The ingestion worker on Railway

The Next.js app stays on Vercel. The crawler runs on Railway, because it needs to run continuously
and hold state between polls — neither of which serverless does. Vercel's 60s function ceiling is
the specific thing this split exists to route around.

## What the worker does

One loop, every 60 seconds:

1. Selects sources that are due, **highest-yield first** — so when it is behind, the productive
   sources are the ones that still get served.
2. Crawls each one and runs the ingest pass: normalize → dedupe → Stage 1 lexical gate → store.
   No model calls, so a crawl is never blocked on the classifier.
3. Drains up to three batches of the classification backlog (Stage 3, 20 documents per call).

Ingest and classification are deliberately separate passes. If the classifier is slow, rate-limited
or down, the backlog just grows and drains later — coupling them would turn every model outage into
a crawl outage.

## Deploying

Railway → New Project → Deploy from GitHub repo → this repo, branch
`claude/kylanithree-data-organization-v7j15s`.

**Settings → Start Command:**

```
npm run worker
```

`railway.json` in the repo root already sets the build and start command, so Railway needs no
manual configuration beyond variables.

**Settings → Variables:**

| Variable | Required | Value |
|---|---|---|
| `MONGODB_URI` | yes | the same Atlas connection string Vercel uses |
| `ANTHROPIC_API_KEY` | yes | the same key Vercel uses — Stage 3 classification |
| `VOYAGE_API_KEY` | for semantic search | embeddings. Without it the corpus is lexical-only |
| `STACKEXCHANGE_KEY` | optional | free, and raises the SE quota substantially |

It never serves HTTP, so it needs no port, no domain and no `AUTH_URL`.

Without `VOYAGE_API_KEY` everything still runs — crawling, gating, classification — and retrieval
falls back to lexical only. That is a real degradation rather than a failure: name lookups still
work, paraphrase matching does not. The worker backfills embeddings for anything classified while
the key was missing, so adding it later costs nothing.

**Atlas Network Access:** Railway egresses from its own IPs, not Vercel's. Either add Railway's
egress range or allow `0.0.0.0/0` for now — a connection refused here looks exactly like a bad URI
in the logs, so rule it out first.

## Watching it

The worker logs one line per poll and one per classify batch:

```
2026-08-01T09:14:01.004Z registry seeded with 16 source(s)
2026-08-01T09:14:02.113Z hn:all fetched=100 stored=31 gate=54 short=12 lang=3 dupe=0
2026-08-01T09:14:08.220Z stackexchange:workplace fetched=50 stored=19 gate=24 short=7 lang=0 dupe=0
2026-08-01T09:14:15.771Z discourse:forum.obsidian.md fetched=15 stored=4 gate=9 short=2 lang=0 dupe=0
2026-08-01T09:14:19.882Z classified considered=20 leads=6 none=14 review=3 embedded=6
```

What to look for in the first hour:

- **`gate` should dominate `stored`.** The lexical gate is tuned for recall and still rejects most
  of what it sees. If `gate` is near zero, the gate is not firing and the corpus is filling with
  noise.
- **`leads` vs `none`.** Stage 3 is strict by design — a majority of `none` is correct. If almost
  everything comes back `leads`, the classifier prompt has gone soft.
- **`review`** is the count landing in the 0.4–0.7 confidence band. That is the label queue; the
  spec's flywheel depends on someone actually reading 50 of them a week.

### The seeded registry

The worker seeds 16 sources on first start: Hacker News, ten Stack Exchange sites, and five public
Discourse forums. All three platforms are free, permissive by design, and need no registration.

Deliberately **not** Reddit or X. Both have enforced terms on automated access and the enforcement
is losing access entirely, which is an asymmetric risk to take before there is anything to lose.
They can be added to the registry later as ordinary rows.

The Stack Exchange sites deliberately span consumer and professional topics (`cooking`, `money`,
`workplace`, `freelancing`, `gardening`) as well as technical ones. The network is ~180 sites, and
treating it as a developer-only source wastes most of it.

Sources adapt their own poll interval from observed yield, so a site producing nothing settles to
daily on its own and stops competing for crawl budget.

## Before it is worth running

**Create the Atlas Search and Vector Search indexes** from `docs/atlas-indexes.json`. Ordinary
indexes are created automatically on worker start; those two are cluster-level and cannot be created
from the driver.

**Vector Search needs an M10 cluster or above** — it is not on the M0 free tier. That is the one
hard infrastructure cost in this architecture and it is worth confirming before building further
against it. Crawling, gating and classification all work on M0; only retrieval needs the upgrade.

## Cost shape

The worker's standing cost is Stage 3 classification, and it scales with **corpus growth**, not with
user activity. The lexical gate is what keeps that line flat — every point of precision added at
Stage 1 compounds across everything downstream, which is why the gate is versioned and worth tuning
weekly early on.

At the default 60s tick with one source, expect a few hundred documents an hour and a handful of
classification batches — small money. It scales linearly with sources added, so watch it when the
registry grows in M5.
