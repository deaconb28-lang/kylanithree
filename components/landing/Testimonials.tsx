import { WHY_KYLANI } from "../../lib/data";

// This section used to be three testimonials attributed to named founders under the heading "312
// founders · three of them, in their words". None of those people exist and there are no 312
// founders — Kylani has not launched. Inventing praise for a product whose entire pitch is "the
// internet doesn't need more fake, generated messages" was the worst possible thing to put here.
//
// What replaces it is the argument itself, in the founder's own voice. A pre-launch product is
// allowed to say why it exists; it is not allowed to say strangers already love it.
export default function Testimonials() {
  return (
    <div style={{ padding: "88px 5vw", display: "flex", flexDirection: "column", gap: 34, borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 40, flexWrap: "wrap" }}>
        <h2 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(24px,3.4vw,34px)", lineHeight: 1.06, letterSpacing: "-.03em", margin: 0, maxWidth: "20ch" }}>
          Why we&apos;re building this.
        </h2>
        <span style={{ fontSize: 14.5, color: "var(--muted)" }}>Kylani is launching soon</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
        {WHY_KYLANI.map((t) => (
          <div key={t.heading} style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 28, display: "flex", flexDirection: "column", gap: 14, background: "var(--card)" }}>
            <p style={{ margin: 0, fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 20, lineHeight: 1.35, letterSpacing: "-.02em" }}>{t.heading}</p>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "var(--muted)" }}>{t.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
