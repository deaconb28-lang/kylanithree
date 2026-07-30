"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import type { CommunityDoc, FindingDoc, LeadDoc } from "../../lib/collections";

type Lead = LeadDoc & { _id: string };
type Community = CommunityDoc & { _id: string };
type Finding = FindingDoc & { _id: string };
type Campaign = {
  productName: string;
  productUrl: string;
  revenueBase: number;
  stats: { contactedTotal: number; buyersTotal: number; repliedTotal: number; callsBooked: number };
};

function initialsFor(name: string) {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

function hoursAgo(iso: string) {
  const hours = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000));
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

export default function HomePage() {
  const { data: session } = useSession();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [communities, setCommunities] = useState<Community[] | null>(null);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [suppressedCount, setSuppressedCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadJson = (url: string) => fetch(url).then((r) => r.json().then((data) => ({ ok: r.ok, data })));

    Promise.all([loadJson("/api/leads"), loadJson("/api/communities"), loadJson("/api/findings"), loadJson("/api/campaign")])
      .then(([leadsRes, communitiesRes, findingsRes, campaignRes]) => {
        if (cancelled) return;
        const failed = [leadsRes, communitiesRes, findingsRes, campaignRes].find((r) => !r.ok);
        if (failed) {
          setLoadError(failed.data?.error ?? "Couldn't load Home.");
          return;
        }
        setLeads(leadsRes.data);
        setCommunities(communitiesRes.data);
        setFindings(findingsRes.data.findings);
        setCampaign(campaignRes.data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't reach the server.");
      });

    // Non-critical for the rest of the page — degrade quietly rather than blocking Home on it.
    fetch("/api/suppressions")
      .then((r) => r.json())
      .then((list: unknown[]) => setSuppressedCount(list.length))
      .catch(() => setSuppressedCount(null));

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (loadError) {
    return (
      <DashboardShell active="home">
        <div style={{ padding: "36px 5vw", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14 }}>
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 18 }}>Couldn&apos;t load Home.</span>
          <span style={{ fontSize: 14.5, color: "var(--muted)" }}>{loadError}</span>
          <button className="ky-btn-ember" onClick={() => { setLoadError(null); setAttempt((a) => a + 1); }} style={{ padding: "11px 20px", fontSize: 14.5, border: "none" }}>
            Try again
          </button>
        </div>
      </DashboardShell>
    );
  }

  if (!leads || !communities || !findings || !campaign) {
    return (
      <DashboardShell active="home">
        <div style={{ padding: "36px 5vw", color: "var(--muted)" }}>Loading…</div>
      </DashboardShell>
    );
  }

  const waiting = leads.filter((l) => l.status === "waiting");
  const todayWaiting = waiting.filter((l) => l.timeSensitive);
  const queueWaiting = waiting.filter((l) => !l.timeSensitive);
  const topMove = todayWaiting[0] ?? null;
  const upNext = todayWaiting.slice(1, 3);
  const queuePreview = queueWaiting.slice(0, 2);
  const topCommunities = [...communities]
    .map((c) => ({ ...c, rate: c.reachedNum ? (c.repliedNum ?? 0) / c.reachedNum : -1 }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 2);
  const latestFinding = findings[0] ?? null;
  const replyRate = campaign.stats.contactedTotal > 0 ? Math.round((campaign.stats.repliedTotal / campaign.stats.contactedTotal) * 100) : null;
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });
  const firstName = (session?.user?.name || session?.user?.email?.split("@")[0] || "").split(" ")[0];

  return (
    <DashboardShell active="home">
      <div style={{ position: "relative", overflow: "hidden", padding: "36px 5vw", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 18, maxWidth: 1220, margin: "0 auto" }}>
        <div
          style={{
            position: "absolute",
            inset: "-160px -60px auto -60px",
            height: 520,
            opacity: "var(--wash)",
            background:
              "radial-gradient(48% 58% at 22% 0%, #FFE8D6 0%, rgba(255,232,214,0) 62%), radial-gradient(44% 54% at 86% 8%, #E8EEFF 0%, rgba(232,238,255,0) 64%)",
          }}
        />

        <div style={{ position: "relative", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13.5, color: "var(--muted)" }}>{today}{firstName ? ` · good morning, ${firstName}` : ""}</span>
            <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(24px,3vw,30px)", lineHeight: 1.1, letterSpacing: "-.03em", margin: 0 }}>
              {topMove ? "Here's where things stand." : todayWaiting.length === 0 && queueWaiting.length === 0 ? "Nothing waiting right now." : "Everything's on track."}
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--green)", fontWeight: 600, background: "var(--green-tint)", padding: "8px 14px", borderRadius: 999, whiteSpace: "nowrap" }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--green)" }} />
            Human-reviewed, not automated — every message here was approved by you
          </div>
        </div>

        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }} className="home-grid">
          <style>{`@media (max-width: 900px) { .home-grid { grid-template-columns: 1fr !important; } }`}</style>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            {topMove ? (
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, padding: "22px 24px", display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 1px 2px rgba(20,18,15,.05), 0 26px 54px -26px rgba(20,18,15,.18)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 11, background: "var(--card-alt)", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 700, color: "var(--muted)", flexShrink: 0 }}>
                    {initialsFor(topMove.name)}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Today&apos;s move · 1 of {todayWaiting.length} · time-sensitive</span>
                    <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 18, letterSpacing: "-.02em" }}>
                      {topMove.name} described your problem {hoursAgo(topMove.createdAt as unknown as string)}
                    </span>
                  </div>
                  {topMove.tag && (
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--green)", background: "var(--green-tint)", padding: "5px 10px", borderRadius: 999, flexShrink: 0, whiteSpace: "nowrap" }}>
                      {topMove.tag}
                    </span>
                  )}
                </div>
                {topMove.quote && (
                  <div style={{ borderLeft: "2px solid var(--ember)", padding: "2px 0 2px 16px" }}>
                    <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, fontStyle: "italic" }}>&ldquo;{topMove.quote}&rdquo;</p>
                  </div>
                )}
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <Link href="/app/today" className="ky-btn-ember" style={{ padding: "11px 20px", fontSize: 14.5, border: "none" }}>
                    {topMove.postLabel ?? "Post this reply"}
                  </Link>
                  <Link href="/app/today" className="ky-btn-outline" style={{ padding: "10px 16px", fontSize: 14.5, fontWeight: 500, color: "var(--muted)" }}>
                    Skip
                  </Link>
                  <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--muted)" }}>{topMove.source} · {hoursAgo(topMove.createdAt as unknown as string)}</span>
                </div>
              </div>
            ) : (
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, padding: "26px 24px", textAlign: "center" }}>
                <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 17 }}>Nothing time-sensitive right now.</span>
                <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--muted)" }}>Check Queue for the rest of the backlog whenever you have a minute.</p>
              </div>
            )}

            <div style={{ border: "1px solid var(--border)", borderRadius: 16, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10, background: "rgba(253,252,250,.9)", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 15 }}>Up next in Today</span>
                <Link href="/app/today" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Open Today →</Link>
              </div>
              {upNext.length === 0 ? (
                <span style={{ fontSize: 13.5, color: "var(--muted)" }}>Nothing else time-sensitive waiting.</span>
              ) : (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {upNext.map((u, i) => (
                    <div key={u._id} style={{ flex: "1 1 200px", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4, background: "var(--card)" }}>
                      <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{i === 0 ? "Next up" : "Then"}</span>
                      <span style={{ fontSize: 14.5, fontWeight: 600 }}>{u.name} · {u.role}</span>
                      <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{u.quote ? `"${u.quote.slice(0, 40)}…"` : u.detail} · {u.source}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <div style={{ border: "1px solid var(--border)", borderRadius: 16, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10, background: "rgba(253,252,250,.9)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 15 }}>Queue · {queueWaiting.length} waiting</span>
                <Link href="/app/queue" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Open →</Link>
              </div>
              {queuePreview.length === 0 ? (
                <span style={{ fontSize: 13.5, color: "var(--muted)" }}>Queue is empty right now.</span>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {queuePreview.map((l, i) => (
                    <div key={l._id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < queuePreview.length - 1 ? "1px solid var(--border)" : "none" }}>
                      <div style={{ width: 26, height: 26, borderRadius: 8, background: "var(--card-alt)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, color: "var(--muted)", flexShrink: 0 }}>
                        {initialsFor(l.name)}
                      </div>
                      <span style={{ fontSize: 13.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name} · {l.role}</span>
                    </div>
                  ))}
                </div>
              )}
              {campaign.revenueBase > 0 && (
                <span style={{ fontSize: 12.5, color: "var(--green)", fontWeight: 600 }}>Est. ${campaign.revenueBase.toLocaleString()} pipeline across these {queueWaiting.length}</span>
              )}
            </div>

            <div style={{ border: "1px solid var(--border)", borderRadius: 16, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 7, background: "rgba(253,252,250,.9)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 14.5 }}>Map · best channels</span>
                <Link href="/app/map" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>Open →</Link>
              </div>
              {topCommunities.length === 0 ? (
                <span style={{ fontSize: 12.5, color: "var(--muted)" }}>No communities matched yet.</span>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {topCommunities.map((c) => (
                    <div key={c._id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                        <span>{c.mapLabel1} {c.mapLabel2}</span>
                        <span style={{ fontWeight: 700, color: "var(--green)" }}>{c.rate >= 0 ? `${Math.round(c.rate * 100)}%` : "—"}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
                        <div style={{ width: `${c.rate >= 0 ? Math.min(100, (c.rate / 0.45) * 100) : 0}%`, height: "100%", background: "var(--green)" }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {suppressedCount === null ? "…" : suppressedCount === 0 ? "Nobody suppressed yet" : `${suppressedCount} suppressed · never contacted`}
              </span>
            </div>
          </div>
        </div>

        <div style={{ position: "relative", border: "1px solid var(--border)", borderRadius: 16, padding: "16px 22px", display: "flex", alignItems: "center", gap: 16, background: "var(--card-alt)", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ember)", flexShrink: 0 }}>Findings</span>
          <span style={{ fontSize: 14.5, flex: 1, lineHeight: 1.4, minWidth: 200 }}>
            {latestFinding ? latestFinding.headline : "No findings yet — check back after a few replies come in."}
          </span>
          <Link href="/app/findings" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", flexShrink: 0, whiteSpace: "nowrap" }}>Open Findings →</Link>
        </div>

        <div style={{ position: "relative", border: "1px solid var(--border)", borderRadius: 16, padding: "18px 24px", display: "flex", alignItems: "center", gap: 28, background: "var(--card-alt)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 180 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13.5, color: "var(--muted)" }}>Contacted so far</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{campaign.stats.contactedTotal} of {campaign.stats.buyersTotal || campaign.stats.contactedTotal}</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
              <div style={{ width: campaign.stats.buyersTotal ? `${Math.min(100, (campaign.stats.contactedTotal / campaign.stats.buyersTotal) * 100)}%` : "0%", height: "100%", background: "var(--ink)" }} />
            </div>
          </div>
          <div style={{ width: 1, height: 34, background: "var(--border)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 13.5, color: "var(--muted)" }}>Reply rate</span>
            <span style={{ fontSize: 17, fontWeight: 700, fontFamily: "var(--font-outfit)" }}>{replyRate === null ? "—" : `${replyRate}%`}</span>
          </div>
          <div style={{ width: 1, height: 34, background: "var(--border)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 13.5, color: "var(--muted)" }}>Calls booked</span>
            <span style={{ fontSize: 17, fontWeight: 700, fontFamily: "var(--font-outfit)" }}>{campaign.stats.callsBooked}</span>
          </div>
          <div style={{ width: 1, height: 34, background: "var(--border)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 13.5, color: "var(--muted)" }}>Est. pipeline</span>
            <span style={{ fontSize: 17, fontWeight: 700, fontFamily: "var(--font-outfit)", color: "var(--green)" }}>
              {campaign.revenueBase > 0 ? `$${campaign.revenueBase.toLocaleString()}` : "—"}
            </span>
          </div>
        </div>

        <Link
          href="/app/trial"
          style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, border: "1px solid #F3D9BE", background: "#FFF8F1", borderRadius: 14, padding: "14px 20px", textDecoration: "none" }}
        >
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 14.5, color: "var(--ink)" }}>Kylani Growth</span>
          <span style={{ fontSize: 13.5, color: "var(--muted)", flex: 1 }}>See what&apos;s included in your trial and what happens after →</span>
        </Link>
      </div>
    </DashboardShell>
  );
}
