const TIERS = [
  {
    name: "First campaign",
    price: "Free",
    sub: "One product, once",
    features: ["Buyer profile and hypotheses", "Up to 25 messages", "Community map"],
    cta: "Start free",
    highlight: false,
  },
  {
    name: "Founder",
    price: "$89",
    per: "/month",
    sub: "One product, one inbox",
    features: ["400 messages a month", "Daily radar card and drafted replies", "Reply classification and follow-ups", "Findings, variants, return timers"],
    cta: "Paste your URL",
    highlight: true,
    badge: "Most take this",
  },
  {
    name: "Studio",
    price: "$249",
    per: "/month",
    sub: "Five products, shared queue",
    features: ["1,500 messages a month", "Seats and a shared approval queue", "Per-client findings"],
    cta: "Talk to us",
    highlight: false,
  },
];

export default function Pricing() {
  return (
    <div id="pricing" style={{ padding: "96px 5vw", display: "flex", flexDirection: "column", gap: 44, background: "var(--card-alt)", borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 40, flexWrap: "wrap" }}>
        <h2 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.05, letterSpacing: "-.03em", margin: 0 }}>
          Priced per hundred, not per seat.
        </h2>
        <p style={{ margin: 0, fontSize: 15.5, color: "var(--muted)", maxWidth: "34ch" }}>
          Volume caps are deliberate. A hundred specific messages beat ten thousand generic ones, and your domain stays clean.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20, alignItems: "start" }}>
        {TIERS.map((t) => (
          <div
            key={t.name}
            style={{
              background: "var(--card)",
              border: t.highlight ? "1.5px solid var(--ember)" : "1px solid var(--border)",
              borderRadius: 16,
              padding: 30,
              display: "flex",
              flexDirection: "column",
              gap: 20,
              boxShadow: t.highlight ? "var(--lift-3)" : "none",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 19 }}>{t.name}</span>
                {t.badge && <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ember)", background: "var(--ember-tint)", padding: "3px 8px", borderRadius: 999 }}>{t.badge}</span>}
              </div>
              <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: 40, letterSpacing: "-.03em" }}>
                {t.price}
                {t.per && <span style={{ fontSize: 17, fontWeight: 500, color: "var(--muted)" }}>{t.per}</span>}
              </span>
              <span style={{ fontSize: 14, color: "var(--muted)" }}>{t.sub}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 15, color: "var(--muted-strong)" }}>
              {t.features.map((f) => (
                <span key={f}>{f}</span>
              ))}
            </div>
            {t.highlight ? (
              <a href="/onboarding" className="ky-btn-ember" style={{ padding: 13, textAlign: "center", fontSize: 15 }}>
                {t.cta}
              </a>
            ) : (
              <a href="/onboarding" className="ky-btn-outline" style={{ padding: 12, textAlign: "center", fontWeight: 600, fontSize: 15 }}>
                {t.cta}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
