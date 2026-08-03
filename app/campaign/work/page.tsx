"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import SearchAgainButton from "../../../components/dashboard/SearchAgainButton";
import type { HypothesisDoc, LeadDoc, SuppressionReason } from "../../../lib/collections";
import { SUPPRESSION_REASON_LABELS, SUPPRESSION_REASONS } from "../../../lib/suppression";
import LeadTier from "../../../components/LeadTier";
import { tierFromTotal } from "../../../lib/search/leadScore";
import { REJECTION_REASONS, REJECTION_REASON_LABELS, type RejectionReason } from "../../../lib/leads/rejectionReasons";
import { relativeTime } from "../../../lib/relativeTime";

// Work is a deck of people, not a mailbox.
//
// This screen used to be a two-pane mail client: a bordered list column on the left, a reading pane
// on the right, unread dots, a "Subject:" header row. Every one of those is a borrowed convention
// from a tool whose job is to show you everything that arrived and let you decide what to open —
// and that is the wrong job. Nothing "arrives" here. Kylani went looking, ranked what it found, and
// the founder's task is to work down that ranking making one decision at a time. A mail list
// invites scanning; a deck invites deciding.
//
// So: one person, full width, with the rest of the run as a horizontal rail above them. The rail
// keeps what the list column was actually good for — position, scanning ahead, jumping — without
// implying a pile of unread mail. Progress is stated as "3 of 24", which a mailbox can never say
// because a mailbox has no end.
//
// Coral is spent once per screen, on the primary action. Selection in the rail is ink, not coral,
// for that reason: two accents and neither is an accent.

type Lead = LeadDoc & { _id: string };
type Hypothesis = HypothesisDoc & { _id: string };
type Campaign = { dailyCap: number; revenueBase: number; stats: { sentToday: number } };

const STATUS_WORD: Record<string, string> = {
  sent: "Sent",
  approved: "Approved",
  dropped: "Dropped",
  replied: "Replied",
};

