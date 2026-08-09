"use client";

import { formatDelta, formatRate } from "../../lib/campaign/funnel";
import type { FunnelSummary, StageKey } from "../../lib/campaign/types";

// The funnel IS the navigation.
//
// Four nodes and three connectors, and the connectors carry the rates — which is the whole reason
// this beats four stat tiles. A tile grid says "here are some numbers"; a spine says "this is one
// process, here is where it has got to, and here is where it is losing people". The rate lives on
// the connector because that is literally what it measures: the passage between two stages, not a
// property of either one.
//
// Load-bearing details:
//   · The connectors DRAW ONCE on mount and never again. Motion that repeats is decoration, and
//     this band is the screenshot people share — it needs to be still by the time they look at it.
//   · A missing rate renders nothing rather than "0%". `x/0` is unanswerable; see funnel.ts.
//   · Selection is --active-bg, never --ember. Coral means "Kylani did something", and a tab the
//     founder clicked is something the FOUNDER did.
//   · No horizontal scroller on phones. Four stages behind a swipe nobody knows to make defeats the
//     point, so it becomes a 2×2 grid where all four stay visible.

export default function Spine({
  funnel,
  active,
  onSelect,
}: {
  funnel: FunnelSummary;
  /** null = the Today workspace. A stage key = that stage's workspace. */
  active: StageKey | null;
  onSelect: (stage: StageKey | null) => void;
}) {
  return (
    <div className="ky-spine" role="tablist" aria-label="Pipeline stages">
      {funnel.stages.map((node, i) => {
        const on = active === node.key;
        const delta = formatDelta(node.delta);
        const rate = formatRate(node.rateFromPrevious);
        return (
          <div key={node.key} className="ky-spine-cell">
            {i > 0 && (
              <div className="ky-spine-link" aria-hidden="true">
                <span className="ky-spine-rule" />
                {/* The rate sits ON the connector. Omitted entirely when unanswerable — the
                    connector still draws, because the two stages are still joined. */}
                {rate && <span className="ky-spine-rate">{rate}</span>}
              </div>
            )}
            <button
              role="tab"
              aria-selected={on}
              onClick={() => onSelect(on ? null : node.key)}
              className={`ky-spine-node${on ? " active" : ""}`}
            >
              <span className="ky-spine-count">{node.count}</span>
              <span className="ky-spine-label">{node.label}</span>
              {/* Nothing at all before there is history. "+0 this wk" on a new account is a
                  measurement nobody took. */}
              {delta && <span className="ky-spine-delta">{delta}</span>}
            </button>
          </div>
        );
      })}
    </div>
  );
}
