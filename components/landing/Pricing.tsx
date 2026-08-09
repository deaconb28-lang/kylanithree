import { PLAN, TRIAL_DAYS, formattedPrice } from "../../lib/billing";

// One plan, one price.
//
// This replaced three tiers — a free "First campaign", a $89 Founder and a $249 Studio — none of
// which were real: there was one product behind all three, no seat model, and no per-tier volume
// enforcement anywhere in the code. Three columns implied a choice the product could not honour.
//
// The figure comes from `formattedPrice()`, which formats the SAME cents the Stripe charge is
// created from. That is deliberate: the old page hardcoded "$89" as a string beside four Payment
// Links nobody could see the amounts of, so the page and the till could disagree and no test would
// catch it.

export default function Pricing() {
  return (
    <div
      id="pricing"
      style={{
        padding: "96px 5vw",
        display: "flex",
        flexDirection: "column",
        gap: 40,
        alignItems: "center",
        background: "var(--card-alt)",
        borderTop: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center", textAlign: "center", maxWidth: "44ch" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.05, letterSpacing: "-.03em", margin: 0 }}>
          One plan. Everything in it.
        </h2>
        <p style={{ margin: 0, fontSize: 15.5, color: "var(--muted)", lineHeight: 1.6 }}>
          No seats, no tiers, no call with sales. {TRIAL_DAYS} days free to find out whether the people it
          finds are worth writing to.
        </p>
      </div>

      <div
        style={{
          width: "min(100%, 440px)",
          background: "var(--card)",
          border: "1.5px solid var(--ember)",
          borderRadius: 18,
          padding: 32,
          display: "flex",
          flexDirection: "column",
          gap: 22,
          boxShadow: "var(--lift-3)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 19 }}>{PLAN.name}</span>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 46, letterSpacing: "-.03em", lineHeight: 1 }}>
            {formattedPrice()}
            <span style={{ fontSize: 17, fontWeight: 500, color: "var(--muted)" }}>/month</span>
          </span>
          <span style={{ fontSize: 14, color: "var(--muted)" }}>{PLAN.tagline}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 15, color: "var(--muted-strong)", lineHeight: 1.45 }}>
          {PLAN.features.map((f) => (
            <span key={f} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
              <span aria-hidden="true" style={{ color: "var(--ember)", fontWeight: 700, lineHeight: 1.45 }}>
                ·
              </span>
              {f}
            </span>
          ))}
        </div>

        <a href="/onboarding" className="ky-btn-ember" style={{ padding: 14, textAlign: "center", fontSize: 15.5, border: "none" }}>
          Start {TRIAL_DAYS} days free
        </a>
        <span style={{ fontSize: 12.5, color: "var(--muted)", textAlign: "center" }}>
          No card to start · cancel any time
        </span>
      </div>

      {/* The referral offer, stated where someone is deciding. Both halves are real and both are
          enforced in code — the coupon at checkout, the credit on the referee's first paid invoice. */}
      <span style={{ fontSize: 14, color: "var(--muted)", textAlign: "center", maxWidth: "42ch", lineHeight: 1.6 }}>
        Refer another founder and you both get a month: theirs free, yours off your next invoice.
      </span>
    </div>
  );
}
