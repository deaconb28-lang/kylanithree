// The right-hand card used to be a bar chart claiming 22% of buyers see your ad. That number was
// invented, and a made-up statistic is a strange thing to put next to an argument about honesty.
// What replaces it is the actual difference between the two kinds of message — no numbers needed.
const CONTRAST = [
  {
    kind: "A template knows",
    items: ["Your first name", "Your company name", "That you exist"],
    tone: "var(--muted)",
  },
  {
    kind: "Kylani knows",
    items: [
      "The post where you described the problem",
      "Where you said it, and when",
      "Whether you were asking for help or just venting",
    ],
    tone: "var(--ember)",
  },
];

export default function AdsComparison() {
  return (
    <div style={{ padding: "96px 5vw", display: "grid", gridTemplateColumns: "1fr minmax(320px,560px)", gap: 64, alignItems: "center", borderTop: "1px solid var(--border)" }} className="ac-grid">
      <style>{`@media (max-width: 980px) { .ac-grid { grid-template-columns: 1fr !important; } }`}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <h2 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.08, letterSpacing: "-.03em", margin: 0 }}>
          Nobody writes like this. Nobody believes it&apos;s personal.
        </h2>
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--card-alt)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10, maxWidth: "46ch" }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Subject: Quick question</span>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "var(--muted)", fontStyle: "italic" }}>
            &ldquo;Hi {"{{first_name}}"}, I noticed you&apos;re a visionary leader at {"{{company}}"}. After reviewing your
            impressive organization, I thought you&apos;d be interested in our revolutionary AI-powered solution that
            increases productivity by 317%. Are you available for a quick 15-minute call this week?&rdquo;
          </p>
        </div>
        <p style={{ margin: 0, fontSize: 18, lineHeight: 1.62, color: "var(--muted)", maxWidth: "44ch" }}>
          This is what &ldquo;AI lead generation&rdquo; usually means. Nobody enjoys receiving it, and everybody can tell.
          The internet doesn&apos;t need more generated spam — it needs better ways for the right people to find each
          other.
        </p>
        <p style={{ margin: 0, fontSize: 18, lineHeight: 1.62, color: "var(--muted)", maxWidth: "44ch" }}>
          So Kylani never writes from a template. Every message is anchored to something that specific person actually
          said, in public, recently — and you read it before it goes anywhere.
        </p>
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, padding: 30, display: "flex", flexDirection: "column", gap: 24, boxShadow: "0 1px 2px rgba(20,18,15,.05), 0 26px 54px -26px rgba(20,18,15,.18)" }}>
        <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 13, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--muted)" }}>
          What the message is built from
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {CONTRAST.map((c) => (
            <div key={c.kind} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: c.tone }}>{c.kind}</span>
              {c.items.map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "baseline", gap: 9, fontSize: 14.5, color: "var(--ink)" }}>
                  <span style={{ width: 5, height: 5, borderRadius: 999, background: c.tone, flexShrink: 0, transform: "translateY(-2px)" }} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 17, letterSpacing: "-.01em" }}>
            One of these can start a conversation. The other gets deleted.
          </span>
          <span style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.5 }}>
            If Kylani can&apos;t point to something you actually said, it doesn&apos;t count you as a lead at all — so
            there&apos;s nothing to write a generic message about in the first place.
          </span>
        </div>
      </div>
    </div>
  );
}
