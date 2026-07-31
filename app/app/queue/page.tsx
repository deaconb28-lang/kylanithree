"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import SearchAgainButton from "../../../components/dashboard/SearchAgainButton";
import type { HypothesisDoc, LeadDoc, SuppressionReason } from "../../../lib/collections";
import { SUPPRESSION_REASON_LABELS, SUPPRESSION_REASONS } from "../../../lib/suppression";
import LeadStars from "../../../components/LeadStars";
import { starsFromTotal, labelFromTotal } from "../../../lib/search/leadScore";
import { relativeTime } from "../../../lib/relativeTime";

type Lead = LeadDoc & { _id: string };
type Hypothesis = HypothesisDoc & { _id: string };
type Campaign = { dailyCap: number; revenueBase: number; stats: { sentToday: number } };

export default function QueuePage() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [hypotheses, setHypotheses] = useState<Hypothesis[] | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});
  const [bulkApproved, setBulkApproved] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendNote, setSendNote] = useState<string | null>(null);
  const [rewriting, setRewriting] = useState(false);
  const [suppressPickerOpen, setSuppressPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadJson = (url: string) => fetch(url).then((r) => r.json().then((data) => ({ ok: r.ok, data })));

    Promise.all([loadJson("/api/leads?scope=queue"), loadJson("/api/campaign"), loadJson("/api/hypotheses")])
      .then(([leadsRes, campaignRes, hypothesesRes]) => {
        if (cancelled) return;
        const failed = [leadsRes, campaignRes, hypothesesRes].find((r) => !r.ok);
        if (failed) {
          setLoadError(failed.data?.error ?? "Couldn't load Queue.");
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

  const filtered = useMemo(() => {
    if (!leads) return [];
    // Quality bands first: with everything that qualified now shipping, triage is by score rather
    // than by scrolling. Persona filters still work for slicing a specific hypothesis.
    if (filter === "all") return leads;
    if (filter === "hot") return leads.filter((l) => (l.stars ?? 0) >= 4);
    if (filter === "strong") return leads.filter((l) => (l.stars ?? 0) >= 3);
    if (filter === "unread") return leads.filter((l) => l.status === "waiting");
    return leads.filter((l) => l.hypothesisKey === filter);
  }, [leads, filter]);

  const scoreOf = (l: Lead) =>
    typeof l.scoreTotal === "number"
      ? {
          total: l.scoreTotal,
          stars: l.stars ?? starsFromTotal(l.scoreTotal),
          label: l.scoreLabel ?? labelFromTotal(l.scoreTotal),
          breakdown: l.scoreBreakdown ?? { intent: 0, confidence: 0, recency: 0, engagement: 0 },
        }
      : null;

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

  if (loadError) {
    return (
      <DashboardShell active="queue" bottom={sidebarBottom}>
        <div style={{ padding: "36px 5vw", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14 }}>
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 18 }}>Couldn&apos;t load Queue.</span>
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
      <DashboardShell active="queue" bottom={sidebarBottom}>
        <div style={{ padding: "36px 5vw", color: "var(--muted)" }}>Loading…</div>
      </DashboardShell>
    );
  }

  if (leads.length === 0) {
    return (
      <DashboardShell active="queue" bottom={sidebarBottom}>
        <div style={{ padding: "36px 5vw", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16, maxWidth: 560 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 20 }}>Nothing in Queue yet.</span>
            <p style={{ margin: 0, fontSize: 15, color: "var(--muted)", lineHeight: 1.6 }}>
              Every lead here came from a real search — if it hasn&apos;t found anyone yet, there&apos;s nothing to pad the
              list with. Check Today for anything time-sensitive, or run the search again.
            </p>
          </div>
          <SearchAgainButton onDone={() => { setLoadError(null); setAttempt((a) => a + 1); }} />
        </div>
      </DashboardShell>
    );
  }

  const lead = filtered[Math.min(selected, Math.max(0, filtered.length - 1))] ?? leads[0];
  const status = lead.status;
  const draftBody = draftEdits[lead._id] ?? lead.draft;

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
    moveToNextWaiting(filtered, selected);
  };

  const drop = async () => {
    await patchLead(lead._id, { status: "dropped" });
    setLeads((ls) => ls!.map((l) => (l._id === lead._id ? { ...l, status: "dropped" } : l)));
    setEditing(false);
    moveToNextWaiting(filtered, selected);
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
      moveToNextWaiting(filtered, selected);
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

  return (
    <DashboardShell active="queue" bottom={sidebarBottom}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 420px) 1fr", minHeight: "100vh" }} className="queue-grid">
        <style>{`@media (max-width: 900px) { .queue-grid { grid-template-columns: 1fr !important; } .queue-list { max-height: 340px; } }`}</style>

        <div className="queue-list" style={{ borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "26px 26px 18px", display: "flex", flexDirection: "column", gap: 14, borderBottom: "1px solid var(--border)" }}>
            <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: 26, letterSpacing: "-.03em", margin: 0 }}>
              {leads.length} {leads.length === 1 ? "person" : "people"} worth talking to
            </h1>
            <span style={{ fontSize: 14.5, color: "var(--muted)", lineHeight: 1.5 }}>
              Sorted strongest first. Each one is a real post you can open and read — start at the top.
            </span>
            <div style={{ display: "flex", gap: 8, fontSize: 13.5, flexWrap: "wrap" }}>
              {[
                { key: "all", label: `All ${leads.length}` },
                { key: "hot", label: `★ 4+ · ${leads.filter((l) => (l.stars ?? 0) >= 4).length}` },
                { key: "strong", label: `★ 3+ · ${leads.filter((l) => (l.stars ?? 0) >= 3).length}` },
                { key: "unread", label: `Not actioned ${leads.filter((l) => l.status === "waiting").length}` },
                ...(hypotheses ?? [])
                .map((h) => ({ key: h.key, count: leads.filter((l) => l.hypothesisKey === h.key).length, name: h.name }))
                .filter((h) => h.count > 0)
                  .map((h) => ({ key: h.key, label: `${h.name} ${h.count}` })),
              ]
                .filter((f) => !/ 0$/.test(f.label))
                .map((f) => (
                <span
                  key={f.key}
                  onClick={() => { setFilter(f.key); setSelected(0); }}
                  style={{
                    cursor: "pointer",
                    background: filter === f.key ? "var(--ink)" : "transparent",
                    color: filter === f.key ? "var(--card)" : "var(--muted-strong)",
                    border: filter === f.key ? "none" : "1px solid var(--border)",
                    padding: "6px 12px",
                    borderRadius: 999,
                  }}
                >
                  {f.label}
                </span>
                ))}
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
            {filtered.map((l, i) => {
              const st = l.status;
              const sc = scoreOf(l);
              const actioned = st !== "waiting";
              return (
                <div
                  key={l._id}
                  onClick={() => selectIndex(i)}
                  style={{
                    padding: "14px 22px",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    cursor: "pointer",
                    opacity: st === "dropped" ? 0.5 : 1,
                    background: i === selected ? "#F7F3EE" : "transparent",
                    borderLeft: i === selected ? "2px solid var(--ember)" : "2px solid transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {/* An unactioned lead gets a dot, the way an unread message does — the fastest
                        possible read of "have I dealt with this". */}
                    {!actioned && <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--ember)", flexShrink: 0 }} />}
                    <span style={{ fontSize: 15, fontWeight: actioned ? 500 : 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {l.name}
                    </span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {relativeTime(l.postedAt)}
                    </span>
                  </div>
                  {sc && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <LeadStars score={sc} size={12} showLabel={false} />
                      <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {l.company}
                      </span>
                      {st === "sent" && <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--green)", fontWeight: 600 }}>Sent</span>}
                      {st === "approved" && <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--green)", fontWeight: 600 }}>Approved</span>}
                      {st === "dropped" && <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>Dropped</span>}
                    </div>
                  )}
                  <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {l.excerpt || l.detail}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "32px 5vw", display: "flex", flexDirection: "column", gap: 20, boxSizing: "border-box", maxWidth: 900 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 24, letterSpacing: "-.02em" }}>{lead.name}</span>
                {typeof lead.scoreTotal === "number" && (
                  <LeadStars
                    size={16}
                    score={{
                      total: lead.scoreTotal,
                      stars: lead.stars ?? starsFromTotal(lead.scoreTotal),
                      label: lead.scoreLabel ?? labelFromTotal(lead.scoreTotal),
                      breakdown: lead.scoreBreakdown ?? { intent: 0, confidence: 0, recency: 0, engagement: 0 },
                    }}
                  />
                )}
              </div>
              <span style={{ fontSize: 14.5, color: "var(--muted)" }}>
                {lead.role} · found in {lead.company}
                {lead.postedAt ? ` · posted ${relativeTime(lead.postedAt)}` : ""}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {status === "approved" && (
                <span style={{ fontSize: 12.5, color: "var(--green)", fontWeight: 600, background: "var(--green-tint)", padding: "5px 10px", borderRadius: 999 }}>Approved</span>
              )}
              {status === "sent" && (
                <span style={{ fontSize: 12.5, color: "var(--green)", fontWeight: 600, background: "var(--green-tint)", padding: "5px 10px", borderRadius: 999 }}>Sent via Gmail</span>
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
              <span style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".07em" }}>What they said</span>
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
            <blockquote style={{ margin: 0, fontSize: 16.5, lineHeight: 1.65, color: "var(--ink)", borderLeft: "3px solid var(--ember)", paddingLeft: 14 }}>
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

          <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: "22px 24px", display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 1px 2px rgba(20,18,15,.04)" }}>
            {lead.subject ? (
              <div style={{ display: "flex", gap: 10, fontSize: 14.5, color: "var(--muted)", borderBottom: "1px solid var(--border)", paddingBottom: 12, flexWrap: "wrap" }}>
                <span style={{ color: "var(--ink)", fontWeight: 600 }}>Subject:</span>
                <span style={{ color: "var(--ink)" }}>{lead.subject}</span>
              </div>
            ) : null}
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
                  No reply written yet. I&apos;ll draft one anchored to what they actually said above.
                </span>
                <button
                  className="ky-btn-ember"
                  onClick={rewriteWithAi}
                  disabled={rewriting}
                  style={{ padding: "12px 20px", fontSize: 15, border: "none", opacity: rewriting ? 0.6 : 1 }}
                >
                  {rewriting ? "Writing…" : "✦ Write the reply"}
                </button>
              </div>
            )}
            {sendError && <span style={{ fontSize: 13, color: "var(--ember)" }}>{sendError}</span>}
            {sendNote && <span style={{ fontSize: 13, color: "var(--muted)" }}>{sendNote}</span>}
            <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4, borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
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
                  {status === "dropped" ? "Dropped" : status === "sent" ? "Sent" : "Approved"}
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
                <button className="ky-btn-outline" onClick={drop} style={{ padding: "12px 18px", fontSize: 15.5, fontWeight: 500, color: "var(--muted)" }}>
                  Drop
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
                        boxShadow: "0 1px 2px rgba(20,18,15,.05), 0 18px 40px -22px rgba(20,18,15,.25)",
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
          </div>

          {primaryHypothesis && (
            <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 16, gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, color: "var(--muted)" }}>
                {bulkApproved
                  ? `${primaryHypothesis.name} batch approved — spacing them under your daily cap.`
                  : `Approve all ${primaryWaitingCount} to the ${primaryHypothesis.name.toLowerCase()} hypothesis?`}
              </span>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="ky-btn-outline"
                  onClick={approveAllPrimary}
                  disabled={bulkApproved || primaryWaitingCount === 0}
                  style={{ padding: "10px 16px", fontSize: 14.5, fontWeight: 500, opacity: bulkApproved || primaryWaitingCount === 0 ? 0.6 : 1 }}
                >
                  {bulkApproved ? "Approved" : `Approve all ${primaryWaitingCount}`}
                </button>
                <button className="ky-btn-outline" onClick={() => setFilter(primaryHypothesis.key)} style={{ padding: "10px 16px", fontSize: 14.5, fontWeight: 500, color: "var(--muted)" }}>
                  Read them first
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