function QueueInner() {
  // Home's segment cards deep-link straight into one buyer's leads ("Review 5 waiting"), so the
  // filter has to be addressable rather than local-only state.
  const initialFilter = useSearchParams().get("filter") ?? "all";
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [hypotheses, setHypotheses] = useState<Hypothesis[] | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<string>(initialFilter);
  const [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});
  const [bulkApproved, setBulkApproved] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendNote, setSendNote] = useState<string | null>(null);
  const [rewriting, setRewriting] = useState(false);
  const [suppressPickerOpen, setSuppressPickerOpen] = useState(false);
  // "Not a fit" cannot complete without a reason, so the action bar is REPLACED by a reason row
  // rather than opening a modal over it. A modal would be a second decision on top of the first;
  // this is the same decision, finished.
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [undoFor, setUndoFor] = useState<{ id: string; name: string } | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Carried over from Today, which this screen replaced. It is the only place the product asks
  // whether an approved message actually worked, and that answer is the ground truth every
  // ranking signal is ultimately trying to predict — losing it in the merge would have been the
  // expensive kind of quiet deletion.
  const [judged, setJudged] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<"landed" | "missed" | null>(null);
  const activeCardRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadJson = (url: string) => fetch(url).then((r) => r.json().then((data) => ({ ok: r.ok, data })));

    Promise.all([loadJson("/api/leads?scope=queue"), loadJson("/api/campaign"), loadJson("/api/hypotheses")])
      .then(([leadsRes, campaignRes, hypothesesRes]) => {
        if (cancelled) return;
        const failed = [leadsRes, campaignRes, hypothesesRes].find((r) => !r.ok);
        if (failed) {
          setLoadError(failed.data?.error ?? "Couldn't load your leads.");
          return;
        }
        setLeads(leadsRes.data);
        setCampaign(campaignRes.data);
        setHypotheses(hypothesesRes.data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't reach the server.");
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // The first already-actioned lead nobody has judged yet. Derived rather than stored: the answer
  // is a pure function of the leads plus what has been answered this session, and holding it in
  // state meant an effect writing state on every load — which React now flags, correctly.
  // One at a time, never a backlog — a queue of "how did this go?" is a chore, one is a prompt.
  const feedbackLead = useMemo(
    () =>
      leads?.find(
        (l) => !l.feedback && !judged.has(l._id) && ["sent", "approved", "replied"].includes(l.status),
      ) ?? null,
    [leads, judged],
  );

  const submitFeedback = (value: "landed" | "missed") => {
    if (!feedbackLead) return;
    const id = feedbackLead._id;
    setFeedback(value);
    fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback: value }),
    }).catch(() => {});
    // Dismissed either way. A failed write must not trap the founder on the same question forever;
    // this is a useful signal, not something worth blocking the queue on.
    setTimeout(() => {
      setJudged((j) => new Set(j).add(id));
      setFeedback(null);
    }, 700);
  };

  const filtered = useMemo(() => {
    if (!leads) return [];
    // Quality bands first: with everything that qualified now shipping, triage is by score rather
    // than by scrolling. Persona filters still work for slicing a specific hypothesis.
    if (filter === "all") return leads;
    if (filter === "strong") return leads.filter((l) => tierFromTotal(l.scoreTotal ?? 0) === "strong");
    if (filter === "unread") return leads.filter((l) => l.status === "waiting");
    return leads.filter((l) => l.hypothesisKey === filter);
  }, [leads, filter]);

  // Keep the current person visible in the rail when J/K walks past its edge. Instant rather than
  // smooth under reduced motion — a rail that slides on every keypress is exactly the kind of
  // incidental animation that preference exists to turn off.
  useEffect(() => {
    const el = activeCardRef.current;
    if (!el) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest", inline: "center" });
  }, [selected, filter]);

  const primaryHypothesis = hypotheses?.find((h) => h.status === "primary") ?? null;
  const primaryWaitingCount = leads?.filter((l) => l.hypothesisKey === primaryHypothesis?.key && l.status === "waiting").length ?? 0;

  const sidebarBottom = (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 13px", display: "flex", flexDirection: "column", gap: 6, background: "var(--card)" }}>
      <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Sending today</span>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{campaign?.stats.sentToday ?? "—"} of {campaign?.dailyCap ?? "—"}</span>
      <div style={{ height: 4, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
        <div style={{ width: campaign ? `${Math.min(100, (campaign.stats.sentToday / campaign.dailyCap) * 100)}%` : "0%", height: "100%", background: "var(--green)" }} />
      </div>
    </div>
  );

  // Keyboard operation of the whole deck.
  //
  // Registered above the early returns so the hook order is stable, and closing over `filtered` so
  // it moves through what is actually on screen. Every shortcut is a no-op while typing — a founder
  // editing a draft must be able to write the letter "e" without the app interpreting it — and
  // while the reason row is open, because a stray key there would drop someone with a reason they
  // did not choose.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (rejectingId) {
        if (e.key === "Escape") setRejectingId(null);
        return;
      }

      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
        setEditing(false);
      } else if (k === "k" || e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((i) => Math.max(0, i - 1));
        setEditing(false);
      } else if (k === "e") {
        e.preventDefault();
        setEditing((v) => !v);
      } else if (k === "x") {
        e.preventDefault();
        const current = filtered[Math.min(selected, Math.max(0, filtered.length - 1))];
        if (current && current.status === "waiting") setRejectingId(current._id);
      } else if (k === "?") {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      } else if (e.key === "Escape") {
        setShortcutsOpen(false);
        setEditing(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, selected, rejectingId]);

  if (loadError) {
    return (
      <DashboardShell active="work" bottom={sidebarBottom}>
        <div style={{ padding: "36px 5vw", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14 }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>Couldn&apos;t load your leads.</span>
          <span style={{ fontSize: 14.5, color: "var(--muted)" }}>{loadError}</span>
          <button className="ky-btn-ember" onClick={() => { setLoadError(null); setAttempt((a) => a + 1); }} style={{ padding: "11px 20px", fontSize: 14.5, border: "none" }}>
            Try again
          </button>
        </div>
      </DashboardShell>
    );
  }

  if (!leads || !hypotheses || !campaign) {
    return (
      <DashboardShell active="work" bottom={sidebarBottom}>
        <div style={{ padding: "36px 5vw", color: "var(--muted)" }}>Loading…</div>
      </DashboardShell>
    );
  }

  if (leads.length === 0) {
    return (
      <DashboardShell active="work" bottom={sidebarBottom}>
        <div style={{ padding: "36px 5vw", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16, maxWidth: 560 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20 }}>No one to work through yet.</span>
            <p style={{ margin: 0, fontSize: 15, color: "var(--muted)", lineHeight: 1.6 }}>
              Everyone here came from a real search — if it hasn&apos;t found anyone yet, there&apos;s nothing to pad the
              list with. Run the search again, or widen who you&apos;re looking for on the campaign page.
            </p>
          </div>
          <SearchAgainButton onDone={() => { setLoadError(null); setAttempt((a) => a + 1); }} />
        </div>
      </DashboardShell>
    );
  }

  const index = Math.min(selected, Math.max(0, filtered.length - 1));
  const lead = filtered[index] ?? leads[0];
  const status = lead.status;
  const draftBody = draftEdits[lead._id] ?? lead.draft;
  const decidedCount = filtered.filter((l) => l.status !== "waiting").length;

  const selectIndex = (i: number) => {
    setSelected(i);
    setEditing(false);
    setSendError(null);
    setSuppressPickerOpen(false);
  };

  const moveToNextWaiting = (fromList: Lead[], fromIdx: number) => {
    const next = fromList.findIndex((l, i) => i > fromIdx && l.status === "waiting");
    setSelected(next >= 0 ? next : Math.min(fromIdx, fromList.length - 1));
  };

  const patchLead = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  };

  const approve = async () => {
    setSendError(null);
    setSendNote(null);
    const updated = await patchLead(lead._id, { status: "approved", draft: draftBody });
    if (updated.sendError) setSendError(updated.sendError);
    if (updated.sendNote) setSendNote(updated.sendNote);
    setLeads((ls) => ls!.map((l) => (l._id === lead._id ? { ...l, status: updated.status, draft: updated.draft } : l)));
    if (updated.status === "sent") {
      setCampaign((c) => (c ? { ...c, stats: { ...c.stats, sentToday: c.stats.sentToday + 1 } } : c));
    }
    setEditing(false);
    moveToNextWaiting(filtered, index);
  };

  /**
   * Drop a lead WITH a reason. There is no reason-free path any more.
   *
   * Every rejection is a training signal — it re-ranks this founder's queue through
   * /api/leads' demotion pass — and a dismissal without one is that signal thrown away. The
   * optimistic update happens first because the founder has already decided; the write catching up
   * afterwards is not something they should have to wait for.
   */
  const reject = async (reason: RejectionReason) => {
    const target = lead;
    setRejectingId(null);
    setLeads((ls) => ls!.map((l) => (l._id === target._id ? { ...l, status: "dropped" } : l)));
    setEditing(false);
    setUndoFor({ id: target._id, name: target.name });
    moveToNextWaiting(filtered, index);
    await fetch(`/api/leads/${target._id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }).catch(() => {});
  };

  const undoReject = async (id: string) => {
    setUndoFor(null);
    setLeads((ls) => ls!.map((l) => (l._id === id ? { ...l, status: "waiting" } : l)));
    await fetch(`/api/leads/${id}/reject`, { method: "DELETE" }).catch(() => {});
  };

  const suppress = async (reason: SuppressionReason) => {
    setSuppressPickerOpen(false);
    const res = await fetch(`/api/leads/${lead._id}/suppress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (res.ok) {
      setLeads((ls) => ls!.map((l) => (l._id === lead._id ? { ...l, status: "dropped" } : l)));
      setEditing(false);
      moveToNextWaiting(filtered, index);
    }
  };

  const rewriteWithAi = async () => {
    setRewriting(true);
    try {
      const res = await fetch(`/api/leads/${lead._id}/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const updated = await res.json();
      if (res.ok) {
        setDraftEdits((d) => ({ ...d, [lead._id]: updated.draft }));
        setLeads((ls) => ls!.map((l) => (l._id === lead._id ? { ...l, subject: updated.subject, draft: updated.draft } : l)));
      }
    } finally {
      setRewriting(false);
    }
  };

  const approveAllPrimary = async () => {
    if (!primaryHypothesis) return;
    const res = await fetch("/api/leads/bulk-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hypothesisKey: primaryHypothesis.key }),
    });
    const result = await res.json();
    const refreshed: Lead[] = await fetch("/api/leads?scope=queue").then((r) => r.json());
    setLeads(refreshed);
    if (result.sent > 0) {
      setCampaign((c) => (c ? { ...c, stats: { ...c.stats, sentToday: c.stats.sentToday + result.sent } } : c));
    }
    setBulkApproved(true);
  };

  const filters = [
    { key: "all", label: `Everyone ${leads.length}` },
    // Named to match the tiers on the cards. "★ 3+" filtered on a scale the UI no longer shows
    // anywhere, so it asked the founder to think in a unit that had been deleted.
    { key: "strong", label: `Strong ${leads.filter((l) => tierFromTotal(l.scoreTotal ?? 0) === "strong").length}` },
    { key: "unread", label: `Undecided ${leads.filter((l) => l.status === "waiting").length}` },
    ...(hypotheses ?? [])
      .map((h) => ({ key: h.key, count: leads.filter((l) => l.hypothesisKey === h.key).length, name: h.name }))
      .filter((h) => h.count > 0)
      .map((h) => ({ key: h.key, label: `${h.name} ${h.count}` })),
  ].filter((f) => !/ 0$/.test(f.label));

  return (
    <DashboardShell active="work" bottom={sidebarBottom}>
      <style>{`
        .ky-rail { scrollbar-width: thin; scroll-snap-type: x proximity; }
        .ky-rail::-webkit-scrollbar { height: 6px; }
        .ky-rail::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 999px; }
        .ky-deck { padding: 30px 5vw 40px; }
        @media (max-width: 700px) { .ky-deck { padding: 22px 20px 32px; } }
      `}</style>

      <div className="ky-deck" style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 940, boxSizing: "border-box" }}>
        {/* ---- Where you are, and in what ---- */}
        <header style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 27, letterSpacing: "-.03em", margin: 0 }}>
              {leads.length} {leads.length === 1 ? "person" : "people"} worth talking to
            </h1>
            <button
              onClick={() => setShortcutsOpen((v) => !v)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--muted)", padding: 0 }}
            >
              Keyboard shortcuts
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, fontSize: 13.5, flexWrap: "wrap" }}>
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => { setFilter(f.key); setSelected(0); }}
                style={{
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 13.5,
                  background: filter === f.key ? "var(--ink)" : "transparent",
                  color: filter === f.key ? "var(--card)" : "var(--muted-strong)",
                  border: filter === f.key ? "1px solid var(--ink)" : "1px solid var(--border)",
                  padding: "6px 13px",
                  borderRadius: 999,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* A deck has an end; a mailbox does not. Saying so is the single clearest difference
              between "work through these" and "here is your mail". */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, fontSize: 13.5, color: "var(--muted)" }}>
              <span>
                <span className="ky-tnum" style={{ color: "var(--ink)", fontWeight: 600 }}>{index + 1}</span> of{" "}
                <span className="ky-tnum">{filtered.length}</span> · sorted strongest first
              </span>
              <span>{decidedCount} decided</span>
            </div>
            <div style={{ height: 3, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
              <div style={{ width: `${filtered.length ? ((index + 1) / filtered.length) * 100 : 0}%`, height: "100%", background: "var(--ink)" }} />
            </div>
          </div>
        </header>

        {feedbackLead && (
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "var(--card-alt)" }}>
            <span style={{ fontSize: 13.5, color: "var(--muted)", flex: 1, minWidth: 160 }}>
              Your reply to {feedbackLead.name} — how did it land?
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="ky-btn-outline"
                onClick={() => submitFeedback("landed")}
                style={{
                  padding: "6px 13px",
                  fontSize: 13,
                  fontWeight: 600,
                  minHeight: 0,
                  color: feedback === "landed" ? "var(--on-ember)" : "var(--green)",
                  background: feedback === "landed" ? "var(--green)" : "transparent",
                  borderColor: feedback === "landed" ? "var(--green)" : "var(--border-strong)",
                }}
              >
                Landed
              </button>
              <button
                className="ky-btn-outline"
                onClick={() => submitFeedback("missed")}
                style={{
                  padding: "6px 13px",
                  fontSize: 13,
                  fontWeight: 600,
                  minHeight: 0,
                  color: feedback === "missed" ? "var(--on-ember)" : "var(--muted)",
                  background: feedback === "missed" ? "var(--muted)" : "transparent",
                }}
              >
                Missed
              </button>
            </div>
          </div>
        )}

        {/* ---- The rest of the run, as a rail rather than a mail list ---- */}
        {/* The rail's inset padding is not spacing: `overflow-x: auto` computes `overflow-y` to
            auto as well, so a focus ring drawn at 2px offset outside a card would be clipped on the
            top and bottom edges. Four pixels of room keeps keyboard focus visible. */}
        <div
          className="ky-rail"
          style={{ display: "flex", gap: 10, overflowX: "auto", padding: "4px 4px 10px", margin: "-4px -4px 0" }}
        >
          {filtered.map((l, i) => {
            const decided = l.status !== "waiting";
            const current = i === index;
            return (
              <button
                key={l._id}
                ref={current ? activeCardRef : undefined}
                onClick={() => selectIndex(i)}
                aria-current={current ? "true" : undefined}
                style={{
                  flex: "0 0 auto",
                  width: 158,
                  scrollSnapAlign: "center",
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                  padding: "11px 13px",
                  borderRadius: 12,
                  border: current ? "1px solid var(--ink)" : "1px solid var(--border)",
                  background: current ? "var(--active-bg)" : "var(--card)",
                  opacity: decided && !current ? 0.5 : 1,
                }}
              >
                <span className="ky-tnum" style={{ fontSize: 11.5, color: "var(--faint)" }}>{i + 1}</span>
                <span style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {l.name}
                </span>
                <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {decided ? STATUS_WORD[l.status] ?? l.status : l.company}
                </span>
              </button>
            );
          })}
        </div>

        {/* ---- The one person in front of you ---- */}
        <section style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 25, letterSpacing: "-.02em" }}>{lead.name}</span>
                <LeadTier total={lead.scoreTotal} breakdown={lead.scoreBreakdown} />
              </div>
              <span style={{ fontSize: 14.5, color: "var(--muted)" }}>
                {lead.role} · found in {lead.company}
                {lead.postedAt ? ` · posted ${relativeTime(lead.postedAt)}` : ""}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {(status === "approved" || status === "sent") && (
                <span style={{ fontSize: 12.5, color: "var(--green)", fontWeight: 600, background: "var(--green-tint)", padding: "5px 10px", borderRadius: 999 }}>
                  {status === "sent" ? "Sent via Gmail" : "Approved"}
                </span>
              )}
              {status === "dropped" && (
                <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600, background: "var(--active-bg)", padding: "5px 10px", borderRadius: 999 }}>Dropped</span>
              )}
              {lead.email && <span style={{ fontSize: 12.5, color: "var(--muted)", border: "1px solid var(--border)", padding: "5px 10px", borderRadius: 999 }}>Verified email</span>}
            </div>
          </div>

          {/* The evidence, not a description of it. Their own words, verified to be a literal span
              of the real post, plus the link so any claim here can be checked in one click. */}
          <div style={{ border: "1px solid var(--border)", borderRadius: 14, background: "var(--card-alt)", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".07em" }}>What they said</span>
              {lead.intentTier && (
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    color: lead.intentTier === "seeking" ? "var(--green)" : "var(--muted)",
                    background: lead.intentTier === "seeking" ? "var(--green-tint)" : "var(--active-bg)",
                    padding: "3px 9px",
                    borderRadius: 999,
                  }}
                >
                  {lead.intentTier === "seeking" ? "Actively looking" : lead.intentTier === "complaining" ? "Describing the problem" : "Adjacent interest"}
                </span>
              )}
            </div>
            <blockquote style={{ margin: 0, fontSize: 16.5, lineHeight: 1.65, color: "var(--ink)", borderLeft: "3px solid var(--border-strong)", paddingLeft: 14 }}>
              {lead.excerpt || lead.detail}
            </blockquote>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 13.5, color: "var(--muted)" }}>
              {lead.permalink ? (
                <a href={lead.permalink} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>
                  Read the original post →
                </a>
              ) : (
                <span>No link on file for this one.</span>
              )}
              {lead.quoteMeta && <span>{lead.quoteMeta}</span>}
            </div>
          </div>

          {/* Hairline, no lift. The reading pane needed elevation to separate itself from the list
              beside it; a single column does not, and a shadow here is the last piece of chrome
              that made this look like a message open in a client. */}
          <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".07em" }}>What you&apos;d send back</span>
              {lead.subject && (
                <span style={{ fontSize: 13, color: "var(--muted)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Subject · {lead.subject}
                </span>
              )}
            </div>
            {editing ? (
              <textarea
                autoFocus
                value={draftBody}
                onChange={(e) => setDraftEdits((d) => ({ ...d, [lead._id]: e.target.value }))}
                rows={8}
                style={{ fontSize: 16.5, lineHeight: 1.7, color: "var(--ink)", border: "1px solid var(--border-strong)", borderRadius: 10, padding: 12, fontFamily: "inherit", resize: "vertical" }}
              />
            ) : draftBody.trim() ? (
              <div style={{ fontSize: 16.5, lineHeight: 1.7, color: "var(--ink)", display: "flex", flexDirection: "column", gap: 14 }}>
                {draftBody.split("\n\n").map((p, i) => (
                  <span key={i}>{p}</span>
                ))}
              </div>
            ) : (
              // Drafts are written on demand rather than during the search, so no draft yet is the
              // normal state for a fresh lead — not an error, and not something to leave blank.
              <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.6 }}>
                  Nothing written yet. I&apos;ll draft something anchored to what they actually said above.
                </span>
                <button
                  className="ky-btn-ember"
                  onClick={rewriteWithAi}
                  disabled={rewriting}
                  style={{ padding: "12px 20px", fontSize: 15, border: "none", opacity: rewriting ? 0.6 : 1 }}
                >
                  {rewriting ? "Writing…" : "✦ Write it"}
                </button>
              </div>
            )}
            {sendError && <span style={{ fontSize: 13, color: "var(--ember)" }}>{sendError}</span>}
            {sendNote && <span style={{ fontSize: 13, color: "var(--muted)" }}>{sendNote}</span>}
          </div>

          {/* ---- Decide ---- */}
          {rejectingId === lead._id ? (
            // The reason row REPLACES the action bar for the length of one decision. An inline row
            // rather than a modal, because this is the same decision the founder already started —
            // a dialog would make it two.
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13.5, color: "var(--muted)", marginRight: 2 }}>Why?</span>
              {REJECTION_REASONS.map((r) => (
                <button
                  key={r}
                  className="ky-btn-outline"
                  onClick={() => reject(r)}
                  style={{ padding: "9px 14px", fontSize: 13.5, fontWeight: 500, minHeight: 0 }}
                >
                  {REJECTION_REASON_LABELS[r]}
                </button>
              ))}
              <button
                onClick={() => setRejectingId(null)}
                style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--muted)" }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {editing ? (
                <button
                  className="ky-btn-ember"
                  onClick={async () => {
                    await patchLead(lead._id, { draft: draftBody });
                    setLeads((ls) => ls!.map((l) => (l._id === lead._id ? { ...l, draft: draftBody } : l)));
                    setEditing(false);
                  }}
                  style={{ padding: "13px 22px", fontSize: 15.5, border: "none" }}
                >
                  Save draft
                </button>
              ) : status === "waiting" ? (
                <button
                  className={draftBody.trim() ? "ky-btn-ember" : "ky-btn-outline"}
                  onClick={approve}
                  style={{ padding: "13px 22px", fontSize: 15.5, border: draftBody.trim() ? "none" : undefined }}
                >
                  {lead.email ? "Approve · send today" : "Mark as handled"}
                </button>
              ) : (
                <button className="ky-btn-outline" disabled style={{ padding: "13px 22px", fontSize: 15.5, opacity: 0.6 }}>
                  {STATUS_WORD[status] ?? status}
                </button>
              )}
              <button className="ky-btn-outline" onClick={() => setEditing((e) => !e)} style={{ padding: "12px 18px", fontSize: 15.5, fontWeight: 500 }}>
                {editing ? "Cancel" : "Edit"}
              </button>
              {editing && status === "waiting" && (
                <button
                  className="ky-btn-outline"
                  onClick={rewriteWithAi}
                  disabled={rewriting}
                  style={{ padding: "12px 18px", fontSize: 15.5, fontWeight: 500, opacity: rewriting ? 0.6 : 1 }}
                >
                  {rewriting ? "Rewriting…" : "✦ Rewrite with AI"}
                </button>
              )}
              {status === "waiting" && !editing && (
                <button
                  className="ky-btn-outline"
                  onClick={() => setRejectingId(lead._id)}
                  style={{ padding: "12px 18px", fontSize: 15.5, fontWeight: 500, color: "var(--muted)" }}
                >
                  Not a fit
                </button>
              )}
              {status === "waiting" && !editing && (
                <div style={{ position: "relative" }}>
                  <button
                    className="ky-btn-outline"
                    onClick={() => setSuppressPickerOpen((o) => !o)}
                    style={{ padding: "12px 18px", fontSize: 15.5, fontWeight: 500, color: "var(--muted)" }}
                  >
                    Suppress
                  </button>
                  {suppressPickerOpen && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: "calc(100% + 8px)",
                        left: 0,
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        padding: 6,
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        boxShadow: "var(--lift-2)",
                        zIndex: 10,
                        minWidth: 200,
                      }}
                    >
                      {SUPPRESSION_REASONS.map((r) => (
                        <span
                          key={r}
                          onClick={() => suppress(r)}
                          style={{ fontSize: 14, padding: "9px 12px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" }}
                        >
                          {SUPPRESSION_REASON_LABELS[r]}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <span style={{ marginLeft: "auto", fontSize: 13.5, color: "var(--muted)" }}>Follow-up in 5 days if no reply</span>
            </div>
          )}

          {/* Undo. The rejection is already written, so this is a real reversal rather than a
              delayed commit — a founder who taps the wrong reason should not have to wait out a
              timer to fix it, and the row can sit here until they move on. */}
          {undoFor && (
            <div
              role="status"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: "var(--card-alt)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "10px 14px",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 13.5, color: "var(--muted)" }}>
                Dropped {undoFor.name}. The next search will use that.
              </span>
              <button
                onClick={() => undoReject(undoFor.id)}
                style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 700, color: "var(--ember)" }}
              >
                Undo
              </button>
            </div>
          )}

          {shortcutsOpen && (
            <div
              style={{
                display: "flex",
                gap: "6px 18px",
                flexWrap: "wrap",
                background: "var(--card-alt)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "12px 14px",
                fontSize: 13,
                color: "var(--muted)",
              }}
            >
              {[
                ["J / K", "next · previous"],
                ["E", "edit"],
                ["X", "not a fit"],
                ["Esc", "close"],
                ["?", "this"],
              ].map(([key, what]) => (
                <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <kbd
                    style={{
                      fontFamily: "inherit",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--ink)",
                      background: "var(--card)",
                      border: "1px solid var(--border-strong)",
                      borderRadius: 5,
                      padding: "1px 6px",
                    }}
                  >
                    {key}
                  </kbd>
                  {what}
                </span>
              ))}
            </div>
          )}

          {/* Walking the deck. The rail above is for jumping; these are for the ordinary case of
              working straight through, and they are the reason the screen needs no list column. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <button
              className="ky-btn-outline"
              onClick={() => selectIndex(Math.max(0, index - 1))}
              disabled={index === 0}
              style={{ padding: "10px 16px", fontSize: 14.5, fontWeight: 500, opacity: index === 0 ? 0.45 : 1 }}
            >
              ← Previous
            </button>
            <span className="ky-tnum" style={{ fontSize: 13, color: "var(--muted)" }}>{index + 1} / {filtered.length}</span>
            <button
              className="ky-btn-outline"
              onClick={() => selectIndex(Math.min(filtered.length - 1, index + 1))}
              disabled={index >= filtered.length - 1}
              style={{ padding: "10px 16px", fontSize: 14.5, fontWeight: 500, opacity: index >= filtered.length - 1 ? 0.45 : 1 }}
            >
              Next person →
            </button>
          </div>
        </section>

        {primaryHypothesis && primaryWaitingCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 16, gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, color: "var(--muted)" }}>
              {bulkApproved
                ? `${primaryHypothesis.name} batch approved — spacing them under your daily cap.`
                : `Approve all ${primaryWaitingCount} to the ${primaryHypothesis.name.toLowerCase()} hypothesis?`}
            </span>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="ky-btn-outline"
                onClick={approveAllPrimary}
                disabled={bulkApproved}
                style={{ padding: "10px 16px", fontSize: 14.5, fontWeight: 500, opacity: bulkApproved ? 0.6 : 1 }}
              >
                {bulkApproved ? "Approved" : `Approve all ${primaryWaitingCount}`}
              </button>
              <button className="ky-btn-outline" onClick={() => { setFilter(primaryHypothesis.key); setSelected(0); }} style={{ padding: "10px 16px", fontSize: 14.5, fontWeight: 500, color: "var(--muted)" }}>
                Read them first
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

export default function QueuePage() {
  return (
    <Suspense fallback={null}>
      <QueueInner />
    </Suspense>
  );
}
