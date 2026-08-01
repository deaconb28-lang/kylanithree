"use client";

import { useState } from "react";
import type { LeadScore } from "../lib/search/leadScore";

// The score made legible. Stars are the shorthand; the breakdown on hover is the honest part —
// a rating a founder can't interrogate is just a number we made up, so every point is attributable
// to intent, confidence, recency, or engagement.

function Star({ fill, size, delay }: { fill: number; size: number; delay: number }) {
  const id = `starclip-${Math.round(fill * 100)}-${size}-${Math.round(delay * 1000)}`;
  return (
    <span className="ky-star" style={{ display: "inline-block", lineHeight: 0, animationDelay: `${delay}s` }}>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
            <stop offset={`${fill * 100}%`} stopColor="var(--ember)" />
            <stop offset={`${fill * 100}%`} stopColor="var(--border-strong)" />
          </linearGradient>
        </defs>
        <path
          d="M12 2.5l2.9 6.05 6.6.9-4.8 4.6 1.2 6.55L12 17.5l-5.9 3.1 1.2-6.55-4.8-4.6 6.6-.9z"
          fill={`url(#${id})`}
        />
      </svg>
    </span>
  );
}

export default function LeadStars({
  score,
  size = 15,
  showLabel = true,
}: {
  score: LeadScore;
  size?: number;
  showLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rows: { key: keyof LeadScore["breakdown"]; label: string; max: number }[] = [
    { key: "intent", label: "Intent", max: 40 },
    { key: "confidence", label: "Match confidence", max: 25 },
    { key: "recency", label: "Recency", max: 20 },
    { key: "engagement", label: "Thread activity", max: 15 },
  ];

  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 7, cursor: "help" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      aria-label={`${score.stars} out of 5 stars — ${score.label}, ${score.total} out of 100`}
    >
      <span style={{ display: "inline-flex", gap: 1 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} fill={Math.max(0, Math.min(1, score.stars - i))} size={size} delay={i * 0.06} />
        ))}
      </span>
      {showLabel && (
        <span style={{ fontSize: 12.5, fontWeight: 600, color: score.total >= 68 ? "var(--green)" : "var(--muted)" }}>{score.label}</span>
      )}

      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: 0,
            zIndex: 30,
            width: 216,
            background: "var(--ink)",
            color: "#fff",
            borderRadius: 10,
            padding: "11px 13px",
            fontSize: 12,
            lineHeight: 1.5,
            boxShadow: "var(--lift-3)",
            cursor: "default",
          }}
        >
          <span style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginBottom: 7 }}>
            <span>{score.label}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{score.total}/100</span>
          </span>
          {rows.map((r) => {
            const value = score.breakdown[r.key];
            return (
              <span key={r.key} style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4 }}>
                <span style={{ flex: 1, opacity: 0.85 }}>{r.label}</span>
                <span style={{ width: 46, height: 4, borderRadius: 3, background: "rgba(255,255,255,.22)", overflow: "hidden", flexShrink: 0 }}>
                  <span style={{ display: "block", height: "100%", width: `${(value / r.max) * 100}%`, background: "var(--ember)" }} />
                </span>
                <span style={{ width: 30, textAlign: "right", fontVariantNumeric: "tabular-nums", opacity: 0.85 }}>
                  {value}/{r.max}
                </span>
              </span>
            );
          })}
        </span>
      )}

      <style>{`
        .ky-star { animation: kyStarPop .32s cubic-bezier(.34,1.56,.64,1) both; }
        @keyframes kyStarPop {
          from { transform: scale(.4); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) { .ky-star { animation: none !important; } }
      `}</style>
    </span>
  );
}
