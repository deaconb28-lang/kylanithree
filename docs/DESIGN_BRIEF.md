# Kylani v0.8 — Build Brief: Campaign Dashboard

> Execute phase by phase, stopping for review after each. Reuse what the codebase already does
> well; flag conflicts instead of silently rebuilding.

## Product

Kylani is an agentic marketing product for founders: it finds buyers across the internet (Reddit, X,
Discord, forums), posts as the founder, answers every reply, runs outreach, and reports what
converted. Positioning: **"your first marketing hire."**

**Core decision: the campaign manager IS the dashboard.** No separate Home, no feature tabs. The app
opens into the active campaign; discovery, content, conversations, and results are views into it.

**Co-headline feature: the Calendar.** The campaign has two lenses, toggled in the command header —
**Pipeline** (who's moving through the funnel) and **Calendar** (what Kylani will do, day by day).
The Calendar is a main draw and must be demo-grade: it plans posts AND outreach on one board, which
no scheduler does.

## Design bar — this must feel worth $100/mo

1. **Visible labor** — every screen shows what Kylani did recently, timestamped, in plain language.
2. **Receipts** — every conversion traces back to thread → post → original quoted signal.
3. **Zero dead ends** — every module has one primary action; every empty/loading/error state names
   the next step.
4. **Operator speed** — keyboard-first approvals, optimistic updates, skeletons <200ms, no layout
   shift.
5. **Decisiveness** — every insight ships with a one-click action, never just a stat.

## Information architecture

```
App shell
├── Campaign switcher (campaigns are the only top-level objects)
├── CAMPAIGN DASHBOARD  ← default route
│   ├── Command header (with lens toggle: Pipeline · Calendar)
│   ├── PIPELINE LENS
│   │   ├── Pipeline spine (Found → Engaged → In conversation → Converted)
│   │   ├── Today (default workspace)
│   │   └── Stage workspaces (one per stage, opened from the spine)
│   └── CALENDAR LENS — the week board: every planned post and outreach touch
├── Worklog drawer (global slide-over)
└── Voice, Settings (utility)
```

## Dashboard spec

### Command header

One row: campaign + goal progress ("Dockside — First 100 operators · 23 of 100 · 41 days left") ·
lens toggle Pipeline / Calendar · autonomy segmented control Suggest / Approve / Run · live agent
status chip ("Kylani is reading 14 new threads in r/boating") that opens the Worklog.

### Pipeline spine

The navigation is the funnel. Four stage nodes joined by thin connectors:
Found 128 → Engaged 54 → In conversation 19 → Converted 6.

Each node: count in the display face, mono delta ("+12 this wk"), stage-conversion rate on the
connector ("42%"). Nodes are tabs that swap the workspace below; no selection = Today. One mount
animation (connectors draw once); respect `prefers-reduced-motion`. **This band is the screenshot
people share — spend the design effort here.**

### Today — four modules

- **Needs you** (largest, agent-accent edge): approval queue with inline previews and Approve /
  Edit / Skip. Keyboard: `j/k` navigate, `a/e/s` act; "Approve all routine" batch.
- **While you were gone**: plain-sentence digest, every clause linked ("Since Sunday: posted twice,
  answered 9 replies, moved 3 people into conversation").
- **Today's content**: strip of today's posts — time, platform glyph, status badge, mono purpose
  line ("serves: no-show-fee hypothesis").
- **Hypothesis scoreboard**: 2–3 buyer hypotheses with share of conversions + spark line. No vanity
  metrics here.

### Calendar lens — the week plan

This is a main draw; build it demo-grade. One board for everything Kylani will do, not just what it
will post. Week columns (Mon–Sun, month toggle, today outlined), counts strip (6 scheduled · 3
drafts · 2 awaiting approval), and a plan summary sentence up top ("This week: 3 posts, 8 outreach
touches, 5 follow-ups — all serving the phone-bookings hypothesis").

Three card kinds, visually distinct but sharing one anatomy:

- **Post** — time, platform glyph, title/thumbnail, status badge.
- **Outreach** — first touches to specific signals ("DM 3 Hull Truth signals re: double-bookings").
- **Follow-up** — scheduled nudges from open conversations ("Rosa M. · day-2 follow-up").

Every card carries the mono purpose line. Empty slots show ghost suggestions sourced from live
signals with one-click Accept / Change. Drag to reschedule; click → side panel preview with Approve
& schedule. Editable cadence rules inline ("3 posts/week: 1 story, 1 answer-post, 1 proof").

**The competitive point: schedulers plan content; this board plans the entire job.**

### Stage workspaces — one template, four instances

Left: the people at this stage. Right: the machinery that advances them.

- **Found** — people: ranked signal cards, the person's quoted words as the hero, fit score +
  reason, Draft outreach / Watch / Not a fit. Machinery: source manager — watched communities,
  signal trends, join requests to approve.
- **Engaged** — people: everyone who interacted, with what they touched. Machinery: a compact week
  peek of upcoming content that opens the Calendar lens filtered to posts.
- **In conversation** — people: unified conversation list (filters: Needs you / Kylani handling /
  Waiting on them). Machinery: thread view — Kylani's draft in dashed treatment tagged "Draft by
  Kylani," a mono reasoning line above it, Approve & send / Edit / Write my own; collapsible context
  rail (source, original quote, hypothesis, touch history). Run mode: "Sent by Kylani" with visible
  undo.
- **Converted** — people: cohort table (name, source, first-signal date, days to convert,
  hypothesis, first-touch quote). Machinery: conversions-by-source bars + three insight cards, each
  with its action. Reach metrics live here only, collapsed.

### Worklog drawer

Reverse-chronological agent actions in mono ("09:41 — drafted reply to @harborhand · why?"), each
expandable to a one-line rationale. Always one click away.

## Rules

- **Status vocabulary, exact:** Draft by Kylani → Awaiting your approval → Scheduled → Sent / Posted
  → Replied → Converted.
- **Agent accent:** one existing brand accent means only "Kylani did something." Never decorative.
- **Copy:** buttons name the action ("Approve & send"); sentence case; no exclamation marks; errors
  explain + fix; empty states say what Kylani does next; never tell the user what they did wrong.
- **Mock data:** one typed module (`lib/mock/`) with the full Dockside scenario — Maya Chen,
  dockside.app, marina-operator buyers, r/boating / The Hull Truth / marine-trades Discord, 12 days
  of worklog, the 128→54→19→6 funnel. Typed interfaces so live data swaps in cleanly. No lorem, no
  "User 1."
- **Floor:** responsive to tablet (mobile = read + approve), visible focus states, reduced motion,
  no layout shift.

## Phases (stop for review after each)

1. **Audit + plan** — done when the plan is approved.
2. **Data contracts + Dockside mock** — done when funnel math is consistent everywhere.
3. **Shell** — header with lens toggle, spine with working tabs, worklog drawer. Done when lens and
   stage switching feel instant.
4. **Today** — done when the queue can be cleared keyboard-only.
5. **Calendar lens** — done when a week reads as one job (posts + outreach + follow-ups on one
   board) and a ghost suggestion accepts in one click.
6. **Stage workspaces** — done when a stranger's path traces from quoted signal to cohort row by
   clicking.
7. **States + polish** — all states, optimistic approve/undo, remove one decorative element per
   zone, copy sweep.

## Acceptance checklist

- [ ] Cold open lands on Today with the digest populated
- [ ] Spine counts, deltas, and conversion rates agree with the cohort table
- [ ] Every module has a primary action; nothing is read-only
- [ ] Conversion → original quoted signal in ≤3 clicks
- [ ] Calendar shows posts, outreach, and follow-ups on one board; every card carries a purpose line
- [ ] Full keyboard triage works
- [ ] Autonomy modes visibly change behavior (drafts vs. sent-with-undo)
- [ ] Zero new brand elements
- [ ] Every zone has empty/loading/error states naming a next step

Fix failures before presenting. Ship phases, not a monolith.

---

## Channel connections (companion workstream)

Connect X, Meta products, email, and more. **`gmail.send` is explicitly NOT in scope yet** — the
send path stays as it is; this workstream is about connecting accounts and reading, not sending.

See `docs/CHANNELS.md` for what each provider actually requires and which are blocked on approval
rather than on code.
