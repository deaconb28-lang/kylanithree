const BARS = [
  { label: "Who sees your ad", pct: 22, color: "var(--border-strong)" },
  { label: "Who actually has this problem, right now", pct: 100, color: "var(--ember)" },
];

export default function AdsComparison() {
  return (
    <div style={{ padding: "96px 5vw", display: "grid", gridTemplateColumns: "1fr minmax(320px,560px)", gap: 64, alignItems: "center", borderTop: "1px solid var(--border)" }} className="ac-grid">
      <style>{`@media (max-width: 980px) { .ac-grid { grid-template-columns: 1fr !important; } }`}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <h2 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.08, letterSpacing: "-.03em", margin: 0 }}>
          Ads only reach who&apos;s scrolling. Most of your buyers aren&apos;t.
        </h2>
        <p style={{ margin: 0, fontSize: 18, lineHeight: 1.62, color: "var(--muted)", maxWidth: "44ch" }}>
          Social ad costs keep climbing, and even a well-targeted campaign only ever reaches the sliver of people looking at
          their feed at the right moment. Everyone else — the person who complained in a Slack channel last week, the one who
          asked a question in a subreddit, the one who hasn&apos;t opened the app today — never sees it.
        </p>
        <p style={{ margin: 0, fontSize: 18, lineHeight: 1.62, color: "var(--muted)", maxWidth: "44ch" }}>
          Kylani finds and writes to that rest of your audience directly — the buyers you&apos;d never reach, find, or sell to
          through an ad, because they were never going to click one in the first place.
        </p>
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, padding: 30, display: "flex", flexDirection: "column", gap: 24, boxShadow: "0 1px 2px rgba(20,18,15,.05), 0 26px 54px -26px rgba(20,18,15,.18)" }}>
        <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 13, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--muted)" }}>
          Where your buyers actually are
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {BARS.map((b) => (
            <div key={b.label} style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14.5, color: "var(--ink)" }}>
                <span>{b.label}</span>
                <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{b.pct}%</span>
              </div>
              <div style={{ height: 12, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
                <div style={{ width: `${b.pct}%`, height: "100%", background: b.color, borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 17, letterSpacing: "-.01em" }}>
            The gap between those two bars — that&apos;s who Kylani writes to.
          </span>
          <span style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.5 }}>
            No ad spend, no impressions bought and wasted on people who&apos;ll never buy — just a person, a real reason to
            reach out, and a message from you.
          </span>
        </div>
      </div>
    </div>
  );
}
