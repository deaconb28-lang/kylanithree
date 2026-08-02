# Kylani — project handoff

This doc exists so a new Claude Code session can pick this project up cold. Read it in full before
making changes. It is loaded automatically via `CLAUDE.md`.

---

## The pitch

**Kylani finds a founder's first hundred buyers and writes to each one, in the founder's own voice,
from their own inbox.**

Early-stage founders don't have a lead-gen problem, they have a *going-looking* problem — their
buyers are already out there complaining on Reddit, asking in Slack communities, posting job ads
that describe the exact pain the product solves. Nobody has time to find them one at a time, and
generic outbound (mail-merge blasts, scraped lists) reads as spam because it is.

Paste your URL. Kylani reads the site, works out who's likely to buy, then goes looking for those
people across Reddit, Bluesky, Hacker News, Stack Exchange, Quora, Discourse forums and job boards.
For each lead it drafts a specific, warm, non-salesy message anchored to something that person
actually said. The founder approves, edits or drops each draft; nothing sends automatically.
Approved messages go out from the founder's own Gmail (OAuth), so replies land in their real inbox.

This is a demo/portfolio build of that product, not a live company — treat "Kylani" as the real
product it's pretending to be, but never fabricate data (see Design principles).

---

## STATE OF PLAY — read this first

