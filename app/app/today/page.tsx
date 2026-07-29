"use client";

import { useEffect, useState } from "react";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import type { LeadDoc } from "../../../lib/collections";

type Lead = LeadDoc & { _id: string };
type Campaign = { dailyCap: number; stats: { sentToday: number } };

function initialsFor(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function hoursAgo(iso: string) {
  const hours = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000));
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

export default function TodayPage() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [feedbackLead, setFeedbackLead] = useState<Lead | null>(null);
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<"landed" | "missed" | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [sentCount, setSentCount] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendNote, setSendNote] = useState<string | null>(null);
  const [rewriting, setRewriting] = useState(false);

  useEffect(() => {
    fetch("/api/leads")
      .then((r) => r.json())
      .then((all: Lead[]) => {
        const today = all.filter((l) => l.timeSensitive && l.status === "waiting");
        setLeads(today);
        if (today[0]) setDraftText(today[0].draft);
        const candidate = all.find((l) => !l.feedback && ["sent", "approved", "replied"].includes(l.status));
        setFeedbackLead(candidate ?? null);
      });
    fetch("/api/campaign")
      .then((r) => r.json())
      .then(setCampaign);
  }, []);

  const submitFeedback = (value: "landed" | "missed") => {
    setFeedback(value);
    if (feedbackLead) {
      fetch(`/api/leads/${feedbackLead._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: value }),
      }).catch(() => {});
    }
  };

  const advance = async (post: boolean) => {
    const lead = leads?.[index];
    setSendError(null);
    setSendNote(null);
    if (post && lead) {
      try {
        const res = await fetch(`/api/leads/${lead._id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "approved", draft: draftText }),
        });
        const updated = await res.json();
        if (updated.sendError) setSendError(updated.sendError);
        if (updated.sendNote) setSendNote(updated.sendNote);
        if (updated.status === "sent") {
          setSentCount((n) => n + 1);
          setCampaign((c) => (c ? { ...c, stats: { ...c.stats, sentToday: c.stats.sentToday + 1 } } : c));
        }
      } catch {
        setSendError("Couldn't reach the server.");
      }
    }
    const next = index + 1;
    setIndex(next);
    setEditing(false);
    if (leads?.[next]) setDraftText(leads[next].draft);
  };

  const sidebarBottom = (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 13px", display: "flex", flexDirection: "column", gap: 6, background: "var(--card)" }}>
      <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Sending today</span>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{campaign?.stats.sentToday ?? "—"} of {campaign?.dailyCap ?? "—"}</span>
      <div style={{ height: 4, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
        <div style={{ width: campaign ? `${Math.min(100, (campaign.stats.sentToday / campaign.dailyCap) * 100)}%` : "0%", height: "100%", background: "var(--green)" }} />
      </div>
    </div>
  );

  if (!leads) {
    return (
      <DashboardShell active="today" bottom={sidebarBottom}>
        <div style={{ padding: "36px 5vw", color: "var(--muted)" }}>Loading…</div>
      </DashboardShell>
    );
  }

  const lead = leads[index];
  const upcoming = leads.slice(index + 1);
  const done = index >= leads.length;
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });

  const rewriteWithAi = async () => {
    setRewriting(true);
    try {
      const res = await fetch(`/api/leads/${lead._id}/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const updated = await res.json();
      if (res.ok) setDraftText(updated.draft);
    } finally {
      setRewriting(false);
    }
  };

  return (
    <DashboardShell active="today" bottom={sidebarBottom}>
      <div style={{ position: "relative", overflow: "hidden", padding: "36px 5vw", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 20, maxWidth: 1180, margin: "0 auto" }}>
        <div
          style={{
            position: "absolute",
            inset: "-140px -60px auto -60px",
            height: 560,
            opacity: "var(--wash)",
            background:
              "radial-gradient(50% 60% at 22% 0%, #FFE8D6 0%, rgba(255,232,214,0) 62%), radial-gradient(46% 56% at 84% 6%, #E8EEFF 0%, rgba(232,238,255,0) 64%)",
          }}
        />

        <div style={{ position: "relative", display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 14.5, color: "var(--muted)" }}>{today} · time-sensitive — posted in the last few hours</span>
            <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(26px, 3.2vw, 38px)", lineHeight: 1.05, letterSpacing: "-.03em", margin: 0 }}>
              {done ? "You're caught up." : `${leads.length} people described your problem yesterday.`}
            </h1>
          </div>
          {!done && <span style={{ fontSize: 14.5, color: "var(--muted)" }}>{index + 1} of {leads.length}</span>}
        </div>

        {done ? (
          <div className="ky-fade-in" style={{ position: "relative", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, padding: "40px 5vw", display: "flex", flexDirection: "column", gap: 12, textAlign: "center", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 22 }}>Nothing time-sensitive left today.</span>
            <p style={{ margin: 0, fontSize: 15, color: "var(--muted)", maxWidth: 480, lineHeight: 1.6 }}>
              {sentCount} of {leads.length} sent. The rest of the backlog is in Queue whenever you have a minute — no rush.
            </p>
          </div>
        ) : (
          <div
            className="ky-fade-in"
            key={lead._id}
            style={{
              position: "relative",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 18,
              padding: "28px 5vw",
              display: "flex",
              flexDirection: "column",
              gap: 20,
              boxShadow: "0 1px 2px rgba(20,18,15,.05), 0 26px 54px -26px rgba(20,18,15,.18)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: "var(--card-alt)", display: "grid", placeItems: "center", fontSize: 15, fontWeight: 700, color: "var(--muted)", flexShrink: 0 }}>
                {initialsFor(lead.name)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 200 }}>
                <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 21, letterSpacing: "-.02em" }}>{lead.name}</span>
                <span style={{ fontSize: 14, color: "var(--muted)" }}>
                  {lead.role}, {lead.company} · {lead.source} · {hoursAgo(lead.createdAt as unknown as string)}
                </span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--green)", background: "var(--green-tint)", padding: "6px 11px", borderRadius: 999, flexShrink: 0, whiteSpace: "nowrap" }}>
                {lead.tag ?? "New lead"}
              </span>
            </div>

            {lead.quote && (
              <div style={{ borderLeft: "2px solid var(--ember)", padding: "4px 0 4px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, fontStyle: "italic", color: "var(--ink)" }}>&ldquo;{lead.quote}&rdquo;</p>
                {lead.quoteMeta && <span style={{ fontSize: 13.5, color: "var(--muted)" }}>{lead.quoteMeta}</span>}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 15 }}>Your reply, drafted</span>
              {editing ? (
                <textarea
                  autoFocus
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  rows={5}
                  style={{ border: "1px solid var(--border-strong)", borderRadius: 14, padding: "20px 22px", background: "var(--card-alt)", fontSize: 16, lineHeight: 1.65, color: "var(--ink)", fontFamily: "inherit", resize: "vertical" }}
                />
              ) : (
                <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px", background: "var(--card-alt)", fontSize: 16, lineHeight: 1.65, color: "var(--ink)" }}>
                  {draftText}
                </div>
              )}
              {lead.draftMeta && <span style={{ fontSize: 13, color: "var(--muted)" }}>{lead.draftMeta}</span>}
              {sendError && <span style={{ fontSize: 13, color: "var(--ember)" }}>{sendError}</span>}
              {sendNote && <span style={{ fontSize: 13, color: "var(--muted)" }}>{sendNote}</span>}
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", paddingTop: 6 }}>
                {editing ? (
                  <button className="ky-btn-ember" onClick={() => setEditing(false)} style={{ padding: "13px 22px", fontSize: 15.5, border: "none" }}>
                    Save draft
                  </button>
                ) : (
                  <button className="ky-btn-ember" onClick={() => advance(true)} style={{ padding: "13px 22px", fontSize: 15.5, border: "none" }}>
                    {lead.postLabel ?? "Approve · send today"}
                  </button>
                )}
                <button className="ky-btn-outline" onClick={() => setEditing((e) => !e)} style={{ padding: "12px 18px", fontSize: 15.5, fontWeight: 500 }}>
                  {editing ? "Cancel" : "Edit"}
                </button>
                {editing && (
                  <button
                    className="ky-btn-outline"
                    onClick={rewriteWithAi}
                    disabled={rewriting}
                    style={{ padding: "12px 18px", fontSize: 15.5, fontWeight: 500, opacity: rewriting ? 0.6 : 1 }}
                  >
                    {rewriting ? "Rewriting…" : "✦ Rewrite with AI"}
                  </button>
                )}
                {!editing && (
                  <button className="ky-btn-outline" onClick={() => advance(false)} style={{ padding: "12px 18px", fontSize: 15.5, fontWeight: 500, color: "var(--muted)" }}>
                    Skip
                  </button>
                )}
                <span style={{ marginLeft: "auto", fontSize: 13.5, color: "var(--muted)" }}>Also queued: an email if they engage.</span>
              </div>
            </div>
          </div>
        )}

        {upcoming.length > 0 && (
          <div style={{ position: "relative", display: "flex", gap: 14, flexWrap: "wrap" }}>
            {upcoming.slice(0, 2).map((u, i) => (
              <div key={u._id} style={{ flex: "1 1 260px", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 5, background: "var(--card)" }}>
                <span style={{ fontSize: 14, color: "var(--muted)" }}>{i === 0 ? "Next up" : "Then"}</span>
                <span style={{ fontSize: 15.5, fontWeight: 600 }}>{u.name} · {u.role}</span>
                <span style={{ fontSize: 14, color: "var(--muted)" }}>{u.quote ? `“${u.quote.slice(0, 42)}…”` : u.detail} · {u.source}</span>
              </div>
            ))}
          </div>
        )}

        {feedbackLead && (
          <div style={{ position: "relative", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", background: "var(--card-alt)" }}>
            <span style={{ fontSize: 13.5, color: "var(--muted)", flex: 1 }}>Your approved reply to {feedbackLead.name} — how did it land?</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="ky-btn-outline"
                onClick={() => submitFeedback("landed")}
                style={{
                  padding: "6px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: feedback === "landed" ? "#fff" : "var(--green)",
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
                  padding: "6px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: feedback === "missed" ? "#fff" : "var(--muted)",
                  background: feedback === "missed" ? "var(--muted)" : "transparent",
                }}
              >
                Missed
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
