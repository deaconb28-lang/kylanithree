# Kylani search architecture

Target: a product URL plus a few onboarding answers becomes a ranked list of real people who have
described the problem that product solves — first rows in under three seconds, and no HTTP request
ever blocked on crawl work.

## Design principles

1. **Nothing is crawled inside a request.** The search request writes a row and returns an ID. All
   work happens in a durable background workflow.
2. **Discovery is offline; retrieval is online.** Finding and classifying problem-shaped posts runs
   continuously against a curated source list. Query time is index lookup plus reranking. Live
   crawling is a fallback for thin niches only.
3. **Filter early, enrich late.** An intent classifier at ingest discards the overwhelming majority
   of documents before they cost storage or embedding spend. Contact resolution — the most
   expensive per-unit operation — runs only on leads that survive reranking.
4. **Fan-out creates volume.** One prompt becomes 12–20 machine queries. The lead count at the end
   is arithmetic on the fan-out, not cleverness in any single retrieval.
5. **Degrade, never fail.** Every stage has a hard time budget. A stage that blows its budget
   returns what it has and marks the rest pending.

---

## The two decisions, settled

**MongoDB Atlas** for storage and retrieval, **Railway** for the ingestion worker.

What that means in practice is recorded below and in `docs/railway-worker.md`.

### 1. MongoDB Atlas — chosen

The spec is written for Postgres with `pgvector` — HNSW vector index, a generated `tsvector` column
with a GIN index for lexical, `FOR UPDATE SKIP LOCKED` for the job table. **Kylani runs on MongoDB**
(`lib/mongodb.ts`, `lib/collections.ts`, `@auth/mongodb-adapter` for sessions).

The one translation that matters: in Postgres, `documents`, `intents` and `doc_vectors` are three
tables joined at query time. On Atlas they are **one collection** (`corpus`), because both
`$vectorSearch` and `$search` must be the FIRST stage of an aggregation and operate on a single
collection. Splitting them would force a `$lookup` after retrieval, which defeats the point of
having an index at all. The logical model is unchanged; the physical layout is flattened.

Search and Vector Search indexes are cluster-level and cannot be created from the driver — they
live in `docs/atlas-indexes.json` and are applied through the Atlas UI or CLI. Ordinary btree
indexes are created automatically by `ensureIngestIndexes()`.

**Vector Search requires an M10 cluster or above.** It is not on the M0 free tier. Crawling, gating
and classification all work on M0; only retrieval needs the upgrade.

### 2. Railway — chosen

Principle 2 requires something crawling **continuously**, and principle 1 requires a **durable
workflow engine**. Vercel serverless has neither: functions are capped at 60s (see
`docs/` history — that ceiling is what caused the timeouts this architecture is meant to fix), and
there are no long-running workers.

The Next.js app stays on Vercel and reads the index. The worker (`worker/index.ts`, `npm run
worker`) runs on Railway with exactly two environment variables. Deployment and what to watch in
the logs: `docs/railway-worker.md`.

---

## What is built

The pure-logic core, which needs neither decision resolved and works against the existing sources
today.

| Module | What it is |
|---|---|
| `lib/search/intent.ts` | Stage 1 lexical gate, intent taxonomy, weights, spam floor. Versioned. |
| `lib/search/queryPlan.ts` | The fan-out — brief to 16–19 machine queries, plus a model-free fallback plan. |
| `lib/search/rrf.ts` | Reciprocal rank fusion and collapse-to-person. |
| `lib/search/finalScore.ts` | The five-component final score, tier assignment, fallback trigger. |
| `lib/credits/*` | Metering — see `docs/credits.md`. |

**M1 — Hacker News end to end** (`lib/ingest/`, `worker/`):

