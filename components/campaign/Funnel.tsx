"use client";

import Link from "next/link";

// The funnel: five stages of one pipeline, read left to right.
//
// This replaced a grid of six metric tiles. A tile grid says "here are some numbers"; a row of
// stages says "this is one process and here is where it has got to", which is the actual question a
// founder opens the app with. Every stage is a door — a number that is not a link is decoration.
//
// EXACTLY ONE stage carries the accent, and it is the one that needs the person. Coral appeared on
// the sidebar, a stat tile, a badge and a CTA at the same time before, which meant it signalled
// nothing at all.
//
// On a phone this becomes a two-column grid rather than a scrolling row. A horizontal scroller
// hides stages behind a gesture nobody knows to make, and the whole point is that the five are
// visible at once.

export type FunnelStage = {
  key: string;
  label: string;
  value: number;
  href: string;
  /** Shown under the value — only ever real, and only when its inputs are meaningful. */
  sub?: string;
};

export default function Funnel({ stages, accentKey }: { stages: FunnelStage[]; accentKey: string | null }) {
  return (
    <div className="ky-funnel">
      <style>{`
        .ky-funnel {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          align-items: stretch;
          gap: 0;
          border: 1px solid var(--border);
          border-radius: 16px;
          overflow: hidden;
          background: var(--card);
        }
        .ky-funnel-stage {
          display: flex;
          flex-direction: column;
          gap: 3px;
          padding: 18px 16px;
          text-decoration: none;
          color: inherit;
          min-width: 0;
          border-right: 1px solid var(--border);
          transition: background .18s var(--ease);
        }
        .ky-funnel-stage:last-child { border-right: none; }
        .ky-funnel-stage:hover { background: var(--wash-active); }
        /* The active stage is lifted by an inset border, not a fill — a filled tile competes with
           the one primary button, and there is only one of those per screen. */
        .ky-funnel-stage[data-accent="1"] {
          box-shadow: inset 0 0 0 1.5px var(--ember);
          border-radius: 14px;
        }
        @media (max-width: 720px) {
          .ky-funnel { grid-template-columns: repeat(2, 1fr); }
          .ky-funnel-stage { padding: 14px 14px; border-bottom: 1px solid var(--border); }
          /* Every second cell loses its right border, and the last one spans the full width so the
             row never ends in a half-empty cell. */
          .ky-funnel-stage:nth-child(2n) { border-right: none; }
          .ky-funnel-stage:last-child { grid-column: 1 / -1; border-bottom: none; }
        }
      `}</style>

      {stages.map((s) => {
        const accent = s.key === accentKey;
        return (
          <Link key={s.key} href={s.href} className="ky-funnel-stage" data-accent={accent ? "1" : "0"}>
            <span
              className="ky-tnum"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: "clamp(24px, 4.4vw, 32px)",
                lineHeight: 1.05,
                letterSpacing: "-.03em",
                color: accent ? "var(--ember)" : "var(--ink)",
              }}
            >
              {s.value}
            </span>
            <span style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.3 }}>{s.label}</span>
            {s.sub && <span style={{ fontSize: 11.5, color: "var(--faint)" }}>{s.sub}</span>}
          </Link>
        );
      })}
    </div>
  );
}
