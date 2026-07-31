"use client";

// A small animated "reading" visual shared by Step2Reading and Step5Search — a browser-window
// mockup with shimmering skeleton lines and a scanning beam sweeping through them on loop. Purely
// decorative (respects prefers-reduced-motion), gives the wait something to look at beyond a
// checklist and a spinner.
export default function ScanningWindow({ label, accent = "var(--ember)" }: { label: string; accent?: string }) {
  const lineWidths = [78, 52, 68, 38, 60];
  return (
    <div
      className="ky-scanwin"
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 220,
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "var(--card)",
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(20,18,15,.05), 0 18px 36px -22px rgba(20,18,15,.2)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", gap: 5, padding: "9px 11px", borderBottom: "1px solid var(--border)", background: "var(--card-alt)" }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--border-strong)" }} />
        <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--border-strong)" }} />
        <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--border-strong)" }} />
      </div>
      <div style={{ position: "relative", padding: "14px 13px", display: "flex", flexDirection: "column", gap: 7, height: 96, overflow: "hidden" }}>
        {lineWidths.map((w, i) => (
          <span
            key={i}
            className="ky-scanwin-line"
            style={{ height: 7, width: `${w}%`, borderRadius: 4, background: "var(--border-strong)", animationDelay: `${i * 0.12}s` }}
          />
        ))}
        <div
          className="ky-scanwin-beam"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: 22,
            background: `linear-gradient(180deg, transparent 0%, ${accent}22 50%, transparent 100%)`,
          }}
        />
      </div>
      <div style={{ padding: "7px 13px", borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </div>
      <style>{`
        .ky-scanwin-line { animation: kyShimmer 1.6s ease-in-out infinite; }
        .ky-scanwin-beam { animation: kyScan 2.6s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ky-scanwin-line, .ky-scanwin-beam { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
