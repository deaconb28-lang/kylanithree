"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import type { CommunityDoc, FindingDoc, HypothesisDoc } from "../../../lib/collections";

type Finding = FindingDoc & { _id: string };
type Hypothesis = HypothesisDoc & { _id: string };
type Community = CommunityDoc & { _id: string };
type CampaignStats = { contactedTotal: number; repliedTotal: number; callsBooked: number; weeksActive: number };

const sidebarBottom = null;

function BarRow({ label, pct, value, muted }: { label: string; pct: number; value: string; muted?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: muted ? "var(--muted)" : "var(--ink)" }}>
        <span>{label}</span>
        <span style={{ fontWeight: 600, color: muted ? "var(--ink)" : "var(--green)" }}>{value}</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: pct >= 90 ? "var(--green)" : pct >= 40 ? "var(--ink)" : "var(--border-strong)" }} />
      </div>
    </div>
  );
}

export default function FindingsPage() {
  const [tab, setTab] = useState<"sentences" | "stats">("sentences");
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [hypotheses, setHypotheses] = useState<Hypothesis[] | null>(null);
  const [communities, setCommunities] = useState<Community[] | null>(null);
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadJson = (url: string) =>
      fetch(url).then((r) => r.json().then((data) => ({ ok: r.ok, data })));

    Promise.all([loadJson("/api/findings"), loadJson("/api/hypotheses"), loadJson("/api/communities")])
      .then(([findingsRes, hypothesesRes, communitiesRes]) => {
        if (cancelled) return;
        const failed = [findingsRes, hypothesesRes, communitiesRes].find((r) => !r.ok);
        if (failed) {
          setError(failed.data.error ?? "Couldn't load this page.");
          return;
        }
        setFindings(findingsRes.data.findings);
        setStats(findingsRes.data.stats);
        setHypotheses(hypothesesRes.data);
        setCommunities(communitiesRes.data);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't reach the server.");
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // A "finding" here only exists once at least two hypotheses have a real numeric reply rate —
  // until then there's nothing to compare, so the promote CTA and its headline stay hidden rather
  // than referencing a fixed pair of hypothesis keys that may not even exist for this campaign.
  const numericHypotheses = useMemo(
    () => (hypotheses ?? []).map((h) => ({ ...h, rateNum: parseFloat(h.rate) })).filter((h) => !Number.isNaN(h.rateNum)),
    [hypotheses],
  );
  const bestHypothesis = useMemo(
    () => (numericHypotheses.length ? numericHypotheses.reduce((a, b) => (b.rateNum > a.rateNum ? b : a)) : null),
    [numericHypotheses],
  );
  const currentPrimary = hypotheses?.find((h) => h.status === "primary") ?? null;
  const hasFinding = numericHypotheses.length >= 2 && !!bestHypothesis && !!currentPrimary;
  const promoted = hasFinding && bestHypothesis!.key === currentPrimary!.key;
  const hasBetterFinding = hasFinding && bestHypothesis!.key !== currentPrimary!.key;

  const rateBars = useMemo(() => {
    if (!hypotheses) return [];
    const rates = hypotheses.map((h) => parseFloat(h.rate));
    const numericRates = rates.filter((r) => !Number.isNaN(r));
    const max = numericRates.length ? Math.max(...numericRates, 1) : 1;
    return hypotheses.map((h, i) => ({
      key: h.key,
      name: h.name,
      rate: h.rate,
      pct: Number.isNaN(rates[i]) ? 0 : Math.round((rates[i] / max) * 100),
      muted: i > 0,
    }));
  }, [hypotheses]);

  const promote = async () => {
    setPromoting(true);
    const res = await fetch("/api/findings/promote", { method: "POST" });
    const updated: Hypothesis[] = await res.json();
    setHypotheses(updated);
    setPromoting(false);
  };

  if (error) {
    return (
      <DashboardShell active="findings" bottom={sidebarBottom}>
        <div style={{ padding: "36px 5vw", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14 }}>
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 18 }}>Couldn&apos;t load Findings.</span>
          <span style={{ fontSize: 14.5, color: "var(--muted)" }}>{error}</span>
          <button
            className="ky-btn-ember"
            onClick={() => {
              setError(null);
              setAttempt((a) => a + 1);
            }}
            style={{ padding: "11px 20px", fontSize: 14.5, border: "none" }}
          >
            Try again
          </button>
        </div>
      </DashboardShell>
    );
  }

  if (!findings || !hypotheses || !communities || !stats) {
    return (
      <DashboardShell active="findings" bottom={sidebarBottom}>
        <div style={{ padding: "36px 5vw", color: "var(--muted)" }}>Loading…</div>
      </DashboardShell>
    );
  }

  const replyRate = stats.contactedTotal ? Math.round((stats.repliedTotal / stats.contactedTotal) * 1000) / 10 : 0;

  return (
    <DashboardShell active="findings" bottom={sidebarBottom}>
      <div style={{ position: "relative", overflow: "hidden", padding: "36px 5vw", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 22, maxWidth: 1220, margin: "0 auto" }}>
        <div
          style={{
            position: "absolute",
            inset: "-160px -60px auto -60px",
            height: 520,
            opacity: "var(--wash)",
            background:
              "radial-gradient(48% 58% at 78% 0%, #F6E4F0 0%, rgba(246,228,240,0) 62%), radial-gradient(44% 54% at 14% 4%, #FFE8D6 0%, rgba(255,232,214,0) 64%)",
          }}
        />

        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 14.5, color: "var(--muted)" }}>
            {stats.weeksActive} week{stats.weeksActive === 1 ? "" : "s"} · {stats.contactedTotal} sent · {stats.repliedTotal} replies · {stats.callsBooked} calls
          </span>
          <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(24px,3vw,34px)", letterSpacing: "-.03em", margin: 0 }}>
            What I found out that you couldn&apos;t have looked up.
          </h1>
        </div>

        <div style={{ position: "relative", display: "flex", gap: 8 }}>
          {(["sentences", "stats"] as const).map((t) => (
            <div
              key={t}
              onClick={() => setTab(t)}
              style={{
                cursor: "pointer",
                padding: "8px 16px",
                borderRadius: 999,
                fontSize: 13.5,
                fontWeight: 600,
                background: tab === t ? "var(--ink)" : "transparent",
                color: tab === t ? "var(--card)" : "var(--muted)",
                textTransform: "capitalize",
              }}
            >
              {t}
            </div>
          ))}
        </div>

        {tab === "sentences" ? (
          <div className="ky-fade-in" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {hasBetterFinding && currentPrimary && bestHypothesis && (
              <div
                style={{
                  position: "relative",
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 18,
                  padding: "28px 5vw",
                  display: "flex",
                  gap: 40,
                  alignItems: "center",
                  flexWrap: "wrap",
                  boxShadow: "0 1px 2px rgba(20,18,15,.05), 0 24px 50px -26px rgba(20,18,15,.18)",
                }}
              >
                <p style={{ margin: 0, fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: "clamp(22px, 2.4vw, 32px)", lineHeight: 1.2, letterSpacing: "-.025em", flex: "2 1 400px" }}>
                  You thought you were mostly selling to {currentPrimary.name.toLowerCase()}s. {bestHypothesis.name}s reply{" "}
                  {Math.round(bestHypothesis.rateNum / Math.max(parseFloat(currentPrimary.rate) || 0.1, 0.1))}x more often.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: "1 1 260px", minWidth: 260 }}>
                  {rateBars.map((b) => (
                    <BarRow key={b.key} label={b.name} pct={b.pct} value={b.rate} muted={b.muted} />
                  ))}
                </div>
              </div>
            )}

            {findings.length === 0 ? (
              <div style={{ border: "1px dashed var(--border-strong)", borderRadius: 16, padding: 32, textAlign: "center", display: "flex", flexDirection: "column", gap: 8, background: "var(--card-alt)" }}>
                <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 18 }}>Nothing to report yet.</span>
                <span style={{ fontSize: 14.5, color: "var(--muted)", lineHeight: 1.6 }}>
                  Findings show up here once you&apos;ve sent enough messages to see a pattern in who replies — approve a few
                  drafts in Today or Queue to get started.
                </span>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                {findings.map((f, i) => (
                  <div key={f._id} style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 10, background: i < 3 ? "var(--card)" : "var(--card-alt)" }}>
                    <span style={{ fontSize: 12.5, color: i < 3 ? "var(--ember)" : "var(--muted)", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>{f.tag}</span>
                    <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 21, lineHeight: 1.3, letterSpacing: "-.02em" }}>{f.headline}</span>
                    <span style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.6 }}>{f.body}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="ky-fade-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
              {[
                { v: `${replyRate}%`, l: `Reply rate · ${stats.repliedTotal} of ${stats.contactedTotal} sent` },
                { v: String(stats.callsBooked), l: `Calls booked from ${stats.repliedTotal} replies` },
              ].map((s) => (
                <div key={s.l} style={{ border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 4, background: "var(--card)" }}>
                  <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: 28, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>{s.v}</span>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>{s.l}</span>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
              <div style={{ border: "1px solid var(--border)", borderRadius: 16, padding: "22px 24px", display: "flex", flexDirection: "column", gap: 14, background: "var(--card)" }}>
                <span style={{ fontSize: 12.5, color: "var(--ember)", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>Who responds · by role</span>
                {rateBars.map((b) => (
                  <BarRow key={b.key} label={b.name} pct={b.pct} value={b.rate} muted={b.muted} />
                ))}
              </div>
            </div>

            <div style={{ border: "1px solid var(--border)", borderRadius: 16, padding: "22px 24px", display: "flex", flexDirection: "column", gap: 4, background: "var(--card)" }}>
              <span style={{ fontSize: 12.5, color: "var(--ember)", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 10 }}>By channel</span>
              {communities.map((c, i) => {
                const pct = c.reachedNum ? Math.round(((c.repliedNum ?? 0) / c.reachedNum) * 100) : 0;
                return (
                  <div key={c._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: i < communities.length - 1 ? "1px solid var(--border)" : "none", fontSize: 14.5, flexWrap: "wrap", gap: 6 }}>
                    <span>{c.name}</span>
                    <span style={{ color: "var(--muted)" }}>{c.reached}, {c.replied}</span>
                    <span style={{ fontWeight: 600, color: c.fit === "Strong fit" ? "var(--green)" : "var(--ink)", width: 46, textAlign: "right" }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {hasFinding && (
          <div style={{ position: "relative", marginTop: "auto", display: "flex", alignItems: "center", gap: 12, borderTop: "1px solid var(--border)", paddingTop: 18, flexWrap: "wrap" }}>
            {promoted ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14.5, fontWeight: 600, color: "var(--green)" }}>
                <span style={{ width: 18, height: 18, borderRadius: 999, background: "var(--green)", display: "grid", placeItems: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>
                {bestHypothesis?.name}s promoted to primary
              </span>
            ) : (
              <button className="ky-btn-ember" onClick={promote} disabled={promoting} style={{ padding: "13px 22px", fontSize: 15.5, border: "none", opacity: promoting ? 0.6 : 1 }}>
                Promote {bestHypothesis?.name.toLowerCase()}s to primary
              </button>
            )}
            <span style={{ fontSize: 14, color: "var(--muted)" }}>
              {promoted
                ? "The winning opener is reused, and everyone already contacted is skipped. See it on Map."
                : `Moves ${currentPrimary?.name.toLowerCase()}s to learning, reuses the winning opener, and skips everyone already contacted.`}
            </span>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
