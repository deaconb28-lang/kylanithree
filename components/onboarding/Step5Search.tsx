"use client";

import { useEffect, useRef, useState } from "react";
import OnboardingChrome from "./OnboardingChrome";
import type { ProductCategory } from "../../lib/productCategories";
import type { GeneratedSeed } from "../../lib/generateCampaignSeed";

// Generic stages of the real search architecture in lib/generateCampaignSeed.ts — not fake
// progress, just labels for work that's genuinely happening behind one longer API call. Advanced
// on a rough time budget rather than real server progress, since the API call itself doesn't
// stream intermediate steps back.
const STAGES = [
  "Turning your buyer hypotheses into real search queries",
  "Searching Reddit, Slack, Discord, and forums for people describing the problem",
  "Checking job boards for postings that name the same pain",
  "Matching what it finds back to your buyer personas",
];
const SECONDS_PER_STAGE = 12;

export default function Step5Search({
  url,
  whatYouSell,
  buyers,
  channels,
  category,
  keywords,
  onDone,
}: {
  url: string;
  whatYouSell: string;
  buyers: { name: string; desc: string }[];
  channels: Record<string, boolean>;
  category: ProductCategory;
  keywords: string[];
  onDone: (seed: GeneratedSeed) => void;
}) {
  const [seconds, setSeconds] = useState(0);
  const [seed, setSeed] = useState<GeneratedSeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const advancedRef = useRef(false);

  // Real elapsed time — one tick per real second, no compression.
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [attempt]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/onboarding/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, whatYouSell, buyers, channels, category, keywords }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) {
          setError(data.error ?? "Couldn't search for real leads right now.");
          return;
        }
        setSeed(data as GeneratedSeed);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't reach the server.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  useEffect(() => {
    if (seed && !advancedRef.current) {
      advancedRef.current = true;
      const t = setTimeout(() => onDone(seed), 1400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const retry = () => {
    setError(null);
    advancedRef.current = false;
    setAttempt((a) => a + 1);
  };

  const clock = Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  const stageIndex = seed ? STAGES.length : Math.min(STAGES.length - 1, Math.floor(seconds / SECONDS_PER_STAGE));

  if (error) {
    return (
      <OnboardingChrome>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, maxWidth: 560, textAlign: "center" }}>
          <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(24px,3.4vw,36px)", lineHeight: 1.1, letterSpacing: "-.03em", margin: 0 }}>
            Couldn&apos;t search for real leads.
          </h1>
          <p style={{ margin: 0, fontSize: 15.5, color: "var(--muted-strong)", lineHeight: 1.6 }}>{error}</p>
          <button className="ky-btn-ember" onClick={retry} style={{ padding: "13px 24px", fontSize: 15.5, border: "none" }}>
            Try again
          </button>
        </div>
      </OnboardingChrome>
    );
  }

  return (
    <OnboardingChrome align="stretch">
      <div style={{ width: "100%", maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr minmax(280px,420px)", gap: 44 }} className="step5-grid">
        <style>{`@media (max-width: 860px) { .step5-grid { grid-template-columns: 1fr !important; } }`}</style>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 15, color: "var(--muted)" }}>
            <span style={{ width: 9, height: 9, borderRadius: 999, background: "var(--ember)", animation: "kyPulse 1.6s ease-in-out infinite" }} />
            Searching for real {(buyers[0]?.name || "buyers").toLowerCase()} right now
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(48px,7vw,92px)", lineHeight: 0.9, letterSpacing: "-.045em", fontVariantNumeric: "tabular-nums" }}>
              {clock}
            </span>
            <span style={{ fontSize: 17, color: "var(--muted)" }}>{seed ? "search complete" : "elapsed — this is a real, live web search"}</span>
          </div>
          <div style={{ background: "rgba(253,252,250,.86)", border: "1px solid var(--border)", borderRadius: 14, padding: 8, display: "flex", flexDirection: "column", gap: 2 }}>
            {STAGES.map((stage, i) => {
              const complete = i < stageIndex || !!seed;
              const current = i === stageIndex && !seed;
              return (
                <div key={stage} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 10, background: current ? "#F7F3EE" : "transparent", opacity: i > stageIndex && !seed ? 0.45 : 1 }}>
                  {complete ? (
                    <span style={{ width: 18, height: 18, borderRadius: 999, background: "var(--green)", display: "grid", placeItems: "center", color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>✓</span>
                  ) : current ? (
                    <span style={{ width: 18, height: 18, borderRadius: 999, border: "2px solid var(--ember)", boxSizing: "border-box", animation: "kyPulse 1.4s ease-in-out infinite", flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 18, height: 18, borderRadius: 999, border: "2px solid var(--border-strong)", boxSizing: "border-box", flexShrink: 0 }} />
                  )}
                  <span style={{ fontSize: 15.5, flex: 1, textAlign: "left", fontWeight: current ? 500 : 400 }}>{stage}</span>
                </div>
              );
            })}
          </div>
          {seed && (
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {[
                { v: seed.leads.length, l: "real leads found" },
                { v: seed.communities.length, l: "communities confirmed" },
              ].map((s) => (
                <div key={s.l} style={{ flex: "1 1 140px", background: "rgba(253,252,250,.86)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
                  <div style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: 42, letterSpacing: "-.035em", fontVariantNumeric: "tabular-nums" }}>{s.v}</div>
                  <div style={{ fontSize: 14, color: "var(--muted)" }}>{s.l}</div>
                </div>
              ))}
            </div>
          )}
          <span style={{ fontSize: 14, color: "var(--muted)" }}>
            {seed ? "Taking you to your first drafts…" : "Or close this — I'll email you when the first batch is drafted."}
          </span>
        </div>

        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 1px 2px rgba(20,18,15,.05), 0 22px 46px -24px rgba(20,18,15,.18)", height: "fit-content" }}>
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 15, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)" }}>
            Communities found
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {seed ? (
              seed.communities.length ? (
                seed.communities.map((c, i) => (
                  <div key={c.name} className="ky-fade-in" style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 12, borderBottom: i < seed.communities.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 15.5, fontWeight: 600 }}>{c.name}</span>
                      <span style={{ fontSize: 13, color: c.fit === "Strong fit" ? "var(--green)" : "var(--muted)", fontWeight: 600, whiteSpace: "nowrap" }}>{c.fit}</span>
                    </div>
                    <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>{c.note}</span>
                  </div>
                ))
              ) : (
                <span style={{ fontSize: 14, color: "var(--muted)" }}>No communities confirmed yet — I&apos;ll keep looking once you&apos;re in.</span>
              )
            ) : (
              <span style={{ fontSize: 14, color: "var(--muted)" }}>Searching live — results land here once the search finishes.</span>
            )}
          </div>
          <div style={{ marginTop: "auto", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            Reddit is participation only — I&apos;ll tell you which threads to answer. No DMs, ever.
          </div>
        </div>
      </div>
    </OnboardingChrome>
  );
}
