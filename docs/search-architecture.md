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

## Two decisions block the rest of this

Neither can be worked around in code, and both change everything downstream.

### 1. Postgres + pgvector, or MongoDB Atlas?

The spec is written for Postgres with `pgvector` — HNSW vector index, a generated `tsvector` column
with a GIN index for lexical, `FOR UPDATE SKIP LOCKED` for the job table. **Kylani runs on MongoDB**
(`lib/mongodb.ts`, `lib/collections.ts`, `@auth/mongodb-adapter` for sessions).

Two honest options:

- **Move to Postgres.** Everything in the spec then works verbatim. Cost: migrating the campaign,
  lead, community and auth data, and swapping the Auth.js adapter.
- **Stay on Mongo Atlas.** Atlas has `$vectorSearch` and Atlas Search, so hybrid retrieval is
  achievable — but the schema, the fusion query and the job table all need rewriting, and Atlas
  Search is a different beast from a GIN index on a tsvector.

I have not chosen one. Picking wrong here is a rewrite, not a refactor.

### 2. Where do the continuous crawlers run?

Principle 2 requires something crawling **continuously**, and principle 1 requires a **durable
workflow engine**. Vercel serverless has neither: functions are capped at 60s (see
`docs/` history — that ceiling is what caused the timeouts this architecture is meant to fix), and
there are no long-running workers.

So the ingestion half needs a home: a small always-on box (Railway/Fly/Render), or Inngest /
Trigger.dev for the workflow plus scheduled functions for the crawl loop. The Next.js app stays on
Vercel and reads the index.

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

Wired live: the lexical gate now runs inside `extract.ts` before the expensive model pass, and
planned queries widen each wave's fan-out on top of the lexicon phrases.

Everything is covered by offline tests in `lib/search/__tests__/pipeline.test.mjs` — 89 passing.

### Two bugs the tests caught while writing this

- The hiring need-marker required the verb and the infinitive to be adjacent (`need someone to`),
  so it could not match how anyone actually writes it ("looking to hire **someone** to manage…").
- The gratitude hard-reject was bounded at 60 characters **behind** an 80-character length floor,
  which made it literally unfireable. Real pure-gratitude posts run 80–150 characters and routinely
  contain a need marker, which is exactly the false positive it exists to catch.

## What is not built

- The `sources` registry, scheduler and adaptive polling (§2).
- The document store, intent table, and the hybrid index — blocked on decision 1.
- Stage 2 (embedding classifier) and Stage 3 (LLM extraction with `problem_statement`). Stage 3's
  normalised statement is the key idea: embedding it alongside the raw body collapses the vocabulary
  gap between how people complain and how founders describe their product.
- Person resolution and cross-platform linking (§4.4).
- Durable workflow, wave-based SSE streaming, budget enforcement — blocked on decision 2.
- Enrichment and contact verification (§7).
- Live-crawl fallback with writeback (§6). This is the compounding mechanic: the crawl is a
  commodity, the corpus accumulated from a thousand users exploring their own niches is not.

## Build order

Follows the spec's own sequencing, which puts **async orchestration before breadth** — fix the
architecture on a small corpus, then scale the corpus. The other order means debugging orchestration
and crawler health simultaneously.

- **M1** — one source end to end (Hacker News via Algolia), normalize → gate → LLM extract → store.
- **M2** — hybrid index and retrieval, RRF, hardcoded queries.
- **M3** — query planner and rerank. *(the pure logic for this is built)*
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
