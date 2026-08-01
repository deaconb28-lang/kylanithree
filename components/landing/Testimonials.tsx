import { TESTIMONIALS } from "../../lib/data";

export default function Testimonials() {
  return (
    <div style={{ padding: "88px 5vw", display: "flex", flexDirection: "column", gap: 34, borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 40, flexWrap: "wrap" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(24px,3.4vw,34px)", lineHeight: 1.06, letterSpacing: "-.03em", margin: 0 }}>
          What the first hundred actually did.
        </h2>
        <span style={{ fontSize: 14.5, color: "var(--muted)" }}>312 founders · three of them, in their words</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
        {TESTIMONIALS.map((t) => (
          <div key={t.name} style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 28, display: "flex", flexDirection: "column", gap: 18, background: "var(--card)" }}>
            <p style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, lineHeight: 1.35, letterSpacing: "-.02em" }}>&ldquo;{t.quote}&rdquo;</p>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: "auto" }}>
              <span style={{ width: 34, height: 34, borderRadius: 999, background: t.color, flexShrink: 0 }} />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 14.5, fontWeight: 600 }}>{t.name}</span>
                <span style={{ fontSize: 13.5, color: "var(--muted)" }}>{t.role}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
