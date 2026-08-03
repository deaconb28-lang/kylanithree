"use client";

import Link from "next/link";
import type { BuyerConfidence } from "../../lib/buyers/confidence";

// One buyer hypothesis, presented the way Explee presents a campaign: a single self-contained card
// you can read top to bottom without cross-referencing anything else on the page.
//
// The difference is what fills it. Explee shows a generated "PAIN" line and invented criteria.
// Kylani has real evidence, so this card shows a verbatim quote from someone in that segment and
// the actual communities they were found in — every line on it is checkable, which is the whole
// premise of the product. Nothing here is written by a model at render time.

export type Segment = {
  key: string;
  name: string;
  meta: string;
  /** Derived from evidence by `buyerConfidence`, never a stored label someone assigned. */
  confidence: BuyerConfidence;
  leadCount: number;
  /** Share of all leads, 0-1 — drives the ring. */
  share: number;
  waiting: number;
  /** A real, verified excerpt from the strongest lead in this segment. */
  quote: string | null;
  quoteAuthor: string | null;
  quoteHref: string | null;
  venues: string[];
};

function Ring({ share, label }: { share: number; label: string }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  // A zero-lead segment draws no arc at all. Flooring it at a sliver made "found nobody" look
  // indistinguishable from "found one", which is the opposite of what this card is for.
  const filled = Math.min(1, Math.max(0, share));
  return (
    <div style={{ position: "relative", width: 44, height: 44, flexShrink: 0 }}>
      <svg width="44" height="44" viewBox="0 0 44 44" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--border)" strokeWidth="3" />
        {filled > 0 && (
          <circle
            cx="22"
            cy="22"
            r={r}
            fill="none"
            stroke="var(--ember)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${c * filled} ${c}`}
          />
        )}
      </svg>
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          fontSize: 12,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {label}
      </span>
    </div>
  );
}

// The status is now COMPUTED from evidence, and the difference is not cosmetic.
//
// It used to be a stored field: `primary` rendered as "gaining", a word that claims replies are
// coming back. Nothing in this product can send yet — the Gmail scope is pending Google's
// verification — so no hypothesis has ever received a reply, and "gaining" was a claim with
// literally nothing behind it. A buyer with zero leads and one with forty read identically, because
// the label was written when the hypothesis was.
//
// `buyerConfidence` derives all of this from counts, and each label is only reachable when the
// counts support it. `gaining` cannot appear until sending works. That is the point.
const STATUS_STYLE: Record<BuyerConfidence["status"], { color: string; bg: string }> = {
  gaining: { color: "var(--green)", bg: "var(--green-tint)" },
  disconfirmed: { color: "var(--attention)", bg: "var(--active-bg)" },
  finding: { color: "var(--muted-strong)", bg: "var(--active-bg)" },
  unproven: { color: "var(--muted)", bg: "var(--active-bg)" },
  retired: { color: "var(--muted)", bg: "var(--active-bg)" },
};

export default function SegmentCard({ segment }: { segment: Segment }) {
  const { status: statusLabel, reason, score } = segment.confidence;
  const status = STATUS_STYLE[statusLabel];
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, letterSpacing: "-.02em" }}>{segment.name}</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: status.color, background: status.bg, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>
              {statusLabel}
            </span>
            {/* The number only renders when there is one. A hypothesis nobody has written to has no
                score at all — null, not zero — because a confident-looking 0 beside an untested
                buyer is the same fabrication the reply-rate tile was deleted for. */}
            {score !== null && (
              <span className="ky-tnum" style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)" }}>{score}/100</span>
            )}
          </div>
          <span style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.5 }}>{segment.meta}</span>
          {/* The evidence behind the badge, in the same breath as the badge. A status on its own is
              an assertion; "you rejected 5 of 8" is checkable against the queue. */}
          <span style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>{reason}</span>
        </div>
        <Ring share={segment.share} label={String(segment.leadCount)} />
      </div>

      {segment.quote ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)" }}>IN THEIR WORDS</span>
          <blockquote style={{ margin: 0, borderLeft: "2px solid var(--ember)", padding: "1px 0 1px 14px", fontSize: 14, lineHeight: 1.55, color: "var(--muted-strong)" }}>
            &ldquo;{segment.quote}&rdquo;
          </blockquote>
          {segment.quoteAuthor && (
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
              {segment.quoteAuthor}
              {segment.quoteHref && (
                <>
                  {" · "}
                  <a href={segment.quoteHref} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 500 }}>
                    read the post
                  </a>
                </>
              )}
            </span>
          )}
        </div>
      ) : segment.leadCount === 0 ? (
        <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>
          No one matched yet — the next search will test this.
        </span>
      ) : (
        // Keyed on leadCount, NOT on the absence of a quote. A buyer with six leads whose strongest
        // one happened to carry no excerpt used to render a ring reading "6" directly above the
        // sentence "No one found for this buyer yet" — the card contradicting itself in two lines.
        // People found without a usable quote is a real state, and it says so.
        <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>
          {segment.leadCount} {segment.leadCount === 1 ? "person" : "people"} matched, none with a quotable line yet.
        </span>
      )}

      {segment.venues.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)" }}>FOUND IN</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {segment.venues.slice(0, 4).map((v) => (
              <span key={v} style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)", background: "var(--card-alt)", border: "1px solid var(--border)", padding: "4px 9px", borderRadius: 999 }}>
                {v}
              </span>
            ))}
            {segment.venues.length > 4 && (
              <span style={{ fontSize: 12, color: "var(--muted)", padding: "4px 4px" }}>+{segment.venues.length - 4} more</span>
            )}
          </div>
        </div>
      )}

      <div style={{ marginTop: "auto", paddingTop: 4, display: "flex", alignItems: "center", gap: 12 }}>
        <Link
          href={`/campaign/work?filter=${encodeURIComponent(segment.key)}`}
          style={{ fontSize: 13, fontWeight: 700, color: "var(--ember)", textDecoration: "none" }}
        >
          {segment.waiting > 0 ? `Review ${segment.waiting} waiting →` : "Open in Queue →"}
        </Link>
      </div>
    </div>
  );
}