Branch: **`claude/kylanithree-data-organization-v7j15s`** (NOT `main` — `main` has only a
placeholder README; all real code is here, and Vercel's Production Branch is set to this branch).

Everything below is committed and pushed. `tsc`, `eslint`, `next build` and 111 tests are green as
of `d7c42be`.

Recent history, newest first:

```
d7c42be Fraunces everywhere, no invented counts, no logo plates
882c32c Editorial hero: a display headline over a field of found buyers
7a3fa1e Never cache a failed Mongo connection
ff6d03a Make ?error=Configuration say what is actually wrong
387159f Cut the homepage demo, draw the search, and a design-system pass
a18ad44 Discover: the one-screen onboarding, end to end
b8bee50 Discover: niche map, pass 1, and the merge policy
```

### Explee — the details finally arrived, and it is not what the old handoff assumed

The three blockers are answered. The env var is **`EXPLEE_API_KEY`**, the base URL is
**`https://api.explee.com`**, auth is the header `X-API-Key: <key>` on every request, and the API
documents itself: `/public/api/llms.txt` is the prose guide and `/public/api/openapi.json` the full
schema. **Read the guide before calling** — it is written for agents and describes the whole id
chain (projects → campaigns → leads). `api.explee.com` **is** reachable from the sandbox even
though `explee.com` is not.

**But it is not a lead source.** Explee is a B2B outreach platform that runs campaigns end to end —
projects → campaigns → leads/inbox, with budgets, autopilot, start/stop and analytics. The old
handoff called it a "scraper" to slot into `lib/search/` or `lib/ingest/sources/`; nothing seen so
far supports that reading. It does have `/search/people`, `/search/companies` and `/enrich/*`
endpoints, which *could* back a Kylani lead source — but **no such integration has been asked for
or built**, and the user's actual request was to operate their account, not to wire it into the
product. Do not build the scraper on the strength of the old note alone; confirm first.

Nothing is stored in this repo. The key belongs in Railway/Vercel env only — it has been pasted
into chat once already and should be treated as compromised until rotated.

As of the last check the account was **empty**: `GET /autogtm/projects`, `/autogtm/campaigns` and
`/autogtm/hot-leads` all returned `total: 0` on HTTP 200 (a deliberately invalid key returns 401,
so the emptiness is real and not an auth artifact). There is nothing to summarise or operate on
until projects exist.

### Apollo — business records (`lib/enrich/`)

Company firmographics for the org behind a lead: industry, headcount, location, funding, tech stack.
`LeadDoc.company` is a bare name with nothing behind it; this is what fills that in.

**Everything here was verified against the live API, not recalled** — the same discipline the SE
filter id needed. Specifics worth not re-deriving:

- **The env var is `apollo_one`** — lowercase. Read out of Railway with the MCP, not guessed;
  `APOLLO_API_KEY` and `APOLLO_ONE` are accepted as fallbacks so a rename cannot silently disable it.
- **Auth is the `x-api-key` request header.** Not Bearer, not an `api_key` query param.
- **Endpoint existence is checkable without a key**, and this trick is worth keeping: a real path
  answers `{"error":"Api key required"}`, an invented one returns an **empty body**. That is how
  `/api/v1/organizations/job_postings` was caught — it sounds right and does not exist. Confirmed
  real: `organizations/enrich` (GET, `?domain=`), `organizations/bulk_enrich`,
  `organizations/search`, `mixed_companies/search`, `people/match`, `people/bulk_match`,
  `mixed_people/search`, `auth/health`.
- `/api/v1/auth/health` **answers unauthenticated**, so "Apollo is up" and "our key works" are
  different questions. `apolloHealth()` returns both — `keyValid` is the one that catches a revoked
  key, and `/api/health` reports it.

**Caching is a cost requirement, not an optimisation.** Apollo bills a credit per enrichment, so
`lib/enrich/companies.ts` is the only thing that may call it: records cached 90 days, **misses
cached 30** (without that, a domain Apollo has never heard of is re-bought on every lead from that
company forever). A **402/429 is never cached** — "out of credits" written down as "no such company"
would poison the store for everything looked up during a stall. A stale hit is served in preference
to nothing, and an unavailable domain is left absent from the batch map rather than mapped to
`null`, because absent means "unknown" and null means "Apollo says there is nothing".

**Verified end to end against production.** The sandbox has no Apollo key — Railway and Vercel both
redact values — so the happy path was confirmed on the deployment that does, via
`GET /api/health?apollo=probe`:

```
$ curl -sS "https://www.kylani.app/api/health?apollo=probe"
  keyValid: true
  populated: all 23 normalized fields    missing: []
  sample: Stripe · information technology & services · 8000 employees · founded 2010 · United States
```

That probe is the tool to reach for whenever the mapping is in doubt. It **spends one Apollo credit
per call**, which is why it is opt-in behind a query parameter rather than part of the health check
uptime monitors hit; `?domain=` picks a different company. An empty `populated` list would mean the
mapping broke even though the request succeeded — the silent failure worth watching for, since
Apollo renaming a field would present as "this company has no data" rather than as an error.

Running the equivalent `curl` locally proves nothing: there is no key in the sandbox, so it just
returns `{"error":"Api key required"}`.

### Also outstanding

- ~~Atlas Search + Vector Search indexes~~ — **done, and the shallow pass now reads the database.**
  The cluster is on M10, and the indexes are created by the worker rather than by hand:
  `lib/ingest/searchIndexes.ts` calls the driver's `createSearchIndex`, which works on M10+ with
  driver v6. The old note that "the driver cannot create them" was true of the free tier and is not
  true now. Verified in production:
  - `/api/health` → `searchIndexes` reports both `corpus_lexical` and `corpus_vector` as
    `READY / queryable`. **`queryable` is the field that matters** — creation returns immediately
    while the build takes minutes, and until it flips, `$search` still errors and pass 1 quietly
    downgrades to the regex scan.
  - A live `POST /api/discover` on linear.app then reported
    `corpusRoute: "search", corpusLeads: 36, usedCorpus: true, usedLive: false, ms: 299`.
    **`usedLive: false` is the whole point**: the shallow pass no longer touches the internet. Before
    the indexes existed the same product returned 2 leads from live sources.
  - The regex branch in `fromCorpus()` is now dead weight on a working cluster. Leave it one more
    cycle in case the indexes are rebuilt, then delete it.

- **Rotate the Bluesky app password.** It was pasted into chat in an earlier session.
- Founder/Studio plan naming is undecided, which blocks the billing half of the credits system
  (`lib/credits/`, `docs/credits.md`). Metering works and records; nothing is debited.
- ~~Google sign-in failing with `?error=Configuration`~~ — **resolved.** `MONGODB_URI` is set in
  production and `/api/health` now reports `mongo.ok: true` (~115ms, database `kylani`, 4 users),
  `googleOAuth.configurationErrorCause: null`, and `summary.signupAndGoogleSignIn: "should work"`.
  The onboarding flow was verified end to end against production afterwards: `POST /api/discover`
  returns 202 and the SSE stream runs inference → leads → venues → `complete` with real Hacker News
  permalinks. Nothing in that path errors any more.
- **`STACKEXCHANGE_KEY` is set on the Railway worker but NOT on Vercel.** `/api/health` reports the
  Vercel app, so it shows `stackExchange.keyed: false` — which reads as "not configured anywhere"
  and is wrong. People-enrichment and crawling run on the worker and *are* keyed (10,000 req/day);
  it is the query-time Stack Exchange search on Vercel that is capped at 300/day/IP. Set it on
  Vercel too. **Check both services before concluding a variable is missing** — the two deploy
  targets have different environments, and `/api/health` can only see one of them.

### Lead quality: keyword routing is the weak spot

`lib/search/seSites.ts` maps a product's inferred keywords to Stack Exchange sites, and it has now
produced two distinct bugs of the same family. Both were found by running the real flow against
production, not by reading the code.

1. **Substring matching.** `haystack.includes(k)` had no word boundaries, so "s**cat**tered feature
   requests" routed an issue tracker to **Pets**, and "communi**cat**ion" did the same to every CRM.
   Fixed with a whole-word regex that still allows `s/es/ing/ed`.
2. **Generic vocabulary.** Boundaries alone did not save it: "roadmap planning **tools**" is a real
   whole-word match for DIY's `tool`, and "**grow** revenue" / "**seed** round" are real matches for
   Gardening. Those keywords are gone; a keyword only belongs here if it is unlikely to appear in a
   sentence about software.

Both are covered in `lib/search/__tests__/people.test.mjs`. **When adding a keyword, ask whether a
B2B SaaS landing page could contain it** — that is the failure mode, and it is silent, because a
wrong site returns few results rather than an error. A dev tool now correctly matches no Stack
Exchange site at all and falls through to HN/Lemmy/Bluesky; routing it to `stackoverflow` would need
keywords about pain rather than about technology, which is a real gap but not a bug.

### Settled — do not re-raise

- **"312 founders" on the landing page stays.** It appears in `Hero.tsx`, `Testimonials.tsx` and
  `RevenueFindings.tsx`, and it does read as a counter-example to design principle 1 below, so every
  cold session finds it and flags it. It was put to the user directly and the answer was to leave it
  for now. Propose a change if you have a reason, but do not treat it as an unnoticed bug.
- **This branch is the one that ships.** `claude/kylanithree-data-organization-v7j15s` is both where
  the work lives and Vercel's Production Branch. A session may be assigned a different working
  branch; `main` holds only a placeholder README and is a clean ancestor of this branch. Confirmed
  with the user: new work belongs here, not on a session-scoped branch, or it does not deploy.

---

## Design principles (do not regress these)

1. **No fabricated data shown as if real.** Early sessions seeded every account with a hardcoded
   "Dockside" demo dataset. That is gone. Stats start at zero for a new account. This is enforced
   aggressively and recently: the hero's field caption lost "3,400 people" and "nine of them"
   because nobody measured those; claimed leads omit `quoteMeta` rather than print "0 comments ·
   0 points"; communities say "size unknown" rather than invent a member count.
2. **No silent fallback when Claude/Mongo calls fail — but never show the customer the raw
   exception either.** Every route wraps its call in try/catch and uses `toUserError(context, err,
   fallback)` from `lib/apiError.ts`: it `console.error`s the full technical detail (visible in
   hosting logs) and returns a short, non-technical message written for a founder. Never return
   `err.message` to the client. Never add a hardcoded fallback dataset as an error handler.
3. **Be honest about what isn't wired up yet.** If a feature is UI-only, either build the backend or
   make the UI say so.

---

## Architecture

- **Next.js 16** (App Router). **Read `AGENTS.md` before writing Next.js code** — this version has
  breaking changes vs. training data (`proxy.ts` not `middleware.ts`, dynamic route `params` are
  `Promise<{...}>`). It links `node_modules/next/dist/docs/`.
- **Auth.js v5** (`next-auth@beta`), JWT sessions, `@auth/mongodb-adapter`. **Google only** —
  email/password was removed.
- **MongoDB** via `lib/mongodb.ts` → `lib/collections.ts` (typed getters). No ORM.
- **Anthropic** via `lib/anthropic.ts`'s `getAnthropic()` — lazy singleton, throws clearly if the
  key is missing, but only when called, so it is always inside a route's try/catch. Model is
  `claude-opus-5` (or `claude-sonnet-5` for the fast tier); don't downgrade.
- **Gmail sending** via `lib/gmail.ts` using the signed-in user's own OAuth refresh token. Gmail is
  intentionally **not disconnectable** — without it Kylani has nowhere to send from.
- **Stripe Connect** (OAuth) for real revenue numbers on the Map page.
- **Vercel Hobby caps functions at 10s** unless **Fluid Compute** is on (free, Settings →
  Functions). Confirmed on. Even so the ceiling is 60s, which every long route budgets under.

### The onboarding rebuild (the current flow)

The old four-step flow still exists behind a feature flag; the new one is default.

- **`/onboarding`** is the single entry URL for both. `lib/discover/flag.ts` decides:
  `?flow=legacy` forces the old one, `NEXT_PUBLIC_ONBOARDING_FLOW=legacy` flips the default back
  (that's the rollback). Both flows emit the same analytics events so they can be compared.
- **New flow**: `components/onboarding/StepStart.tsx` writes a row via `POST /api/discover` and
  hands off to **`/discover/[id]`**, where `app/api/discover/[id]/stream/route.ts` (SSE) does the
  work in front of the person watching. Fast tier-1 inference (~2s, sonnet) → pass 1 (8s hard
  budget: corpus lookup, or a live-shallow fallback when the corpus hasn't reached that niche) →
  pass 2 (sharded, streams). Every stage ships partial results rather than an error.
- **Correction**: `POST /api/discover/[id]/correct` re-derives keywords and re-ranks in place; it
  never restarts. If the run is still in flight the stream adopts the correction at its next shard
  boundary and takes the re-ranked list, so the two writers can't fight over ordering.
- **Claim**: `POST /api/discover/[id]/claim` attaches an anonymous run to the account after
  sign-in. `DashboardShell` gates rendering on it exactly as it gates on finalize — same race:
  whichever request wins decides what the founder sees.
- **Instrumentation**: `lib/discover/analytics.ts` + `clientTrack.ts`. Time-to-first-lead is
  measured in the browser for *both* flows on purpose — a server clock starts when the run does and
  omits the request and navigation the person also waited through, which would bias the comparison
  toward the new flow by construction. `/api/diagnostics/flows` and `/diagnostics` show both.

### The corpus / worker

`worker/index.ts` runs on **Railway** (Railpack, not NIXPACKS; devDependencies are pruned so it runs
a compiled `.worker-build/`, not `tsx`). It crawls sources into a flat `corpus` collection — flat
because Atlas `$search`/`$vectorSearch` must be the first stage on a *single* collection.
`lib/ingest/` holds normalize → Stage 1 lexical gate → Stage 3 LLM classify → embeddings.

**It scrapes people as well as posts.** `lib/ingest/people.ts` runs every tick and fills the
`people` collection with real profiles — display name, bio in their own words, profile URL, account
age, reputation. HN uses the Firebase API, Stack Exchange `/users/{id}`, Discourse `/u/{name}.json`.
All verified against the live APIs with real accounts. Two things to know before touching it:

- **The Stack Exchange filter id is minted, not invented.** `SE_USER_FILTER` came from
  `/2.3/filters/create?include=…&base=default`. The default filter omits `about_me`, which is the
  whole reason for the call, and a made-up filter returns `400 Invalid filter specified` — which
  `getJson` swallows, so every SE lookup silently returns null. Mint a new one the same way.
- **Nothing is invented when a platform stays quiet.** A missing bio stays `undefined`, never `""`;
  a missing account age stays absent rather than becoming `0`, which would render as "joined today"
  for a ten-year account. Discourse post counts are deliberately absent — `/u/{name}.json` has no
  such field, and the second request to `/summary.json` is not worth the rate limit.

**`scrape_log` is the answer to "why did this search return nothing".** One row per unit of work —
each source poll, the pass-1 corpus read, the live-shallow fill, the people-enrichment pass — with a
`correlationId` (the `searchId` for query-time work, `tick:<iso>` for crawls), duration, items
found, `budgetHit` and the error. It exists because `sources.health` only records the most recent
outcome, so a cold corpus, a missing index, a 403 and an expired budget were indistinguishable after
the fact. `logScrape()` never throws and never blocks its caller: a logging failure must not be able
to fail a search. Self-prunes after 30 days via a TTL index. Crawl rows record what was **stored**,
not fetched — a source returning 200 documents that all fail the gate is contributing nothing, and
"fetched" would hide that behind a healthy number.

**Throughput — read this before tuning it.** Polling is parallel, grouped by platform, each group
with its own cap (`CONCURRENCY` in `worker/index.ts`): HN 1, Stack Exchange 4, Discourse 5. It is
capped per platform because politeness is per host — SE is one API behind a shared quota, Discourse
is 31 unrelated servers. Sequential polling over 197 sources was the reason the corpus grew so
slowly; one slow host stalled everything behind it and a tick could not finish in its own 60s.

- Intervals: HN 5min, Discourse 30min, **Stack Exchange 45min — and that number is arithmetic, not
  taste.** 166 sites at 45min is ~5,300 requests/day against a keyed limit of 10,000, and the
  headroom exists because people-enrichment spends the same quota one profile at a time. At 20min
  crawling alone exceeds the limit, and it fails as sources mysteriously degrading rather than as a
  quota error.
- **Seeding is `$setOnInsert`, so changing an interval default does nothing to sources that already
  exist.** Startup retimes them explicitly — healthy ones only, because a degraded source has had
  its interval deliberately doubled by the backoff and resetting that would undo the one thing
  stopping the crawler hammering an unhappy host.
- Classification rises with the crawl rate for a reason: retrieval only reads documents that have an
  `intentType`, so an unclassified document is invisible to `$search`. Crawling faster without
  classifying faster grows the collection and not the corpus.

**Registry: all niches.** All 166 live non-meta Stack Exchange sites and 31 Discourse forums, up
from 10 and 5. Both lists were **verified by calling the APIs**, not typed from memory — 7 of 10
hand-guessed SE slugs did not exist, and 11 of 42 candidate Discourse hosts were not reachable
Discourse JSON. `projectmanagement` in the old seed was one of the dead ones; the real slug is `pm`.
Regenerate with `GET /2.3/sites` and a `/latest.json` probe rather than editing by hand.

**Person identity is namespaced, and this was a real bug.** `personFingerprint` is built from
platform + handle, so a bare Discourse username collapsed every forum's "john" into one person —
one identity wearing several strangers' posts, silently. Discourse and Stack Exchange crawlers now
qualify `authorRef` as `scope/handle`; HN stays bare because it is one flat site. Covered by
`lib/search/__tests__/people.test.mjs`. **This changed existing Discourse/SE fingerprints**, so any
rows from before the change are orphaned — harmless today because the credits system meters without
debiting and the corpus is pre-production, but it would not be harmless once billing is live.

---

## Design system

Tokens live in `app/globals.css` `:root`, with a `@media (prefers-color-scheme: dark)` block that
**rebuilds** the palette rather than inverting it. Every component reads the token names, so
changing values there moves the whole product — there is deliberately no second palette.

- Colour: `--ink --paper --card --card-alt --border --border-strong --muted --muted-strong --faint
  --ember --ember-dark --ember-tint --on-ember --field-idle --green --active-bg --wash-active
  --card-veil --attention --attention-border --on-ink-muted --on-ink-accent`
- Elevation: `--lift-1/2/3`. Motion: `--ease`. Focus: a real 2px `--ember` outline at 2px offset
  (it was a box-shadow, which was silently invisible inside any `overflow: hidden` ancestor).
- Type: **Fraunces** is the display face everywhere via `--font-display`; **Public Sans** is body.
  Outfit is retired. The wonk axes are set once on `body` and inherited (static fonts have no such
  axes and ignore it); `opsz` is deliberately *not* in that rule so small headings get the text cut
  — only `.ky-display` pins `opsz 48`.
- **Every token clears 4.5:1 in both modes.** Two values deliberately differ from the design brief
  that specified them, because the brief's own contrast floor beat its own swatch: `--faint`
  (#8A8177 measured 3.49:1 on paper) and `--ember` (#DE4E22 gave white only 4.02:1).

The landing hero is `components/landing/Hero.tsx` + `components/landing/FoundField.tsx` — a field of
bars where a few are coral. Its constraints are load-bearing and commented in the file: heights come
from a **seeded index function, never `Math.random()`** (random differs between server and client =
hydration mismatch, and reshuffles on every resize); the entrance is transform+colour only so it
cannot cause layout shift; and the pre-entrance state lives inside `@media (prefers-reduced-motion:
no-preference)` so the *finished* field is the default render — a JS-driven version reads the
preference after hydration and snaps.

The field also **oscillates like a sound wave as you scroll**. Scroll *position* is the phase, not
velocity, so the field looks identical every time you return to an offset and reversing the scroll
reverses the wave rather than restarting it. Three constraints, all load-bearing:

- It writes `--ky-wave`, a **scale**, never a height — 110 oscillating bars must not reflow the page,
  same reason the entrance is a transform. Verified: the field's box and the URL input's box do not
  move by a pixel across the whole scroll range.
- `--ky-wave` defaults to `1`, so the server render and every reduced-motion render is the field at
  rest. Reduced motion is read in **JS here** (the opposite of the entrance, which is gated in CSS)
  because a scroll animation's final state *is* the resting field — there is nothing for the
  stylesheet to gate, so the honest fix is to never attach the listener and do no work per frame.
- The entrance's 720ms transform transition is dropped once the wave takes over (`.ky-field-live`),
  or it damps every frame and the wave lags the scroll by most of a second.

`components/discover/SearchWheel.tsx` is the sibling graphic on the search screen. It has been
through four forms — radar, sediment column, waveform channels, and now a **loading wheel** — and
`SearchField.tsx`, `SedimentField.tsx` and `WaveField.tsx` are all deleted along with
`@keyframes kyRadar`. The wheel is the waveform bent into a circle: bars radiate from a hub, their
length oscillates, and a bright band travels round the rim while work is happening. That sweep is
what makes it read as a loading wheel rather than as a chart.

The rim is a map, not decoration: one arc per community, a searched arc lit, an empty community
keeping its arc quietly. **Every coral bar is one person found**, in the arc of the community that
produced them, and the names sit underneath as real text with real counts. Load-bearing details:

- Rotation is an SVG attribute about the hub; scale is CSS about each bar's inner end. Two origins,
  so they cannot share a transform.
- `animate = !reduced && working` — motion is a claim that work is happening.
- Seeded `noise(i)`, never `Math.random()`. No hydration warnings; nothing reflows.

The gallery marquee (`components/landing/Marquee.tsx`) shows **drawn app icons, not images**.
`components/landing/AppIcon.tsx` renders a rounded tile plus one of twelve marks as inline SVG; the
twelve wordmark PNGs and `public/gallery/` are gone. The reason is dark mode: the old plates used
`filter: invert(1) hue-rotate(180deg)`, which only works on flat two-tone artwork and would wreck
anything with real colour in it. An opaque coloured tile is legible on cream and on near-black
untouched, so there is no dark-mode rule at all now. Tile colours are literal hex rather than design
tokens **on purpose** — pointing twelve invented brands at `--ember` would render them as one
company's app suite instead of a shelf of other people's products. The brand name is real text
under the icon, in a box that is always two lines tall so the row cannot unlevel itself.

---

## Known working / verified

- `generateCampaignSeed` and `/api/analyze-site` end-to-end against the live Anthropic API.
- The first live crawl: 16 sources, ~500 docs, classifier + embeddings working.
- The hero at 1440×800, 768×1024 and 390×844 in both modes, scripted in a real browser: the field
  entrance runs once, holds 9 found bars at every width from 390 to 1440, returns byte-identical
  after a resize round-trip, never moves under reduced motion; empty submit shows the inline message
  without navigating; bare / `www.` / full URLs all normalize.
- **The rebalanced headline, re-verified after the Fraunces sweep** (this was the open caveat from
  `d7c42be`, whose last screenshot pass predated the break move). Measured in a real browser against
  a production build: no horizontal overflow at any of them — the three-line wrap is gone. Fraunces
  genuinely loads rather than falling back to Georgia, with `SOFT 20, WONK 1, opsz 48` applied.
  Since `.ky-h1` went to `font-weight: 700` the headline sets two lines at all three widths; before
  the bold it fitted on one at 768. Bold sets wider, so **re-measure the wrap after any change to
  the headline's weight, size or copy** — that is the axis this hero fails on.
  - One false alarm worth not re-investigating: `h1.innerText` reads `"firsthundred"` with no space,
    which looks exactly like the `.ky-h1-break` pseudo-element collapsing at narrow widths. It is
    not. `::before` content never appears in `innerText`; the rendered space is correct in both the
    one-line and two-line cases. Measure that break with range rects or a screenshot, not `innerText`.
- The font sweep is complete: no `Outfit` call sites remain (only a comment recording the
  retirement), no typeface name is hardcoded outside `app/layout.tsx`, and 125 sites read
  `var(--font-display)`. Headings resolve to Fraunces on `/onboarding`, `/signin` and `/diagnostics`.

**Still unverified:** how Fraunces reads on the dashboard pages. Every `/app/*` route redirects to
`/signin`, and getting past that needs Mongo, which the sandbox cannot reach — so this cannot be
closed from a sandbox session at all. It needs a look at a real deployment.

## Sandbox limitations (they will bite you again)

- `api.anthropic.com` **is** reachable — Claude-backed logic can be tested with a real key.
- **MongoDB Atlas is NOT reachable.** Can't test Mongo-backed flows against the database directly —
  a `mongodb+srv://` connect times out on server selection even with a valid URI.
- **`kylani.app` and `vercel.com` ARE reachable now** (they used to 403). This changes what a
  sandbox session can do more than anything else in this file: `curl https://www.kylani.app/api/health`
  answers the Mongo and Google-OAuth questions directly, and the whole discover flow can be driven
  in production with `POST /api/discover` followed by streaming `/api/discover/{id}/stream`. That is
  how the Stack Exchange routing bug above was found.
  - **`curl` reaches production; a Playwright browser does not.** Chromium gets
    `ERR_CONNECTION_RESET` even when launched with `--proxy-server=$HTTPS_PROXY`. So production can
    be exercised at the API level but not screenshotted — anything visual still needs a local build.
- **`explee.com` is not reachable either.**
- Playwright works: `playwright-core` is in `node_modules`, Chromium at `/opt/pw-browsers/chromium`.
  Import it as CJS (`import pw from ".../playwright-core/index.js"; const { chromium } = pw;`).
  Screenshotting and scripting the real built app caught several bugs that review did not — use it.
  Beware sampling computed styles at `domcontentloaded`: you can catch a frame before the stylesheet
  applies and measure nonsense.
- `pkill -f "next start"` **kills its own shell** (the pattern matches its own command line). Use
  `pgrep -f next-server | xargs -r kill -9`, and start servers with `nohup ... &` on a fresh port.
- The Railway MCP server loses auth on container restart and cannot be re-authorized from a
  non-interactive session.
- Git push works.

## Environment variables

Not in any zip/export (`.env.local` is gitignored). Must be set in **Vercel's project Environment
Variables for the Production environment specifically** — a variable scoped only to Preview does not
exist on the production deployment, and env changes need a redeploy to take effect.

```
ANTHROPIC_API_KEY=
MONGODB_URI=
AUTH_SECRET=            # or NEXTAUTH_SECRET — Auth.js reads no other name
GOOGLE_CLIENT_ID=       # AUTH_GOOGLE_ID also works
GOOGLE_CLIENT_SECRET=   # AUTH_GOOGLE_SECRET also works
AUTH_URL=               # canonical origin, e.g. https://www.kylani.app
VOYAGE_API_KEY=         # embeddings, worker
STACKEXCHANGE_KEY=
BLUESKY_IDENTIFIER= / BLUESKY_APP_PASSWORD=
STRIPE_CLIENT_ID= / STRIPE_SECRET_KEY=   # optional
NEXT_PUBLIC_ONBOARDING_FLOW=             # set to "legacy" to roll onboarding back
EXPLEE_API_KEY=         # https://api.explee.com, sent as the X-API-Key header. Nothing in this
                        # repo reads it yet — see the Explee section above before wiring it in.
apollo_one=             # Apollo. LOWERCASE — that is the name actually set in Railway and Vercel.
                        # Sent as the x-api-key header. Read by lib/enrich/apollo.ts.
```

Treat any credential pasted into a chat as exposed and suggest rotation.

## Standing user preferences

- Only commit when there's a clear reason; a stop-hook enforces a commit if the tree is dirty at
  turn end.
- **Never fabricate URLs.**
- Be honest about sandbox limitations rather than claiming something works when it's untested — say
  plainly what could and couldn't be verified.
- The user directs product/UX decisions. Don't relitigate settled ones.
- The user reverts copy they dislike bluntly and quickly. Propose; don't assume.

## Where to look first

- New AI-backed feature → follow `app/api/leads/[id]/draft/route.ts`: lazy `getAnthropic()`, whole
  handler in try/catch, `toUserError()`, zod + `zodOutputFormat`, explicit numeric caps in field
  descriptions (Claude ignores "keep it brief" but respects "HARD LIMIT 20 words"). Prefer
  `z.string()` + a normalizer over `z.enum` for model output — one out-of-vocabulary word rejects
  an entire batch and retries forever.
- New dashboard page → wrap in `<DashboardShell active="...">`, fetch via `requireCampaign()`.
- New lead source → `lib/search/bluesky.ts` is the cleanest example; register in
  `lib/search/venues.ts`.
- New corpus source → `lib/ingest/sources/hackernews.ts`, seeded in `worker/index.ts`.
- Tests are `lib/search/__tests__/pipeline.test.mjs`, run via `npm test` (tsc → `.test-build` →
  `node --test`). **Add the file to `tsconfig.test.json`'s `include` or it won't compile.**

## Mongo gotchas that have already cost time

- `{f: {$lt: n}}` does **not** match documents where the field is absent. Use `{$not: {$gte: n}}`.
- Mongo rejects redefining an index with the same name but a different key. A rename is the
  migration, and index creation must be non-fatal or a bad index crash-loops the worker.
- `$vectorSearch`/`$search` must be the **first** stage, on a **single** collection.
