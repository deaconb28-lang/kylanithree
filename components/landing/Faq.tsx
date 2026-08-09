"use client";

import { useState } from "react";
import { FAQS } from "../../lib/data";

export default function Faq() {
  const [open, setOpen] = useState(-1);

  return (
    <div style={{ padding: "96px 5vw", display: "grid", gridTemplateColumns: "minmax(200px,340px) 1fr", gap: 72, borderTop: "1px solid var(--border)" }} className="faq-grid">
      <style>{`@media (max-width: 860px) { .faq-grid { grid-template-columns: 1fr !important; } }`}</style>
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(24px,3.2vw,36px)", lineHeight: 1.06, letterSpacing: "-.03em", margin: 0 }}>The questions we get.</h2>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {FAQS.map((f, i) => (
          <div key={f.q} onClick={() => setOpen((o) => (o === i ? -1 : i))} style={{ display: "flex", flexDirection: "column", gap: 10, padding: "22px 0", borderBottom: i < FAQS.length - 1 ? "1px solid var(--border)" : "none", cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 19, flex: 1 }}>{f.q}</span>
              <span style={{ fontSize: 20, color: "var(--muted)", lineHeight: 1, transform: open === i ? "rotate(45deg)" : "none", transition: "transform .15s ease" }}>+</span>
            </div>
            {open === i && (
              <p className="ky-fade-in" style={{ margin: 0, fontSize: 15.5, lineHeight: 1.62, color: "var(--muted)", maxWidth: "66ch" }}>
                {f.a}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
