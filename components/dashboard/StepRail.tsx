"use client";

import Link from "next/link";

// The pipeline as a journey rather than a dashboard. Kylani already runs six distinct stages —
// read the product, name the buyers, find their communities, find real people, draft, learn — but
// Home used to present the OUTPUT of all six at once as a wall of cards, which made a linear
// process look like an inbox. Showing the stages in order, with the current one marked, means the
// page answers "where am I up to" before it answers anything else.

export type StepState = "done" | "active" | "pending";

export type Step = {
  n: number;
  label: string;
  state: StepState;
  href?: string;
  /** Real count produced by this stage, shown once it has produced anything. */
  detail?: string;
};

function Marker({ n, state }: { n: number; state: StepState }) {
  const base: React.CSSProperties = {
    width: 26,
    height: 26,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    fontSize: 12.5,
    fontWeight: 700,
    flexShrink: 0,
    boxSizing: "border-box",
  };
  if (state === "done") return <span style={{ ...base, background: "var(--green)", color: "#fff" }}>✓</span>;
  if (state === "active") return <span style={{ ...base, background: "var(--ember)", color: "#fff" }}>{n}</span>;
  return <span style={{ ...base, border: "1.5px solid var(--border-strong)", color: "var(--muted)" }}>{n}</span>;
}

export default function StepRail({ steps }: { steps: Step[] }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        overflowX: "auto",
        padding: "4px 2px",
        // The rail is one horizontal line; on a narrow screen it scrolls rather than wrapping into
        // an unreadable zigzag.
        scrollbarWidth: "none",
      }}
      className="ky-step-rail"
    >
      <style>{`.ky-step-rail::-webkit-scrollbar { display: none; }`}</style>
      {steps.map((s, i) => {
        const isActive = s.state === "active";
        const body = (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              padding: isActive ? "7px 16px 7px 8px" : "7px 4px",
              borderRadius: 999,
              background: isActive ? "var(--card)" : "transparent",
              border: isActive ? "1px solid var(--border-strong)" : "1px solid transparent",
              boxShadow: isActive ? "var(--lift-2)" : "none",
              whiteSpace: "nowrap",
            }}
          >
            <Marker n={s.n} state={s.state} />
            {(isActive || s.state === "done") && (
              <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
                <span style={{ fontSize: 13.5, fontWeight: isActive ? 700 : 500, color: isActive ? "var(--ink)" : "var(--muted-strong)" }}>{s.label}</span>
                {s.detail && <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{s.detail}</span>}
              </span>
            )}
          </div>
        );
        return (
          <div key={s.n} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            {s.href && s.state !== "pending" ? (
              <Link href={s.href} style={{ textDecoration: "none", color: "inherit" }}>
                {body}
              </Link>
            ) : (
              body
            )}
            {i < steps.length - 1 && (
              <span style={{ width: 34, height: 1, background: "var(--border-strong)", flexShrink: 0, margin: "0 4px" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
