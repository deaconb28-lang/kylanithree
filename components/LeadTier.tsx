"use client";

import { tierFromTotal, tierReasons, type LeadTier as Tier } from "../lib/search/leadScore";

// How strong a lead is, said in words.
//
// This replaced a five-star rating that had no legend anywhere in the product. Stars claim a
// precision the score does not have — "3.5 of 5" invites a reader to calibrate against a scale, and
// nothing ever told them what 5 meant, so the number was unfalsifiable decoration. Three named
// tiers say as much as the score honestly supports.
//
// The reason is not optional chrome. A tier on its own is still an assertion; a tier with "asked
// for a tool like yours · posted recently" underneath is checkable against the post above it, which
// is the standard every other claim in this product is held to.

const TIER_STYLE: Record<Tier, { label: string; color: string; bg: string }> = {
  strong: { label: "strong", color: "var(--green)", bg: "var(--green-tint)" },
  medium: { label: "medium", color: "var(--muted-strong)", bg: "var(--active-bg)" },
  weak: { label: "weak", color: "var(--muted)", bg: "var(--active-bg)" },
};

export default function LeadTier({
  total,
  breakdown,
  showReasons = true,
  size = "md",
}: {
  total?: number;
  breakdown?: { intent: number; confidence: number; recency: number; engagement: number };
  showReasons?: boolean;
  size?: "sm" | "md";
}) {
  // No score means no claim. A lead written before scoring existed renders nothing rather than
  // defaulting to "weak", which would be an assertion nobody made.
  if (typeof total !== "number") return null;

  const tier = TIER_STYLE[tierFromTotal(total)];
  const reasons = breakdown ? tierReasons(breakdown) : [];

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
      <span
        style={{
          fontSize: size === "sm" ? 10.5 : 11.5,
          fontWeight: 700,
          letterSpacing: ".02em",
          color: tier.color,
          background: tier.bg,
          padding: size === "sm" ? "2px 7px" : "3px 9px",
          borderRadius: 999,
          whiteSpace: "nowrap",
        }}
      >
        {tier.label}
      </span>
      {showReasons && reasons.length > 0 && (
        <span style={{ fontSize: size === "sm" ? 11.5 : 12.5, color: "var(--muted)", minWidth: 0 }}>
          {reasons.join(" · ")}
        </span>
      )}
    </span>
  );
}
