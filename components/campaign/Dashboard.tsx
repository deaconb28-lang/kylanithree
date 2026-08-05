"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import CommandHeader from "./CommandHeader";
import Spine from "./Spine";
import WorklogDrawer from "./WorklogDrawer";
import Starter from "./Starter";
import BetaPanel from "./Beta";
import type { Autonomy, CampaignPerson, FunnelSummary, PlanCard, StageKey, WorklogItem } from "../../lib/campaign/types";
import { STAGE_LABEL } from "../../lib/campaign/types";

// The campaign dashboard. One route, two lenses, five workspaces.
//
// LENS AND STAGE ARE URL STATE, not component state. Three reasons, in order of how much they
// matter: a founder can send someone the exact view they are looking at; the back button does what
// a back button should; and a reload after an approval returns to the workspace the approval
// happened in rather than dumping the person back on Today.
//
// EVERYTHING IS FETCHED ONCE. `/api/campaign/dashboard` returns the whole board, so switching lens
// or stage is a re-render rather than a round trip — which is the only way "feels instant" is true
// rather than aspirational. It is also what keeps the spine and the workspaces agreeing: they are
// reading the same array, from the same instant.
//
// There is no fixture behind any of this. A new account gets zeroes and starters, and the starters
// are the product for that account until it has run.

type DashboardData = {
  campaign: { productName: string; productUrl: string; paused: boolean; createdAt: string; trialEndsAt: string | null };
  funnel: FunnelSummary;
  people: CampaignPerson[];
  hypotheses: { key: string; name: string; status: string; meta: string }[];
  communities: { key: string; name: string; fit: string; members: number | null }[];
  worklog: WorklogItem[];
  digest: { counts: Record<string, number>; total: number } | null;
  plan: PlanCard[];
  everPlanned: boolean;
  weekStart: string;
};

type Lens = "pipeline" | "calendar";

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [worklogOpen, setWorklogOpen] = useState(false);

  // The URL seeds the view, then this component owns it and writes back.
  //
  // Seeded through a lazy initializer rather than an effect: setting state from an effect on mount
  // cascades a render and, worse, paints the wrong workspace for one frame before correcting — which
  // is exactly the flicker "feels instant" rules out. `useSearchParams` resolves identically on the
  // server and the client, so there is no hydration mismatch either.
  const params = useSearchParams();
  const [lens, setLensState] = useState<Lens>(() => (params.get("lens") === "calendar" ? "calendar" : "pipeline"));
  const [stage, setStageState] = useState<StageKey | null>(() => {
    const s = params.get("stage");
    return s === "found" || s === "engaged" || s === "in_conversation" || s === "converted" ? s : null;
  });
  const [autonomy, setAutonomyState] = useState<Autonomy>("approve");
  // Captured once. `Date.now()` read during render would make the day count impure and could differ
  // between a render and its re-render mid-session.
  const [now] = useState(() => Date.now());

  const pushUrl = useCallback((next: { lens?: Lens; stage?: StageKey | null }) => {
    const p = new URLSearchParams(window.location.search);
    if (next.lens) p.set("lens", next.lens);
    if ("stage" in next) {
      if (next.stage) p.set("stage", next.stage);
      else p.delete("stage");
    }
    const qs = p.toString();
    // replaceState, not push: switching a lens is not a navigation anyone wants to press back
    // through four times to leave the page.
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, []);

  const setLens = useCallback(
    (l: Lens) => {
      setLensState(l);
      pushUrl({ lens: l });
    },
    [pushUrl],
  );

  const setStage = useCallback(
    (s: StageKey | null) => {
      setStageState(s);
      pushUrl({ stage: s });
    },
    [pushUrl],
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/campaign/dashboard")
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (!ok) {
          setError(d.error ?? "Couldn't load your campaign.");
          return;
        }
        setError(null);
        setData(d);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't reach the server.");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const goal = useMemo(() => {
    if (!data) return null;
    const converted = data.funnel.stages.find((s) => s.key === "converted")?.count ?? 0;
    // The target is the product's own promise — a hundred buyers — and the deadline is the trial,
    // which is a real date somebody set. Neither is invented for the header.
    const daysLeft = data.campaign.trialEndsAt
      ? Math.max(0, Math.ceil((Date.parse(data.campaign.trialEndsAt) - now) / 86_400_000))
      : null;
    return { done: converted, target: 100, label: "First 100 buyers", daysLeft };
  }, [data, now]);

  if (error) {
    return (
      <div style={{ padding: "36px 5vw", maxWidth: 640 }}>
        <Starter
          kind="add"
          title="Couldn't load your campaign"
          body={error}
          actions={[{ label: "Try again", onClick: () => setAttempt((a) => a + 1), primary: true }]}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: "28px 5vw", display: "flex", flexDirection: "column", gap: 20 }} aria-busy="true">
        {/* Reserving the real heights, so nothing shifts when the data lands. */}
        <div style={{ height: 78, borderRadius: 12, background: "var(--card-alt)" }} />
        <div style={{ height: 96, borderRadius: 12, background: "var(--card-alt)" }} />
        <div style={{ height: 280, borderRadius: 14, background: "var(--card-alt)", opacity: 0.7 }} />
      </div>
    );
  }

  // Only ever a real claim about now. There is no polling yet, so this stays null rather than
  // asserting activity the page cannot see — a chip that always says "Kylani is working" is the
  // same lie as a spinner that never stops.
  const liveStatus: string | null = null;

  return (
    <div style={{ padding: "24px 5vw 56px", display: "flex", flexDirection: "column", gap: 22, maxWidth: 1280, margin: "0 auto" }}>
      <CommandHeader
        productName={data.campaign.productName}
        goal={goal}
        lens={lens}
        onLens={setLens}
        autonomy={autonomy}
        onAutonomy={setAutonomyState}
        status={liveStatus}
        onOpenWorklog={() => setWorklogOpen(true)}
        worklogCount={data.worklog.length}
      />

      {lens === "pipeline" ? (
        <>
          <Spine funnel={data.funnel} active={stage} onSelect={setStage} />
          {stage ? (
            <StageWorkspacePlaceholder stage={stage} people={data.people.filter((p) => p.stage === stage)} />
          ) : (
            <>
              <TodayPlaceholder data={data} />
              <OutreachPanel />
            </>
          )}
        </>
      ) : (
        <CalendarPlaceholder data={data} />
      )}

      <WorklogDrawer open={worklogOpen} onClose={() => setWorklogOpen(false)} items={data.worklog} />
    </div>
  );
}

