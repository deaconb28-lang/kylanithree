# Kylani — project handoff

This doc exists so a new Claude Code session can pick this project up cold. Read this in full
before making changes.

## The pitch

**Kylani finds a founder's first hundred buyers and writes to each one, in the founder's own
voice, from their own inbox.**

Most early-stage founders don't have a lead-gen problem, they have a *going-looking* problem —
their buyers are already out there, complaining on Reddit, asking in Slack communities, posting
job ads that describe the exact pain the product solves. Nobody has time to go find them one at a
time, and generic outbound tools (mail-merge blasts, scraped lists) read as spam because they are.

Kylani's pitch: paste your URL. It reads the site, works out who's likely to buy (as 2-4 ranked,
correctable hypotheses — not a single guess), then goes looking for those people across Reddit,
Slack communities, Discord, forums, and job postings. For each lead it finds, it drafts a specific,
warm, non-salesy outreach message anchored to something that person actually said or did — never a
generic template. The founder approves, edits, or drops each draft; nothing sends automatically.
Approved messages go out from the founder's own Gmail (OAuth-connected), so replies land in their
real inbox, not a shared tool inbox. Over time it tells the founder which buyer hypothesis is
actually converting (reply rate by persona) and which communities are worth the effort — the
"Findings" it couldn't have looked up on day one.

Landing page framing: **"Find your first hundred buyers in ten minutes."** / "Warm, human outreach
— not more AI noise." The four-step story on the homepage (`ProcessSteps.tsx`) is the whole product
in miniature: read the site → guess the buyer → go looking for them → write the first draft.

This is a demo/portfolio build of that product, not a live company — treat "Kylani" as the real
product it's pretending to be when writing copy or code; don't undercut the pitch with fake
numbers (see "Design principles" below).

## Design principles established this build (don't regress these)

1. **No fabricated data shown as if real.** Early sessions seeded every new account with the same
   hardcoded "Dockside" demo dataset (104 buyers, specific named leads, fake revenue). That's gone
   for real accounts — `lib/generateCampaignSeed.ts` generates leads/communities/hypotheses via
   Claude from the founder's *actual* onboarding answers, and stats start at zero for a new
   account (no fabricated history). `ensureSeeded()` (the old Dockside seed) is now purely a
   fallback for direct sign-ins with no onboarding data at all — it should never fire for someone
   who completed onboarding. Anywhere else fake/hardcoded numbers were found bleeding into a real
   account's UI (Step6Complete's "104 buyers", Map's "12 suppressed" banner, Queue's ops/warehouse
   filters wired to Dockside-specific hypothesis keys) has been generalized or made honest — don't
   reintroduce hardcoded product-specific numbers into shared UI.
