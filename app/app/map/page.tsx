"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import type { CommunityDoc, HypothesisDoc, HypothesisStatus, LeadDoc } from "../../../lib/collections";

type Community = CommunityDoc & { _id: string };
type Hypothesis = HypothesisDoc & { _id: string };
type Lead = LeadDoc & { _id: string };
type Campaign = { stats: { contactedTotal: number; buyersTotal: number; repliedTotal: number; callsBooked: number } };

type StripeSummary =
  | { connected: false }
  | { connected: true; error: string }
  | {
      connected: true;
      currency: string;
      availableCents: number;
      totalVolumeCents: number;
      chargeCount: number;
      recentCharges: { id: string; amountCents: number; email: string | null; created: number }[];
    };

function formatCents(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

export default function MapPage() {
  const [communities, setCommunities] = useState<Community[] | null>(null);
  const [hypotheses, setHypotheses] = useState<Hypothesis[] | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [node, setNode] = useState<string | null>(null);
  const [tab, setTab] = useState<"hypotheses" | "communities" | "contacts">("hypotheses");
  const [stripeSummary, setStripeSummary] = useState<StripeSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadJson = (url: string) => fetch(url).then((r) => r.json().then((data) => ({ ok: r.ok, data })));

    Promise.all([loadJson("/api/communities"), loadJson("/api/hypotheses"), loadJson("/api/leads"), loadJson("/api/campaign")])
      .then(([communitiesRes, hypothesesRes, leadsRes, campaignRes]) => {
        if (cancelled) return;
        const failed = [communitiesRes, hypothesesRes, leadsRes, campaignRes].find((r) => !r.ok);
        if (failed) {
          setLoadError(failed.data?.error ?? "Couldn't load Map.");
          return;
        }
        setCommunities(communitiesRes.data);
        if (communitiesRes.data[0]) setNode(communitiesRes.data[0].key);
        setHypotheses(hypothesesRes.data);
        setLeads(leadsRes.data);
        setCampaign(campaignRes.data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't reach the server.");
      });

    // Revenue is its own, separately-degrading concern (already has "not connected" / "error"
    // states) — a Stripe hiccup shouldn't block the rest of the page from loading.
    fetch("/api/stripe/summary")
      .then((r) => r.json())
      .then(setStripeSummary)
      .catch(() => setStripeSummary({ connected: false }));

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const mapNodes = useMemo(() => {
    if (!communities) return [];
    return communities
      .map((c) => {
        const rate = c.reachedNum ? (c.repliedNum ?? 0) / c.reachedNum : null;
        const strong = c.fit === "Strong fit";
        const weak = c.fit === "Weak";
        return {
          key: c.key,
          mapLabel1: c.mapLabel1,
          mapLabel2: c.mapLabel2,
          members: c.members,
          reached: c.reached,
          rev: c.fit === "Untested" ? "untested" : c.rev,
          rate: rate ?? -1,
          rateLabel: rate === null ? "—" : Math.round(rate * 100) + "%",
          barPct: Math.round(Math.min(1, (rate ?? 0) / 0.45) * 100) + "%",
          barColor: strong ? "var(--green)" : weak ? "var(--border-strong)" : "#E9E3DA",
          dotFill: strong ? "rgba(47,122,86,.16)" : "transparent",
          dotBorder: strong ? "1.5px solid var(--green)" : weak ? "1.5px dashed var(--border-strong)" : "1.5px dotted var(--border-strong)",
          textColor: strong ? "var(--ink)" : "var(--muted)",
        };
      })
      .sort((a, b) => b.rate - a.rate);
  }, [communities]);

  const setHypStatus = async (key: string, status: HypothesisStatus) => {
    setHypotheses((hs) => hs!.map((h) => (h.key === key ? { ...h, status } : h)));
    await fetch(`/api/hypotheses/${key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  };

  const contacted = useMemo(() => (leads ?? []).filter((l) => l.status !== "waiting"), [leads]);

  if (loadError) {
    return (
      <DashboardShell active="map">
        <div style={{ padding: "36px 5vw", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14 }}>
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 18 }}>Couldn&apos;t load Map.</span>
          <span style={{ fontSize: 14.5, color: "var(--muted)" }}>{loadError}</span>
          <button className="ky-btn-ember" onClick={() => { setLoadError(null); setAttempt((a) => a + 1); }} style={{ padding: "11px 20px", fontSize: 14.5, border: "none" }}>
            Try again
          </button>
        </div>
      </DashboardShell>
    );
  }

  if (!communities || !hypotheses || !leads || !campaign) {
    return (
      <DashboardShell active="map">
        <div style={{ padding: "36px 5vw", color: "var(--muted)" }}>Loading…</div>
      </DashboardShell>
    );
  }

  const active = communities.find((c) => c.key === node) ?? communities[0] ?? null;

  return (
    <DashboardShell
      active="map"
      bottom={
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 13px", display: "flex", flexDirection: "column", gap: 6, background: "var(--card)" }}>
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Contacted so far</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{campaign.stats.contactedTotal} of {campaign.stats.buyersTotal}</span>
          <div style={{ height: 4, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, (campaign.stats.contactedTotal / campaign.stats.buyersTotal) * 100)}%`, height: "100%", background: "var(--ink)" }} />
          </div>
        </div>
      }
    >
      <div style={{ padding: "36px 5vw", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 24, overflow: "hidden", maxWidth: 1220, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(24px,3vw,34px)", letterSpacing: "-.03em", margin: 0 }}>
              Every community, ranked by who actually replies.
            </h1>
            <span style={{ fontSize: 15, color: "var(--muted)" }}>
              {campaign.stats.contactedTotal} contacted · {campaign.stats.repliedTotal} replied · click a row to read what I learned
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, fontSize: 13.5, flexWrap: "wrap" }}>
            {(["hypotheses", "communities", "contacts"] as const).map((t) => (
              <span
                key={t}
                onClick={() => setTab(t)}
                style={{
                  cursor: "pointer",
                  background: tab === t ? "var(--ink)" : "transparent",
                  color: tab === t ? "var(--card)" : "var(--muted-strong)",
                  border: tab === t ? "none" : "1px solid var(--border)",
                  padding: "7px 13px",
                  borderRadius: 999,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  textTransform: "capitalize",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {tab === "contacts" && (
          <div style={{ border: "1px solid var(--border)", borderRadius: 16, background: "var(--card)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid var(--border)", fontSize: 12.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".07em", gap: 16 }}>
              <span style={{ width: 200, flexShrink: 0 }}>Name</span>
              <span style={{ flex: 1, minWidth: 120 }}>Company</span>
              <span style={{ width: 160, flexShrink: 0 }}>Channel</span>
              <span style={{ width: 100, textAlign: "right", flexShrink: 0 }}>Status</span>
            </div>
            {contacted.length === 0 && (
              <div style={{ padding: "20px", fontSize: 14.5, color: "var(--muted)" }}>
                Nobody&apos;s been contacted yet — approve a draft in Today or Queue to see them here.
              </div>
            )}
            {contacted.map((c, i) => {
              const label = c.status === "sent" ? "Sent" : c.status === "replied" ? "Replied" : c.status === "approved" ? "Approved" : "Dropped";
              return (
                <div
                  key={c._id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "14px 20px",
                    borderBottom: i < contacted.length - 1 ? "1px solid var(--border)" : "none",
                    flexWrap: "wrap",
                    opacity: c.status === "dropped" ? 0.55 : 1,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, width: 200, flexShrink: 0 }}>
                    <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 15 }}>{c.name}</span>
                    <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{c.role}</span>
                  </div>
                  <span style={{ flex: 1, minWidth: 120, fontSize: 13.5, color: "var(--muted)" }}>{c.company}</span>
                  <span style={{ width: 160, flexShrink: 0, fontSize: 13.5, color: "var(--muted-strong)" }}>{c.email ? "Email" : c.source}</span>
                  <span
                    style={{
                      width: 100,
                      flexShrink: 0,
                      textAlign: "right",
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: c.status === "replied" ? "var(--green)" : c.status === "dropped" ? "var(--muted)" : "var(--ink)",
                    }}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {(tab === "hypotheses" || tab === "communities") && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--muted)" }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--border-strong)", flexShrink: 0 }} />
              Unsubscribes, bounces, and existing customers are suppressed automatically —{" "}
              <Link href="/app/suppressed" style={{ color: "var(--ink)", fontWeight: 600 }}>see Suppressed</Link>.
            </div>

            {tab === "hypotheses" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
              {hypotheses.map((h) => {
                const status = h.status;
                const paused = status === "paused";
                return (
                  <div
                    key={h.key}
                    style={{
                      border: status === "primary" ? "1.5px solid var(--ink)" : "1px solid var(--border)",
                      borderRadius: 14,
                      padding: "16px 18px",
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      background: paused ? "var(--card-alt)" : "var(--card)",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", color: paused ? "var(--muted)" : "var(--ink)" }}>
                      <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: 24, letterSpacing: "-.03em" }}>{h.rate}</span>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>reply rate</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 15.5, letterSpacing: "-.01em", color: paused ? "var(--muted)" : "var(--ink)" }}>{h.name}</span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            padding: "3px 8px",
                            borderRadius: 999,
                            color: status === "primary" ? "var(--green)" : status === "learning" ? "var(--muted)" : "var(--muted)",
                            background: status === "primary" ? "var(--green-tint)" : status === "learning" ? "var(--active-bg)" : "var(--border)",
                          }}
                        >
                          {status === "primary" ? "Winning · primary" : status === "learning" ? "Learning" : "Paused"}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.4 }}>{h.meta}</span>
                        {status !== "primary" && (
                          <span
                            onClick={() => setHypStatus(h.key, paused ? "learning" : "paused")}
                            style={{ fontSize: 12, fontWeight: 600, color: paused ? "var(--green)" : "var(--ember)", whiteSpace: "nowrap", cursor: "pointer" }}
                          >
                            {paused ? "Resume" : "Demote"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr minmax(260px, 330px)", gap: 16, minHeight: 0 }} className="map-grid">
              <style>{`@media (max-width: 900px) { .map-grid { grid-template-columns: 1fr !important; } }`}</style>

              <div style={{ position: "relative", border: "1px solid var(--border)", borderRadius: 16, background: "var(--card)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontSize: 12.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".07em" }}>Ranked by reply rate</span>
                  <div style={{ display: "flex", gap: 14, fontSize: 12.5, color: "var(--muted)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 999, border: "1.5px solid var(--green)", background: "rgba(47,122,86,.16)" }} />
                      replying
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 999, border: "1.5px dashed var(--border-strong)" }} />
                      quiet
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 999, border: "1.5px dotted var(--border-strong)" }} />
                      untested
                    </span>
                  </div>
                </div>
                <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
                  {mapNodes.map((n, i) => (
                    <div
                      key={n.key}
                      onClick={() => setNode(n.key)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                        padding: "14px 20px",
                        borderBottom: "1px solid var(--border)",
                        cursor: "pointer",
                        background: node === n.key ? "var(--card-alt)" : "transparent",
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ width: 9, height: 9, borderRadius: 999, flexShrink: 0, background: n.dotFill, border: n.dotBorder }} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, width: 180, flexShrink: 0 }}>
                        <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 15, letterSpacing: "-.01em", color: n.textColor }}>
                          {n.mapLabel1} {n.mapLabel2}
                        </span>
                        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{n.members}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 80, display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ flex: 1, height: 8, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
                          <div
                            style={{
                              width: n.barPct,
                              height: "100%",
                              background: n.barColor,
                              transformOrigin: "left",
                              animation: "kyBarFill .9s cubic-bezier(.16,1,.3,1) both",
                              animationDelay: `${(i * 0.06).toFixed(2)}s`,
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, width: 42, textAlign: "right", color: n.textColor }}>{n.rateLabel}</span>
                      </div>
                      <span style={{ fontSize: 12.5, color: "var(--muted)", width: 90, textAlign: "right", flexShrink: 0 }}>{n.reached}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--green)", width: 90, textAlign: "right", flexShrink: 0 }}>{n.rev}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
                {active ? (
                  <div style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 12, background: "var(--card)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 18, letterSpacing: "-.02em" }}>{active.name}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", background: "var(--active-bg)", padding: "4px 9px", borderRadius: 999 }}>{active.fit}</span>
                    </div>
                    <div style={{ display: "flex", gap: 16, fontSize: 13.5, color: "var(--muted)", flexWrap: "wrap" }}>
                      <span>{active.members}</span>
                      <span>{active.reached}</span>
                      <span style={{ color: "var(--green)", fontWeight: 600 }}>{active.replied}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "var(--ink)" }}>{active.note}</p>
                    <span style={{ fontSize: 13.5, color: "var(--muted)", borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                      Attributed: <strong style={{ color: "var(--ink)", fontWeight: 600 }}>{active.rev}</strong>
                    </span>
                  </div>
                ) : (
                  <div style={{ border: "1px dashed var(--border-strong)", borderRadius: 16, padding: 20, background: "var(--card-alt)" }}>
                    <span style={{ fontSize: 14.5, color: "var(--muted)", lineHeight: 1.6 }}>No communities confirmed yet — they&apos;ll show up here once the next search finds one.</span>
                  </div>
                )}

                {!stripeSummary || stripeSummary.connected === false ? (
                  <div style={{ border: "1px dashed var(--border-strong)", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 10, background: "var(--card-alt)" }}>
                    <span style={{ fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 700 }}>Revenue</span>
                    <span style={{ fontSize: 15, lineHeight: 1.5, color: "var(--ink)" }}>
                      Connect Stripe to see real revenue and reply-to-close numbers here — this box shows nothing made up.
                    </span>
                    <Link href="/api/stripe/connect" className="ky-btn-ember" style={{ padding: "11px 18px", fontSize: 14, fontWeight: 600, border: "none", textAlign: "center" }}>
                      Connect Stripe
                    </Link>
                  </div>
                ) : "error" in stripeSummary ? (
                  <div style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 8, background: "var(--card-alt)" }}>
                    <span style={{ fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 700 }}>Revenue</span>
                    <span style={{ fontSize: 14.5, color: "var(--ember)" }}>{stripeSummary.error}</span>
                  </div>
                ) : (
                  <div style={{ border: "1.5px solid var(--ember)", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 12, background: "var(--card-alt)", boxShadow: "0 1px 2px rgba(20,18,15,.05), 0 16px 34px -22px rgba(228,87,46,.35)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--green)", animation: "kyPulse 2s ease-in-out infinite" }} />
                      <span style={{ fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 700 }}>Real revenue · via Stripe</span>
                    </div>
                    <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: 34, letterSpacing: "-.035em", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                      {formatCents(stripeSummary.availableCents, stripeSummary.currency)}
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 13.5, color: "var(--muted)" }}>
                      <span style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Total charged</span>
                        <strong style={{ color: "var(--green)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                          {formatCents(stripeSummary.totalVolumeCents, stripeSummary.currency)}
                        </strong>
                      </span>
                      <span style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Successful charges</span>
                        <strong style={{ color: "var(--ink)", fontWeight: 600 }}>{stripeSummary.chargeCount}</strong>
                      </span>
                    </div>
                    {stripeSummary.recentCharges.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                        {stripeSummary.recentCharges.map((c) => (
                          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--muted)" }}>
                            <span>{c.email ?? "customer"}</span>
                            <span style={{ color: "var(--ink)", fontWeight: 600 }}>{formatCents(c.amountCents, stripeSummary.currency)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Live from your connected Stripe account</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
