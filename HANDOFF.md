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

### The one thing that is NOT done

**The Explee scraper was requested but never built.** The user said "the api is ready in railway and
vercel", meaning the key is set as an environment variable in both — but three things were never
established and are needed before a line of code makes sense:

1. **The env var name** they used (guessing `EXPLEE_API_KEY` would be a coin flip).
2. **The base URL and endpoint shape.**
3. **A sample response**, or a docs link.

`explee.com` is not reachable from the sandbox (the agent proxy 403s it), so the shape cannot be
discovered by calling it. **Ask for these three things before starting.** Tell the user to keep the
key itself in Railway/Vercel and out of chat — anything pasted into a conversation should be
treated as exposed.

Where it slots in once the details arrive: if Explee is a query-time search source it belongs in
`lib/search/` (see `bluesky.ts`, `quora.ts` for the shape a source module takes) and gets
registered in `lib/search/venues.ts`. If it is a *corpus* source it belongs in
`lib/ingest/sources/` next to `hackernews.ts`, and gets seeded in `worker/index.ts`.

### Also outstanding

- **Atlas Search + Vector Search indexes are still not created.** The Railway worker fills the
  `corpus` collection, but nothing can query it until those indexes exist in Atlas. Vector Search
  requires **M10+**, not M0 — confirm the cluster tier.
- **Rotate the Bluesky app password.** It was pasted into chat in an earlier session.
- Founder/Studio plan naming is undecided, which blocks the billing half of the credits system
  (`lib/credits/`, `docs/credits.md`). Metering works and records; nothing is debited.
- Google sign-in was failing in production with `?error=Configuration`. `/api/auth/providers`
  returns normal JSON, which proves the config is fine — so it is the Mongo adapter failing on the
  callback. `7a3fa1e` fixed a real bug there (a rejected connection promise was cached for the life
  of a warm lambda, with no retry). **If it still fails after that deploy, read `/api/health` →
  `checks.mongo.likelyCause` and `checks.googleOAuth.configurationErrorCause`, which now name the
  cause directly.** Most likely: Atlas Network Access not allowing `0.0.0.0/0`, or a paused cluster.

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

`components/discover/SearchField.tsx` is the sibling graphic on the search screen: the product at
the centre, real communities around it, lines lighting up as each is searched.

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
  a production build: two lines at 1440, one at 768, two at 390, no horizontal overflow at any of
  them — the three-line wrap is gone. Fraunces genuinely loads rather than falling back to Georgia,
  with `SOFT 20, WONK 1, opsz 48` applied.
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
- **MongoDB Atlas is NOT reachable.** Can't test Mongo-backed flows end to end.
- **`kylani.app` and `vercel.com` are NOT reachable** — the agent proxy 403s them. You cannot check
  production, read Vercel logs, or deploy from here.
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
EXPLEE_?=               # name unknown — ask the user
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