// --- Phase 3 stubs -------------------------------------------------------------------------
// Deliberately thin. Phase 3's done condition is that the shell switches instantly and every zone
// says what goes in it; Today (phase 4), the calendar (phase 5) and the stage workspaces (phase 6)
// replace these in place. Each one is a real starter rather than a "coming soon" — a zone that
// cannot do anything yet still names its next step.

function TodayPlaceholder({ data }: { data: DashboardData }) {
  const needsYou = data.people.filter((p) => p.status === "waiting").length;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 14 }}>
      {needsYou > 0 ? (
        <Starter
          kind="add"
          title={`${needsYou} ${needsYou === 1 ? "person is" : "people are"} waiting on you`}
          body="Approve, edit or skip each draft. The queue clears from the keyboard."
          actions={[{ label: "Open the queue", href: "/campaign/work", primary: true }]}
        />
      ) : (
        <Starter
          kind="intro"
          title="Nothing needs you right now"
          body="When Kylani drafts a reply or plans a post, it lands here for approval before anything leaves."
          actions={[{ label: "Find more buyers", href: "/campaign/work" }]}
        />
      )}

      {data.digest ? (
        <Starter
          kind="add"
          title="While you were gone"
          body={`${data.digest.total} ${data.digest.total === 1 ? "thing" : "things"} happened since Monday.`}
          actions={[{ label: "See the worklog", href: "?worklog=1" }]}
        />
      ) : (
        <Starter
          kind="intro"
          title="While you were gone"
          body="A plain-sentence digest of everything Kylani did since you last looked. It fills in as soon as there is something to report."
        />
      )}

      {data.hypotheses.length > 0 ? (
        <Starter
          kind="add"
          title="Hypotheses"
          body={`${data.hypotheses.length} buyer ${data.hypotheses.length === 1 ? "hypothesis" : "hypotheses"} in play. Conversions get attributed back to these.`}
          actions={[{ label: "Review them", href: "/app/findings" }]}
        />
      ) : (
        <Starter
          kind="templates"
          title="Who are you selling to?"
          body="A hypothesis is a guess about your buyer that Kylani tests for you. Pick a starting point or write your own."
          templates={[
            { key: "role", title: "By job title", detail: "e.g. operations manager · 20-200 people" },
            { key: "pain", title: "By problem", detail: "e.g. people complaining about no-shows" },
            { key: "switch", title: "Switching away", detail: "e.g. people leaving a competitor" },
          ]}
          actions={[{ label: "Write my own", href: "/app/findings" }]}
        />
      )}
    </div>
  );
}

