import type { ReactNode } from "react";

// What a zone shows before it has anything real in it.
//
// This is NOT an empty state in the usual sense, and the distinction is the point. An empty state
// apologises for a blank rectangle; a starter hands the founder the thing they would have had to go
// and find. Every one carries at least one action, because "zero dead ends" means a module with
// nothing in it still has a primary action — the module is not finished just because it is empty.
//
// It is also the answer to the no-fixtures rule. With no mock data, a new account's dashboard is
// blank in six places at once, and six apologies is a product that looks broken. A template is not
// fabricated data: it is visibly an offer the founder accepts or ignores, and nothing it shows is
// presented as something that already happened.
//
// Three shapes, one component:
//   `intro`     — this zone has never run. Say what Kylani will put here, and start it.
//   `templates` — the founder has to choose before anything can happen. Offer the choices.
//   `add`       — the zone works, there is just nothing in this slice. Offer to add one.

export type StarterKind = "intro" | "templates" | "add";

const KIND_EYEBROW: Record<StarterKind, string> = {
  intro: "not started",
  templates: "pick a starting point",
  add: "nothing here yet",
};

export interface StarterAction {
  label: string;
  onClick?: () => void;
  href?: string;
  /** Exactly one action per starter may be primary. More than one is not a next step, it is a menu. */
  primary?: boolean;
}

export interface StarterTemplate {
  key: string;
  title: string;
  /** What accepting this actually creates. Never a feature description. */
  detail: string;
  onSelect?: () => void;
}

export default function Starter({
  kind,
  title,
  body,
  actions = [],
  templates = [],
  icon,
  compact = false,
}: {
  kind: StarterKind;
  title: string;
  /** One or two sentences, present tense, saying what Kylani does here. Never what the user failed to do. */
  body: string;
  actions?: StarterAction[];
  templates?: StarterTemplate[];
  icon?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        // Dashed, and only here. A dashed edge reads as "a space waiting to be filled" everywhere
        // in this product — it is the same treatment a Kylani draft gets in a thread — where a solid
        // border would make an empty module look like a finished one that happens to be blank.
        border: "1px dashed var(--border-strong)",
        borderRadius: 14,
        background: "var(--card-alt)",
        padding: compact ? "18px 20px" : "26px 24px",
        display: "flex",
        flexDirection: "column",
        gap: compact ? 10 : 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {icon && <span style={{ flexShrink: 0, marginTop: 2, color: "var(--muted)" }}>{icon}</span>}
        <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
          {/* The eyebrow says which of the three shapes this is, so a founder can tell "this has
              never run" from "this is one slice with nothing in it" without reading the sentence.
              Mono, because it is the machine describing its own state. */}
          <span style={{ fontFamily: "var(--font-machine)", fontSize: 10, letterSpacing: ".1em", color: "var(--faint)", textTransform: "uppercase" }}>
            {KIND_EYEBROW[kind]}
          </span>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: compact ? 15.5 : 17, letterSpacing: "-.01em" }}>
            {title}
          </span>
          <span style={{ fontSize: compact ? 13.5 : 14.5, color: "var(--muted)", lineHeight: 1.55 }}>{body}</span>
        </div>
      </div>

      {templates.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: 8 }}>
          {templates.map((t) => (
            <button
              key={t.key}
              onClick={t.onSelect}
              className="ky-card-hover"
              style={{
                textAlign: "left",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 11,
                padding: "12px 14px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                font: "inherit",
                color: "inherit",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600 }}>{t.title}</span>
              {/* Mono, because this states what the machine will create — a count of real work, not
                  a feature blurb. */}
              <span style={{ fontFamily: "var(--font-machine)", fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
                {t.detail}
              </span>
            </button>
          ))}
        </div>
      )}

      {actions.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {actions.map((a) =>
            a.href ? (
              <a
                key={a.label}
                href={a.href}
                className={a.primary ? "ky-btn-ember" : "ky-btn-outline"}
                style={{ padding: "9px 16px", fontSize: 13.5, fontWeight: 600, border: a.primary ? "none" : undefined, textDecoration: "none" }}
              >
                {a.label}
              </a>
            ) : (
              <button
                key={a.label}
                onClick={a.onClick}
                className={a.primary ? "ky-btn-ember" : "ky-btn-outline"}
                style={{ padding: "9px 16px", fontSize: 13.5, fontWeight: 600, border: a.primary ? "none" : undefined }}
              >
                {a.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The "+" that lives in a zone that already has content.
 *
 * Separate from `Starter` because it appears alongside real rows rather than instead of them — the
 * calendar's empty Thursday needs one of these, not a paragraph explaining what a calendar is.
 */
export function AddSlot({ label, onClick, height = 64 }: { label: string; onClick?: () => void; height?: number }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        width: "100%",
        minHeight: height,
        border: "1px dashed var(--border-strong)",
        borderRadius: 11,
        background: "transparent",
        color: "var(--faint)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        fontSize: 12.5,
        fontWeight: 600,
        font: "inherit",
        transition: "border-color .16s var(--ease), color .16s var(--ease), background .16s var(--ease)",
      }}
      className="ky-add-slot"
    >
      <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>
        +
      </span>
      {label}
    </button>
  );
}
