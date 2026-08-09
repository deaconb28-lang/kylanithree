"use client";

import type { ReactNode } from "react";

// What is real, what is coming, and never the two confused.
//
// This exists because the alternative is worse in both directions. Ship the calendar with no label
// and a founder plans a week that never runs — the product lied. Hide it until it works and the
// thing that makes this worth $100/mo is invisible during the trial that decides whether they pay.
//
// So: it is shown, it is beautiful, and it says exactly what it is. A beta badge is not an apology.
// It is the difference between "we are building this in the open" and "this is broken" — and the
// only way it reads as the first is if it is specific. "Coming soon" is a shrug. "The board is live;
// Kylani cannot post to X yet — that needs the paid API tier" is a roadmap the reader can trust,
// and trust is the thing being sold.
//
// TWO RULES:
//   1. Never use --ember. Coral means "Kylani did something". A beta badge is a fact about the
//      product, not an action the agent took, and spending the accent here would blunt it
//      everywhere else.
//   2. Always name the blocker when there is one. A stage with no reason reads as indefinite.

export type BetaStage =
  /** Built and usable, with edges. The founder can rely on it today. */
  | "beta"
  /** Visible and clickable, but nothing behind it runs yet. */
  | "preview"
  /** Not built. Shown so the shape of the product is legible. */
  | "soon";

const STAGE: Record<BetaStage, { label: string; tint: string; ink: string; edge: string }> = {
  // Green: this works. Borrowed from the "connected" language the rest of the product already uses.
  beta: { label: "BETA", tint: "var(--green-tint)", ink: "var(--green)", edge: "color-mix(in srgb, var(--green) 30%, transparent)" },
  // Neutral-warm: real UI, no engine. Deliberately quieter than beta.
  preview: { label: "PREVIEW", tint: "var(--attention)", ink: "var(--muted-strong)", edge: "var(--attention-border)" },
  soon: { label: "SOON", tint: "var(--card-alt)", ink: "var(--muted)", edge: "var(--border-strong)" },
};

/** The inline badge. Sits beside a heading, never on its own. */
export function BetaBadge({ stage = "beta", label }: { stage?: BetaStage; label?: string }) {
  const s = STAGE[stage];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontFamily: "var(--font-machine)",
        fontSize: 9.5,
        letterSpacing: ".14em",
        fontWeight: 400,
        color: s.ink,
        background: s.tint,
        border: `1px solid ${s.edge}`,
        borderRadius: 999,
        padding: "2px 8px",
        whiteSpace: "nowrap",
        verticalAlign: "middle",
        lineHeight: 1.6,
      }}
    >
      {label ?? s.label}
    </span>
  );
}

/**
 * The panel wrapper: a zone that is real enough to look at, labelled for what it is.
 *
 * The content renders at full fidelity underneath — no blur, no grey-out, no "coming soon" curtain.
 * A founder should be able to see precisely what they are getting, because that is what makes them
 * wait for it. What they cannot do is mistake it for something that is already running, and the
 * strip at the top is what prevents that.
 */
export default function BetaPanel({
  stage,
  title,
  /** One sentence: what this does when it is on. Present tense, no hedging. */
  promise,
  /** What is actually standing in the way. Omitted only when the honest answer is "time". */
  blocker,
  children,
  action,
}: {
  stage: BetaStage;
  title: string;
  promise: string;
  blocker?: string;
  children?: ReactNode;
  action?: { label: string; onClick?: () => void; href?: string };
}) {
  const s = STAGE[stage];
  return (
    <section
      style={{
        border: "1px solid var(--border)",
        borderRadius: 16,
        background: "var(--card)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          padding: "13px 18px",
          background: s.tint,
          borderBottom: `1px solid ${s.edge}`,
        }}
      >
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, letterSpacing: "-.01em" }}>{title}</span>
        <BetaBadge stage={stage} />
        <span style={{ fontSize: 13, color: "var(--muted-strong)", flex: 1, minWidth: 200, lineHeight: 1.5 }}>{promise}</span>
        {action &&
          (action.href ? (
            <a href={action.href} className="ky-btn-outline" style={{ padding: "6px 13px", fontSize: 12.5, fontWeight: 600, minHeight: 0, whiteSpace: "nowrap" }}>
              {action.label}
            </a>
          ) : (
            <button onClick={action.onClick} className="ky-btn-outline" style={{ padding: "6px 13px", fontSize: 12.5, fontWeight: 600, minHeight: 0, whiteSpace: "nowrap" }}>
              {action.label}
            </button>
          ))}
      </header>

      {children && <div style={{ padding: "18px 18px 20px" }}>{children}</div>}

      {blocker && (
        // The blocker is stated in the machine's own voice at the foot of the panel, not buried in
        // a tooltip. Somebody deciding whether to pay for this deserves to read it without hunting.
        <p
          style={{
            margin: 0,
            padding: "10px 18px 13px",
            borderTop: "1px solid var(--border)",
            fontFamily: "var(--font-machine)",
            fontSize: 11.5,
            lineHeight: 1.6,
            color: "var(--muted)",
            background: "var(--card-alt)",
          }}
        >
          {blocker}
        </p>
      )}
    </section>
  );
}
