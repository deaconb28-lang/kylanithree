"use client";

import { useRevenueTicker } from "../../lib/useRevenueTicker";

export default function RevenueFindings() {
  const { revenue, revenueMrr } = useRevenueTicker();

  return (
    <div id="findings" style={{ padding: "96px 5vw", display: "grid", gridTemplateColumns: "1fr minmax(320px,620px)", gap: 72, alignItems: "center", borderTop: "1px solid var(--border)" }} className="rf-grid">
      <style>{`@media (max-width: 980px) { .rf-grid { grid-template-columns: 1fr !important; } }`}</style>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <h2 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.05, letterSpacing: "-.03em", margin: 0 }}>
          The part nobody else can do.
        </h2>
        <p style={{ margin: 0, fontSize: 18, lineHeight: 1.62, color: "var(--muted)", maxWidth: "40ch" }}>
          Kylani sent the messages, so Kylani reads what came back. You leave with the answer you walked in without.
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: 16, padding: "22px 24px", display: "flex", flexDirection: "column", gap: 14, background: "var(--card-alt)", maxWidth: 420 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--green)", animation: "kyPulse 2s ease-in-out infinite" }} />
            <span style={{ fontSize: 13, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 700 }}>Live · closed revenue from Kylani replies</span>
          </div>
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: 46, letterSpacing: "-.04em", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{revenue}</span>
          <div style={{ display: "flex", gap: 26, fontSize: 14, color: "var(--muted)", flexWrap: "wrap" }}>
            <span><strong style={{ color: "var(--ink)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{revenueMrr}</strong> added this week</span>
            <span>across 312 founders</span>
          </div>
        </div>
      </div>
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, padding: 30, display: "flex", flexDirection: "column", gap: 22, boxShadow: "0 1px 2px rgba(20,18,15,.05), 0 26px 54px -26px rgba(20,18,15,.18)" }}>
        <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 13, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--muted)" }}>Findings · week 3</span>
        <p style={{ margin: 0, fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 27, lineHeight: 1.25, letterSpacing: "-.02em" }}>
          You thought you were selling to logistics directors. Operations managers reply six times more often.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Ops manager · 20–200 people</span>
            <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: 26, color: "var(--green)", letterSpacing: "-.03em" }}>18% reply</span>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>41 sent · 7 replied · 3 calls</span>
          </div>
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Logistics director · enterprise</span>
            <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: 26, letterSpacing: "-.03em", color: "var(--muted)" }}>3% reply</span>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>34 sent · 1 replied · 0 calls</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 4 }}>
          <span style={{ fontSize: 14, color: "var(--muted)" }}>Best opening so far</span>
          <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.6, fontStyle: "italic" }}>
            &ldquo;Saw your post about trucks stacking up at 6am — how are you sequencing appointments now?&rdquo;
          </p>
        </div>
      </div>
    </div>
  );
}