2. **No silent fallback when Claude/Mongo calls fail.** Every route that calls Claude or Mongo
   wraps the call in try/catch and returns the real error message as JSON. The frontend (onboarding
   Step2Reading, DashboardShell's finalize step) shows that real error with a Retry button instead
   of silently substituting fake data. If you add a new Claude-backed feature, follow this pattern
   — never add a hardcoded fallback dataset as an error handler.
3. **Be honest about what isn't wired up yet.** E.g. Map's "Suppressed" tab shows "Nobody
   suppressed yet" rather than a fake count, because there's no real suppression-tracking system
   built. If a feature is UI-only with no backend behind it, either build the backend or make the
   UI say so — don't fake the number.

## Architecture

- **Next.js 16** (App Router). **Read `AGENTS.md` before writing Next.js code** — this version has
  breaking changes vs. training-data Next.js (e.g. `proxy.ts` not `middleware.ts`, dynamic route
  `params` are `Promise<{...}>`). It links `node_modules/next/dist/docs/` for specifics.
- **Auth.js v5** (`next-auth@beta`), JWT session strategy (required because the Credentials
  provider can't hydrate a database session), `@auth/mongodb-adapter` for Google OAuth. Both Google
  and email/password (bcryptjs, hand-rolled against a `users` collection) sign-in are supported.
  Sign-in happens *after* onboarding, not before — onboarding itself runs fully unauthenticated.
- **MongoDB** via `lib/mongodb.ts` → `lib/collections.ts` (typed collection getters: `Campaigns`,
  `Leads`, `Communities`, `Hypotheses`, `Findings`). No ORM.
- **Anthropic (Claude)** via `lib/anthropic.ts`'s `getAnthropic()` — lazy singleton, throws a clear
  error if `ANTHROPIC_API_KEY` is missing, but only when actually called (not at module load), so
  it's always inside a route's own try/catch. Model is always `claude-opus-5` per the skill
  defaults; don't downgrade. Three call sites: `/api/analyze-site` (onboarding buyer-persona
  analysis), `lib/generateCampaignSeed.ts` (the real lead/community/hypothesis generation, called
  from `/api/onboarding/finalize`), `/api/leads/[id]/draft` (on-demand "Rewrite with AI").
- **Gmail sending** via `lib/gmail.ts`, using the signed-in user's own Google OAuth refresh token
  (stored by the Mongo adapter in the `accounts` collection) — real send, not a stub. Only fires
  when a lead has a real email on file; most AI-generated leads (sourced from anonymous social
  posts) legitimately don't, and approving those just marks them approved with an honest note
  instead of pretending to send.
- **Stripe Connect** (OAuth, not API keys pasted by the user) for real revenue numbers on the Map
  page — `lib/stripe.ts`, `/api/stripe/{connect,callback,summary,disconnect}`. Shows an honest
  "connect Stripe for real numbers" empty state otherwise, never a fabricated revenue figure.
- **Onboarding flow**: `app/onboarding/page.tsx` is a 6-step client-side state machine (no router
  per step) — Step1Url → Step2Reading (real Claude call) → Step3Buyers (correct the guesses) →
  Step4Channels (toggle Reddit/Slack/Discord/etc) → Step5Search (a *simulated* ~45s "searching"
  animation — real search-and-scrape infra doesn't exist, this is a deliberate UX device) →
  Step6Complete. Answers are stashed in `sessionStorage` (`lib/onboardingStorage.ts`) across the
  sign-in redirect, then POSTed to `/api/onboarding/finalize` once authenticated.
- **DashboardShell** (`components/dashboard/DashboardShell.tsx`) wraps all four app surfaces
  (Today/Queue/Map/Findings) plus Settings. It owns the onboarding-finalize call and **must**
  finish (success or a shown error) before rendering `children` — this gates against a real race
  where every page's own `/api/leads`/`/api/campaign` fetch would otherwise auto-seed the generic
  Dockside demo faster than the ~25-40s Claude call could finish, silently stranding real accounts
  on fake data. Don't restructure this without preserving that gate.
- **Vercel Hobby plan caps serverless functions at 10s by default.** `analyze-site`,
  `onboarding/finalize`, and `leads/[id]/draft` all set `export const maxDuration = 30-60`, but
  that only takes effect if **Fluid Compute** is enabled on the Vercel project (free, in Settings →
  Functions). Without it, these routes will keep timing out in production regardless of the code.
  This has been communicated to the user but not confirmed enabled — worth checking early if
  Claude-backed routes seem to time out on Vercel specifically (vs. working when tested directly
  against the API, as they do from a sandbox that can reach `api.anthropic.com`).

## Known working / verified this session

- `generateCampaignSeed` end-to-end against the live Anthropic API (real personas, real leads,
  ~25-40s).
- `/api/analyze-site` end-to-end in a real browser (pasted `pocketledger.com`, got back real
  "Small Business Owner / Freelancer / Bookkeeper" personas — not Dockside's ops/warehouse/
  logistics).
- The error-surfacing fix: forced a real MongoDB connection failure and confirmed the actual error
  message ("Server selection timed out...") reaches the sign-up form, instead of a generic
  "Something went wrong."
- `tsc --noEmit`, `eslint`, and `next build` all clean as of the last commit.

## Sandbox limitations (if continuing from a similar sandboxed environment)

- `api.anthropic.com` is reachable — Claude-backed logic can be tested directly with a real key.
- **MongoDB Atlas is NOT reachable** (`MongoServerSelectionError` / timeout on every attempt) —
  can't test full Mongo-backed flows (sign-in persistence, campaign CRUD, etc.) end-to-end from a
  sandbox with this same network policy. Verify DB-dependent code by careful review + isolated
  Anthropic-only testing, not by running the full stack.
- `vercel.com` / `api.vercel.com` are NOT reachable — can't deploy, check Vercel logs, or use a
  Vercel access token from here even if the user provides one.
- **GitHub push is blocked** — `git-upload-pack` (read) works, `git-receive-pack` (write)
  consistently 403s across every repo/owner tried. This was diagnosed at length in an earlier
  session and is **not a repo or GitHub-permissions problem** (the user confirmed the GitHub App
  has read/write granted) — it's a Claude-side account/admin-settings gate specific to this user's
  account that no amount of retrying or repo-switching fixes. If this is still broken in a new
  session, don't re-diagnose from scratch — point the user to Anthropic support
  (support.claude.com), or just work via zip export as this handoff does.
- Given both Mongo and Vercel are unreachable, **the delivery mechanism has been zip exports** the
  user manually deploys (via Vercel CLI from their own machine, or drag-and-drop, though the latter
  creates a new project each time — CLI with `vercel link` is the better path for repeat updates).

## Deployment

The Vercel project was originally created via drag-and-drop zip upload, which is **not** connected
to Git — pushes to this repo did nothing until the user connected the project to
`deaconb28-lang/kylanithree` under Settings → Git (or Settings → Environments → Production →
Branch Tracking, depending on dashboard version), with **Production Branch** set to
`claude/kylanithree-data-organization-v7j15s` (not `main` — `main` only has a placeholder README;
all real app code lives on this branch, which was never merged). Once connected correctly, every
push to this branch should trigger a Vercel deploy automatically. If a push lands here and nothing
deploys, re-check that Production Branch setting first before assuming a code problem.

## Environment variables

Not included in any zip export (`.env.local` is gitignored and deliberately excluded). The user has
been given these directly in chat multiple times this session — ask them to paste current values
if picking this up fresh, or check earlier messages in the original conversation:

```
ANTHROPIC_API_KEY=
MONGODB_URI=
AUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
STRIPE_CLIENT_ID=      # optional — Stripe Connect won't work without it, nothing else needs it
STRIPE_SECRET_KEY=     # optional
```

These must be set in **Vercel's project Environment Variables**, not just locally — a zip-drop
deploy carries no env config at all. Treat any credential that's been pasted into a chat as
potentially exposed; suggest rotation if that's a concern.

## Standing user preferences (established across this whole build)

- Only commit to git when there's a clear reason — this repo has a stop-hook enforcing a commit
  when there are uncommitted changes at turn end, so this has been happening naturally most turns.
- Never fabricate URLs.
- Be honest about sandbox limitations rather than claiming something works when it's untested —
  say plainly what could and couldn't be verified from this environment.
- The user directs product/UX decisions (e.g. explicitly chose to revert the `home.kylani.app`
  subdomain experiment back to `kylani.app`, chose to add themselves as a Google test user rather
  than remove the `gmail.send` scope) — don't relitigate settled decisions without being asked.

## Where to look first for common tasks

- Add a new AI-backed feature → follow the pattern in `app/api/leads/[id]/draft/route.ts`: lazy
  `getAnthropic()`, whole handler in try/catch, JSON error response, zod + `zodOutputFormat` for
  structured output, tight "HARD LIMIT" wording in field descriptions (Claude ignores soft
  guidance like "keep it brief" but respects explicit numeric caps).
- Add a new dashboard page → wrap in `<DashboardShell active="...">`, fetch via `requireCampaign()`
  in the API route (auto-seeds Dockside demo only if truly no campaign exists yet — see the race
  note above).
- Touch onboarding → `app/onboarding/page.tsx` is the state machine; each `Step*.tsx` is
  presentation + local state only, lifted state flows back up via `onDone` callbacks.
