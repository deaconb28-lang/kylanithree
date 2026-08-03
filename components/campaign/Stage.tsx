"use client";

import type { ReactNode } from "react";

// One step of the pipeline narrative.
//
// The home used to be a header, a checklist, a tile grid and three panels — an inbox with statistics
// bolted on. It now reads as the sequence the product actually performs: what it read, who it thinks
// buys, who it found. Each step shows a real artifact rather than a count of one, because "4 buyers"
// tells a founder nothing and "operations manager at a 20-100 person 3PL" tells them everything.
//
// A numbered rule down the left carries the sequence without a progress bar. This is deliberately
// NOT the five-step setup checklist that used to live here: a checklist is a list of chores that
// stays on screen after they are done, and this is a description of work that keeps happening.

export default function Stage({
  n,
  title,
  aside,
  children,
}: {
  n: number;
  title: string;
  /** Right-aligned counterweight to the title — a count, a link, a status. Optional by design. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ky-stage">
      <style>{`
        .ky-stage {
          display: grid;
          grid-template-columns: 34px 1fr;
          gap: 0 14px;
          align-items: start;
        }
        .ky-stage-rule {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          align-self: stretch;
        }
        .ky-stage-line { flex: 1; width: 1px; background: var(--border); min-height: 12px; }
        /* On a phone the gutter costs a third of the line length for a decoration. The number moves
           inline with the title and the rule disappears entirely. */
        @media (max-width: 640px) {
          .ky-stage { grid-template-columns: 1fr; gap: 0; }
          .ky-stage-rule { display: none; }
          .ky-stage-head { display: flex; align-items: baseline; gap: 9px; }
        }
      `}</style>

      <div className="ky-stage-rule" aria-hidden>
        <span
          className="ky-tnum"
          style={{
            width: 26,
            height: 26,
            borderRadius: 999,
            border: "1px solid var(--border-strong)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12.5,
            fontWeight: 700,
            color: "var(--muted)",
            flexShrink: 0,
          }}
        >
          {n}
        </span>
        <span className="ky-stage-line" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, paddingBottom: 30 }}>
        <div className="ky-stage-head" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "clamp(17px, 2.2vw, 20px)",
              letterSpacing: "-.02em",
              margin: 0,
              color: "var(--ink)",
            }}
          >
            {title}
          </h2>
          {aside}
        </div>
        {children}
      </div>
    </section>
  );
}