function StageWorkspacePlaceholder({ stage, people }: { stage: StageKey; people: CampaignPerson[] }) {
  if (people.length === 0) {
    return (
      <Starter
        kind="intro"
        title={`Nobody is at ${STAGE_LABEL[stage].toLowerCase()} yet`}
        body={STAGE_INTRO[stage]}
        actions={[{ label: "Find buyers", href: "/campaign/work", primary: true }]}
      />
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={{ fontFamily: "var(--font-machine)", fontSize: 11.5, color: "var(--muted)" }}>
        {people.length} at {STAGE_LABEL[stage].toLowerCase()}
      </span>
      {people.slice(0, 12).map((p) => (
        <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "13px 15px", background: "var(--card)", display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</span>
          {p.quote && <span style={{ fontSize: 13.5, color: "var(--muted-strong)", lineHeight: 1.5 }}>{p.quote.slice(0, 160)}</span>}
          <span style={{ fontFamily: "var(--font-machine)", fontSize: 11.5, color: "var(--faint)" }}>{p.source}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Agentic outreach, stated plainly.
 *
 * This is the headline of the whole product — "posts as you, answers every reply" — and it is the
 * part that is least built. Hiding it during a seven-day trial means the trial never shows what is
 * being bought; showing it unlabelled means the first unanswered reply is a betrayal. So it is
 * shown, in full, with each channel carrying the specific thing standing in its way.
 *
 * The blockers are REAL and were measured, not guessed: Reddit returns 403 to datacenter traffic
 * and needs Responsible Builder approval, X has no free write tier, Meta's posting APIs are Pages
 * and Professional accounts only behind App Review.
 */
function OutreachPanel() {
  const channels: { name: string; state: string; ok: boolean }[] = [
    { name: "Gmail", state: "sending now, from your own inbox", ok: true },
    { name: "Hacker News · forums · GitHub", state: "reading now — 29k posts and climbing", ok: true },
    { name: "Bluesky", state: "reading, once the app password is fixed", ok: false },
    { name: "Reddit", state: "needs Responsible Builder approval", ok: false },
    { name: "X", state: "needs the paid API tier to post", ok: false },
    { name: "Meta", state: "Pages and Professional accounts only, after App Review", ok: false },
  ];
  return (
    <BetaPanel
      stage="soon"
      title="Kylani answers every reply"
      promise="It posts as you, watches the thread, and drafts the response the moment somebody writes back."
      blocker="Drafting and sending work today. What is not built is the loop that watches a thread after you send and answers on its own — until then every reply is one you open."
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 12 }}>
        {channels.map((c) => (
          <div key={c.name} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, minWidth: 0 }}>
            {/* Green means it is running today. Everything else is deliberately not coral: a
                channel that cannot post yet is a fact about the product, not an agent action. */}
            <span
              aria-hidden="true"
              style={{ width: 6, height: 6, borderRadius: 999, flexShrink: 0, marginTop: 6, background: c.ok ? "var(--green)" : "var(--border-strong)" }}
            />
            {/* Stacked, not inline. Side by side, "reading now — 29k posts and climbing" wrapped
                into a five-line column beside its own label and the row stopped being scannable. */}
            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>{c.name}</span>
              <span style={{ fontFamily: "var(--font-machine)", fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>{c.state}</span>
            </span>
          </div>
        ))}
      </div>
    </BetaPanel>
  );
}

const STAGE_INTRO: Record<StageKey, string> = {
  found: "Kylani watches communities for people describing the problem you solve, and puts them here with their own words attached.",
  engaged: "Once you approve a message, the person moves here — with what they were sent and when.",
  in_conversation: "When someone writes back, the thread lands here and Kylani drafts the reply for you.",
  converted: "People you mark as converted collect here, each traceable back to the post you found them in.",
};

function CalendarPlaceholder({ data }: { data: DashboardData }) {
  return (
    <BetaPanel
      stage="preview"
      title="The week board"
      promise="Every post, first outreach and follow-up Kylani will run, on one board. Schedulers plan content; this plans the whole job."
      blocker="The board and its cadences are built. What is not built yet is the planner that fills empty slots from live signals — so nothing schedules itself today, and anything you add here stays a draft."
    >
      {data.plan.length === 0 ? (
        <Starter
          kind="templates"
          title={data.everPlanned ? "Nothing planned this week" : "Pick a cadence"}
          body="Choose how hard Kylani should push, and the board lays the week out around it."
          templates={[
            { key: "light", title: "Light", detail: "2 posts/wk · 5 outreach · follow-ups on" },
            { key: "steady", title: "Steady", detail: "3 posts/wk · 8 outreach · follow-ups on" },
            { key: "heavy", title: "Heavy", detail: "5 posts/wk · 15 outreach · follow-ups on" },
          ]}
          actions={[{ label: "Add something myself", primary: true }]}
        />
      ) : (
        <span style={{ fontFamily: "var(--font-machine)", fontSize: 11.5, color: "var(--muted)" }}>
          {data.plan.length} planned this week
        </span>
      )}
    </BetaPanel>
  );
}
