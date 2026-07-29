"use client";

import { useEffect, useRef, useState } from "react";
import OnboardingChrome from "./OnboardingChrome";
import { FEED } from "../../lib/data";

const COMMUNITY_PANEL = [
  { name: "r/supplychain", fit: "Strong fit", meta: "41k members · nine threads about appointment scheduling this month" },
  { name: "Ops Nerds (Slack)", fit: "Strong fit", meta: "1.2k members, #warehousing channel active daily" },
  { name: "Freight Caviar (newsletter)", fit: "Worth trying", meta: "Readers are brokers more than warehouses — adjacent, not exact" },
  { name: "r/logistics", fit: "Worth trying", meta: "Bigger, noisier, mostly drivers — participation only" },
  { name: "WERC forums", fit: "Checking", meta: "Warehousing association, slow but exactly your buyer" },
];

const TOTAL_DISPLAY_SECONDS = 592; // 9:52
const START_SECONDS = 0;
const RUN_MS = 45000; // real time to run the whole step — long enough to feel like real work, short of the literal 10 min

export default function Step5Search({ onDone }: { onDone: () => void }) {
  const [elapsed, setElapsed] = useState(0); // 0..1
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const start = Date.now();
    intervalRef.current = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / RUN_MS);
      setElapsed(p);
      if (p >= 1) {
        clearInterval(intervalRef.current!);
        setTimeout(onDone, 700);
      }
    }, 100);
    return () => clearInterval(intervalRef.current!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skipAhead = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    onDone();
  };

  const t = Math.round(START_SECONDS + elapsed * (TOTAL_DISPLAY_SECONDS - START_SECONDS));
  const clock = Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
  const buyers = 8 + Math.floor(elapsed * 96);
  const communities = 2 + Math.floor(elapsed * 16);
  const signals = Math.floor(elapsed * 7);
  const shown = Math.min(FEED.length, 1 + Math.floor(elapsed * (FEED.length - 0.01)));
  const panelShown = Math.min(COMMUNITY_PANEL.length, 1 + Math.floor(elapsed * (COMMUNITY_PANEL.length - 0.01)));

  return (
    <OnboardingChrome align="stretch">
      <div style={{ width: "100%", maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr minmax(280px,420px)", gap: 44 }} className="step5-grid">
        <style>{`@media (max-width: 860px) { .step5-grid { grid-template-columns: 1fr !important; } }`}</style>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 15, color: "var(--muted)" }}>
            <span style={{ width: 9, height: 9, borderRadius: 999, background: "var(--ember)", animation: "kyPulse 1.6s ease-in-out infinite" }} />
            Searching for operations managers at 20–200 person 3PLs
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(48px,7vw,92px)", lineHeight: 0.9, letterSpacing: "-.045em", fontVariantNumeric: "tabular-nums" }}>
              {clock}
            </span>
            <span style={{ fontSize: 17, color: "var(--muted)" }}>elapsed of about ten minutes</span>
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {[
              { v: buyers, l: "buyers found" },
              { v: communities, l: "communities matched" },
              { v: signals, l: "people describing the problem" },
            ].map((s) => (
              <div key={s.l} style={{ flex: "1 1 140px", background: "rgba(253,252,250,.86)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
                <div style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: 42, letterSpacing: "-.035em", fontVariantNumeric: "tabular-nums" }}>{s.v}</div>
                <div style={{ fontSize: 14, color: "var(--muted)" }}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "rgba(253,252,250,.86)", border: "1px solid var(--border)", borderRadius: 14, padding: 8, display: "flex", flexDirection: "column", gap: 2 }}>
            {FEED.slice(0, shown)
              .slice()
              .reverse()
              .map((row) => (
                <div key={row.text} className="ky-fade-in" style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 10 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 7, background: "var(--card-alt)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, color: "var(--muted)", flexShrink: 0 }}>
                    {row.tag}
                  </span>
                  <span style={{ fontSize: 15, flex: 1 }}>{row.text}</span>
                  <span style={{ fontSize: 13, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{row.meta}</span>
                </div>
              ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <button className="ky-btn-ember" onClick={skipAhead} style={{ padding: "13px 22px", fontSize: 15.5, border: "none" }}>
              Continue →
            </button>
            <span style={{ fontSize: 14, color: "var(--muted)" }}>Or close this — I&apos;ll email you when the first batch is drafted.</span>
          </div>
        </div>

        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 1px 2px rgba(20,18,15,.05), 0 22px 46px -24px rgba(20,18,15,.18)", height: "fit-content" }}>
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 15, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)" }}>
            Communities as they land
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {COMMUNITY_PANEL.slice(0, panelShown).map((c, i) => (
              <div key={c.name} className="ky-fade-in" style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 12, borderBottom: i < panelShown - 1 ? "1px solid var(--border)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 15.5, fontWeight: 600 }}>{c.name}</span>
                  <span style={{ fontSize: 13, color: c.fit === "Strong fit" ? "var(--green)" : "var(--muted)", fontWeight: 600, whiteSpace: "nowrap" }}>{c.fit}</span>
                </div>
                <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>{c.meta}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "auto", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            Reddit is participation only — I&apos;ll tell you which threads to answer. No DMs, ever.
          </div>
        </div>
      </div>
    </OnboardingChrome>
  );
}