| Module | What it is |
|---|---|
| `lib/ingest/collections.ts` | `sources`, `corpus`, `people` — the Atlas translation of the spec's schema. |
| `lib/ingest/normalize.ts` | Quote-stripping, language gate, length floor, content hash. |
| `lib/ingest/sources/hackernews.ts` | Cursor-based Algolia crawler, walking backwards in time. |
| `lib/ingest/classify.ts` | Stage 3 batched extraction, including `problemStatement`. |
| `lib/ingest/pipeline.ts` | Ingest pass and classify pass, deliberately separate. |
| `worker/index.ts` | The Railway loop: poll by yield, ingest, drain the classify backlog. |

Wired live: the lexical gate now runs inside `extract.ts` before the expensive model pass, and
planned queries widen each wave's fan-out on top of the lexicon phrases.

Everything is covered by offline tests in `lib/search/__tests__/pipeline.test.mjs` — 95 passing.

### Two bugs the tests caught while writing this

- The hiring need-marker required the verb and the infinitive to be adjacent (`need someone to`),
  so it could not match how anyone actually writes it ("looking to hire **someone** to manage…").
- The gratitude hard-reject was bounded at 60 characters **behind** an 80-character length floor,
  which made it literally unfireable. Real pure-gratitude posts run 80–150 characters and routinely
  contain a need marker, which is exactly the false positive it exists to catch.

## What is not built

- **Embeddings.** `corpus.embedding` is defined and indexed but nothing writes it yet — so
  retrieval today is lexical only. This is the next thing, and it is what M2 turns on.
- **The hybrid retrieval query** — `$vectorSearch` + `$search`, fused with the RRF module that
  already exists.
- **Stage 2** (embedding classifier). The cascade currently runs 1 → 3, skipping the middle, which
  is what the spec prescribes for M1 and gets expensive once the corpus grows.
- Cross-platform person linking (§4.4). Single-platform resolution IS built.
- Durable workflow and wave-based SSE streaming (§8) — the milestone that kills the timeout.
- Enrichment and contact verification (§7).
- Live-crawl fallback with writeback (§6). This is the compounding mechanic: the crawl is a
  commodity, the corpus accumulated from a thousand users exploring their own niches is not.

### Not verified from here

The HN crawler could not be run against the live API: this sandbox's proxy blocks
`hn.algolia.com` at the CONNECT level (403), same as it blocks every other lead source. The parsing,
normalisation, gate and scheduling logic are covered by offline tests; the network call itself is
unproven until the worker runs on Railway. Watch the first few log lines closely — the numbers to
check are in `docs/railway-worker.md`.

## Build order

Follows the spec's own sequencing, which puts **async orchestration before breadth** — fix the
architecture on a small corpus, then scale the corpus. The other order means debugging orchestration
and crawler health simultaneously.

- **M1** — one source end to end (Hacker News via Algolia), normalize → gate → LLM extract → store. **Built.**
- **M2** — embeddings, hybrid index and retrieval, RRF, hardcoded queries. **Next.**
- **M3** — query planner and rerank. *(the pure logic is built; needs the index under it)*
- **M4** — async orchestration and streaming. **The milestone that kills the timeout.**
- **M5** — breadth: Discourse, Stack Exchange, Reddit, source registry, Stage 2 classifier.
- **M6** — enrichment, verification, live-crawl fallback with writeback.

## Legal

Not legal advice; worth a lawyer's hour before scaling.

Hacker News, Discourse forums and Stack Exchange are permissive by design — prefer them. Reddit and
X both have enforced terms on automated access, and the enforcement is losing access entirely.
Review sites (G2, Capterra) are the highest-value corpus for switching signals and the most
aggressively defended; the risk is asymmetric and lands after there is revenue to lose.

Separately: this builds a database of identifiable people and their contact details. GDPR and CCPA
apply regardless of where the data was gathered. Minimum viable: a documented lawful basis, a
deletion path that actually deletes (including from the vector index), and a **suppression list that
survives re-crawling**. Build the suppression list before the index, not after — retrofitting it is
miserable.

Kylani already has a suppression collection (`lib/collections.ts`, `SuppressionDoc`). It must become
an ingest-time filter, not just a send-time one, before any corpus accumulates.
