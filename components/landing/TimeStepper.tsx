"use client";

import { useState } from "react";
import { STEPS } from "../../lib/data";

function StepPanel({ step }: { step: number }) {
  if (step === 0) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 12 }}>
        {[
          { name: "Operations manager", meta: "3PLs, 20–200 people", tag: "MOST LIKELY", strong: true },
          { name: "Warehouse manager", meta: "Distribution centres", tag: "EDIT · DROP", strong: false },
          { name: "Logistics director", meta: "Enterprise shippers", tag: "LEAST SURE", strong: false },
        ].map((c) => (
          <div key={c.name} style={{ border: c.strong ? "1.5px solid var(--ink)" : "1px solid var(--border)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{c.name}</span>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>{c.meta}</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: c.strong ? "var(--ember)" : "var(--muted)" }}>{c.tag}</span>
          </div>
        ))}
      </div>
    );
  }
  if (step === 1) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--card-alt)", padding: 16, fontSize: 15, lineHeight: 1.6 }}>
          Eli — saw Northline is hiring a receiving clerk and &ldquo;managing carrier arrival windows&rdquo; is the first line of the ad. That part is what I build…
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ background: "var(--ember)", color: "#fff", borderRadius: 9, padding: "10px 16px", fontSize: 14, fontWeight: 600 }}>Approve · send today</span>
          <span style={{ border: "1px solid var(--border-strong)", borderRadius: 9, padding: "9px 14px", fontSize: 14 }}>Edit</span>
          <span style={{ fontSize: 13.5, color: "var(--muted)", marginLeft: "auto" }}>39 more drafts</span>
        </div>
      </div>
    );
  }
  if (step === 2) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ borderLeft: "2px solid var(--ember)", paddingLeft: 16, fontSize: 16, lineHeight: 1.6, fontStyle: "italic" }}>
          &ldquo;Two carriers showed up in the same 30-minute window twice this week. How is everyone else sequencing inbound?&rdquo;
        </div>
        <span style={{ fontSize: 13.5, color: "var(--muted)" }}>Marisol Reyes · ops manager, 60-person 3PL · r/supplychain, 4h ago</span>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ background: "var(--ember)", color: "#fff", borderRadius: 9, padding: "10px 16px", fontSize: 14, fontWeight: 600 }}>Post reply</span>
          <span style={{ border: "1px solid var(--border-strong)", borderRadius: 9, padding: "9px 14px", fontSize: 14, color: "var(--muted)" }}>Skip</span>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[
        { l: "Ops manager", v: "18%", pct: 100, strong: true },
        { l: "Warehouse manager", v: "9%", pct: 50, strong: false },
        { l: "Logistics director", v: "3%", pct: 17, strong: false },
      ].map((r) => (
        <div key={r.l} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: r.strong ? "inherit" : "var(--muted)" }}>
            <span>{r.l}</span>
            <span style={{ fontWeight: 600, color: r.strong ? "var(--green)" : "inherit" }}>{r.v}</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
            <div style={{ width: `${r.pct}%`, height: "100%", background: r.strong ? "var(--green)" : r.pct > 30 ? "var(--ink)" : "var(--border-strong)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TimeStepper() {
  const [step, setStep] = useState(0);
  const s = STEPS[step];

  return (
    <div style={{ padding: "96px 5vw", display: "flex", flexDirection: "column", gap: 56, background: "var(--card-alt)", borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 700 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.05, letterSpacing: "-.03em", margin: 0 }}>
          Ten minutes, a week, then every morning.
        </h2>
        <p style={{ margin: 0, fontSize: 18, lineHeight: 1.6, color: "var(--muted)" }}>
          One real time cost, up front — then it tapers fast. About an hour, total, across your first week. Under a minute a day
          after that.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,380px) 1fr", gap: 40, alignItems: "start" }} className="stepper-grid">
        <style>{`@media (max-width: 860px) { .stepper-grid { grid-template-columns: 1fr !important; } }`}</style>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {STEPS.map((st, i) => (
            <div
              key={st.k}
              onClick={() => setStep(i)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "16px 18px",
                borderRadius: 12,
                cursor: "pointer",
                background: "var(--card)",
                border: "1px solid var(--border)",
              }}
              className="ky-btn-outline"
            >
              <div style={{ width: 4, height: 30, borderRadius: 3, background: i === step ? "var(--ember)" : "var(--border-strong)" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>{st.label}</span>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>{st.sub}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--green)", background: "var(--green-tint)", padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>{st.tag}</span>
            </div>
          ))}
          <span style={{ fontSize: 14, color: "var(--muted)", padding: "10px 18px 0" }}>Click a stage to see the actual screen.</span>
        </div>

        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, padding: "30px 32px", display: "flex", flexDirection: "column", gap: 20, minHeight: 330, boxShadow: "var(--lift-3)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 13, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ember)", fontWeight: 700 }}>{s.k}</span>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 28, lineHeight: 1.2, letterSpacing: "-.025em" }}>{s.h}</span>
            <span style={{ fontSize: 16, color: "var(--muted)", lineHeight: 1.6, maxWidth: "56ch" }}>{s.b}</span>
          </div>
          <StepPanel step={step} />
        </div>
      </div>
    </div>
  );
}
