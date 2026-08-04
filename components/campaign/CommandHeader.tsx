"use client";

import { AUTONOMY, AUTONOMY_EFFECT, AUTONOMY_LABEL, type Autonomy } from "../../lib/campaign/types";

// One row: what campaign, which lens, how much rope Kylani has, and what it is doing right now.
//
// The autonomy control is the only place in the product that changes what the agent may do without
// asking, so it states its own effect in a line underneath rather than relying on three words to
// carry it. "Suggest / Approve / Run" alone is a control whose meaning a founder has to guess, and
// guessing wrong here means either a silent product or a message they did not sanction.
//
// The status chip is a CLAIM ABOUT NOW and is therefore only rendered when there is something true
// to say. A chip that reads "Kylani is working" whenever the page is open is the same lie as a
// spinner that never stops — see the search wheel, which stops moving when work stops.

export default function CommandHeader({
  productName,
  goal,
  lens,
  onLens,
  autonomy,
  onAutonomy,
  status,
  onOpenWorklog,
  worklogCount,
}: {
  productName: string;
  /** Real progress toward a real target, or null. Never a fabricated goal. */
  goal: { done: number; target: number; label: string; daysLeft: number | null } | null;
  lens: "pipeline" | "calendar";
  onLens: (l: "pipeline" | "calendar") => void;
  autonomy: Autonomy;
  onAutonomy: (a: Autonomy) => void;
  /** What Kylani is doing right now, or null when it is not doing anything. */
  status: string | null;
  onOpenWorklog: () => void;
  worklogCount: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 0 18px", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        {/* `flex: 1 1 240px` rather than `flex: 1`, and it is load-bearing on a phone. With a plain
            `flex: 1` the nowrap goal text refused to shrink and slid straight under the lens toggle
            — measured at 390px. A basis the row cannot satisfy makes the toggle wrap onto its own
            line instead, which is the correct small-screen layout rather than a collision. */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0, flex: "1 1 240px", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, letterSpacing: "-.02em", whiteSpace: "nowrap" }}>
            {productName}
          </span>
          {/* The goal WRAPS rather than clips. `overflow: hidden` cut "41 days left" to "41 days
              lef" at 390px, and a fact truncated mid-word reads as a rendering bug rather than as
              a layout choice. There is room for a second line here. */}
          {goal ? (
            <span style={{ fontSize: 13.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 7, minWidth: 0, flexWrap: "wrap" }}>
              <span style={{ whiteSpace: "nowrap" }}>{goal.label}</span>
              <span className="ky-tnum" style={{ fontFamily: "var(--font-machine)", fontSize: 12.5, color: "var(--muted-strong)", whiteSpace: "nowrap" }}>
                {goal.done} of {goal.target}
              </span>
              {/* Days left only when there is a real deadline. A countdown to a date nobody set is
                  pressure invented by the software. */}
              {goal.daysLeft !== null && (
                <span style={{ fontFamily: "var(--font-machine)", fontSize: 12.5, whiteSpace: "nowrap" }}>
                  · {goal.daysLeft} {goal.daysLeft === 1 ? "day" : "days"} left
                </span>
              )}
            </span>
          ) : null}
        </div>

        <Segmented
          options={[
            { key: "pipeline", label: "Pipeline" },
            { key: "calendar", label: "Calendar" },
          ]}
          value={lens}
          onChange={(v) => onLens(v as "pipeline" | "calendar")}
          ariaLabel="Dashboard lens"
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Segmented
          options={AUTONOMY.map((a) => ({ key: a, label: AUTONOMY_LABEL[a] }))}
          value={autonomy}
          onChange={(v) => onAutonomy(v as Autonomy)}
          ariaLabel="How much Kylani may do without asking"
          small
        />
        <span style={{ fontSize: 12.5, color: "var(--muted)", flex: 1, minWidth: 180 }}>{AUTONOMY_EFFECT[autonomy]}</span>

        <button
          onClick={onOpenWorklog}
          className="ky-btn-outline"
          style={{ padding: "7px 13px", fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8, minHeight: 0, whiteSpace: "nowrap" }}
        >
          {status ? (
            <>
              {/* The dot is the claim. It only exists while `status` does. */}
              <span
                aria-hidden="true"
                style={{ width: 7, height: 7, borderRadius: 999, background: "var(--ember)", flexShrink: 0, animation: "kyPulse 1.5s ease-in-out infinite" }}
              />
              <span style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis" }}>{status}</span>
            </>
          ) : (
            <>
              Worklog
              {worklogCount > 0 && (
                <span className="ky-tnum" style={{ fontFamily: "var(--font-machine)", fontSize: 11.5, color: "var(--muted)" }}>
                  {worklogCount}
                </span>
              )}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/** The one segmented control shape, used for both the lens and autonomy. */
function Segmented({
  options,
  value,
  onChange,
  ariaLabel,
  small = false,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  small?: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        background: "var(--card-alt)",
        border: "1px solid var(--border)",
        borderRadius: 999,
        padding: 3,
        gap: 2,
        flexShrink: 0,
      }}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.key)}
            style={{
              border: "none",
              borderRadius: 999,
              padding: small ? "5px 12px" : "7px 16px",
              fontSize: small ? 12.5 : 13.5,
              fontWeight: 600,
              font: "inherit",
              fontFamily: "inherit",
              cursor: "pointer",
              // The selected pill is --card, not --ember. Coral means "Kylani did something" and
              // nothing else; spending it on a tab that is merely selected would make the accent
              // stop meaning anything, which is exactly what it used to do.
              background: on ? "var(--card)" : "transparent",
              color: on ? "var(--ink)" : "var(--muted)",
              boxShadow: on ? "var(--lift-1)" : "none",
              transition: "background .16s var(--ease), color .16s var(--ease)",
              whiteSpace: "nowrap",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
