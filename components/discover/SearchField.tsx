"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../../lib/useReducedMotion";

// Where Kylani is looking, drawn.
//
// The old waiting screen was a progress bar and a line of text, which tells someone that time is
// passing but nothing about what is being spent. This shows the actual shape of the search: your
// product at the centre, every real community being searched around it, a line lighting up as each
// one is reached, and a mote travelling back down that line each time a real person is found there.
//
// Every mark on it is load-bearing. A node is a community that actually resolved, its ring fills in
// proportion to the people found there, and a community that came back empty stays hollow rather
// than quietly disappearing — the empty ones are information too. Nothing here animates to look
// busy; if nothing is moving, nothing is happening.

export type FieldVenue = { id: string; name: string; platform: string };

type Props = {
  /** What sits at the centre — the founder's own product, in their words. */
  centerLabel: string;
  venues: FieldVenue[];
  /** Venue ids currently being searched. */
  scanningIds: string[];
  /** Venue ids already searched, hits or not. */
  scannedIds: string[];
  /** People found, keyed by venue display name. */
  hitsByVenue: Record<string, number>;
  working: boolean;
  /** Sidebar scale: nodes only. Labels need room this variant does not have. */
  compact?: boolean;
};

type Point = { x: number; y: number };

const CENTER: Point = { x: 50, y: 50 };

/** Node radius in viewBox units — the same scale as the layout, so labels can clear it exactly. */
function nodeRadius(hits: number, scanning: boolean): number {
  const solid = hits > 0 ? 2 + Math.min(hits, 6) * 0.28 : 1.5;
  return Math.max(solid, scanning ? 3.4 : 0);
}

/**
 * Places venues on one or two rings.
 *
 * Two rings past eight so labels never collide — a legible name matters more than a perfect circle,
 * because the name is the part a founder actually reads ("oh, r/logistics, of course").
 */
function layout(count: number): Point[] {
  if (count === 0) return [];
  const inner = Math.min(count, count > 8 ? Math.ceil(count / 2) : count);
  const outer = count - inner;

  const ring = (n: number, radius: number, offset: number): Point[] =>
    Array.from({ length: n }, (_, i) => {
      const angle = offset + (i * 2 * Math.PI) / n - Math.PI / 2;
      return { x: CENTER.x + Math.cos(angle) * radius, y: CENTER.y + Math.sin(angle) * radius };
    });

  return [...ring(inner, outer > 0 ? 27 : 36, 0), ...ring(outer, 45, Math.PI / Math.max(outer, 1))];
}

export default function SearchField({ centerLabel, venues, scanningIds, scannedIds, hitsByVenue, working, compact = false }: Props) {
  const reduced = usePrefersReducedMotion();
  const points = useMemo(() => layout(venues.length), [venues.length]);

  // A mote per newly-found person, travelling from the community it came from back to the centre.
  // Keyed on a counter rather than the venue so two finds in the same place both get one.
  const [motes, setMotes] = useState<{ key: number; from: Point }[]>([]);
  const seenHits = useRef<Record<string, number>>({});
  const moteKey = useRef(0);

  useEffect(() => {
    if (reduced) return;
    const spawned: { key: number; from: Point }[] = [];
    venues.forEach((v, i) => {
      const now = hitsByVenue[v.name] ?? 0;
      const before = seenHits.current[v.name] ?? 0;
      if (now > before && points[i]) spawned.push({ key: moteKey.current++, from: points[i] });
      seenHits.current[v.name] = now;
    });
    if (spawned.length === 0) return;
    setMotes((m) => [...m, ...spawned]);
    const timer = setTimeout(() => setMotes((m) => m.slice(spawned.length)), 1400);
    return () => clearTimeout(timer);
  }, [hitsByVenue, venues, points, reduced]);

  const scanning = new Set(scanningIds);
  const scanned = new Set(scannedIds);

  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "1", maxWidth: compact ? 260 : 460, margin: "0 auto" }}>
      <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }} aria-hidden>
        {/* Quiet guide rings. They give the nodes something to sit on so the layout reads as a
            deliberate map rather than dots scattered at random. */}
        {[27, 36, 45].map((r) => (
          <circle key={r} cx={CENTER.x} cy={CENTER.y} r={r} fill="none" stroke="var(--border)" strokeWidth={0.3} />
        ))}

        {venues.map((v, i) => {
          const p = points[i];
          if (!p) return null;
          const hits = hitsByVenue[v.name] ?? 0;
          const isScanning = scanning.has(v.id);
          const isDone = scanned.has(v.id);
          return (
            <line
              key={v.id}
              x1={CENTER.x}
              y1={CENTER.y}
              x2={p.x}
              y2={p.y}
              stroke={hits > 0 ? "var(--ember)" : isScanning ? "var(--ember)" : "var(--border-strong)"}
              strokeWidth={hits > 0 ? 0.55 : 0.3}
              strokeOpacity={hits > 0 ? 0.75 : isScanning ? 0.5 : isDone ? 0.35 : 0.18}
              style={isScanning && !reduced ? { animation: "kyLineDraw 1.6s ease-in-out infinite" } : undefined}
            />
          );
        })}

        {motes.map((m) => (
          <circle key={m.key} r={1.1} fill="var(--ember)">
            <animateMotion dur="1.1s" fill="freeze" path={`M ${m.from.x} ${m.from.y} L ${CENTER.x} ${CENTER.y}`} />
            <animate attributeName="opacity" values="0;1;1;0" dur="1.1s" fill="freeze" />
          </circle>
        ))}

        {venues.map((v, i) => {
          const p = points[i];
          if (!p) return null;
          const hits = hitsByVenue[v.name] ?? 0;
          const isScanning = scanning.has(v.id);
          const isDone = scanned.has(v.id);
          return (
            <g key={v.id}>
              {isScanning && !reduced && <circle cx={p.x} cy={p.y} r={3.4} fill="var(--ember)" opacity={0.16} style={{ animation: "kyPulse 1.5s ease-in-out infinite", transformOrigin: `${p.x}px ${p.y}px` }} />}
              <circle
                cx={p.x}
                cy={p.y}
                r={hits > 0 ? 2 + Math.min(hits, 6) * 0.28 : 1.5}
                fill={hits > 0 ? "var(--ember)" : "var(--card)"}
                stroke={hits > 0 ? "var(--ember)" : isScanning ? "var(--ember)" : "var(--border-strong)"}
                strokeWidth={0.5}
                strokeOpacity={isDone || isScanning ? 1 : 0.55}
                style={{ transition: "r .4s ease, fill .4s ease, stroke .4s ease" }}
              />
            </g>
          );
        })}

        <circle cx={CENTER.x} cy={CENTER.y} r={7} fill="var(--card)" stroke="var(--ink)" strokeWidth={0.6} />
        <circle cx={CENTER.x} cy={CENTER.y} r={2.2} fill="var(--ink)" />
        {working && !reduced && (
          <circle cx={CENTER.x} cy={CENTER.y} r={7} fill="none" stroke="var(--ember)" strokeWidth={0.5} strokeOpacity={0.5}
            style={{ animation: "kyRadar 3s ease-out infinite", transformOrigin: `${CENTER.x}px ${CENTER.y}px` }} />
        )}
      </svg>

      {/* Labels live outside the SVG so they stay crisp text at any size, and so they can be read
          by anything that reads text — the graphic is decoration, the names are the content. */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {/* Under the centre mark, not inside it. A niche name is as long as it is, and squeezing it
            into a circle either clips it or forces the circle to grow around whatever it says. */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "calc(50% + 9%)",
            transform: "translateX(-50%)",
            maxWidth: "40%",
            textAlign: "center",
            fontSize: compact ? 10 : 12,
            fontWeight: 700,
            lineHeight: 1.25,
            letterSpacing: "-.01em",
          }}
        >
          {centerLabel}
        </div>

        {!compact &&
          venues.map((v, i) => {
            const p = points[i];
            if (!p) return null;
            const hits = hitsByVenue[v.name] ?? 0;
            const right = p.x >= CENTER.x;
            return (
              <span
                key={v.id}
                style={{
                  position: "absolute",
                  // Offset by the node's own radius rather than a fixed gap: a node grows with the
                  // people found there, and a fixed gap would let a busy community swallow its
                  // own name. Percentages here are of the square, the same units the layout uses.
                  left: `calc(${right ? p.x + nodeRadius(hits, scanning.has(v.id)) : p.x - nodeRadius(hits, scanning.has(v.id))}% ${right ? "+" : "-"} 7px)`,
                  top: `${p.y}%`,
                  transform: `translate(${right ? "0" : "-100%"}, -50%)`,
                  fontSize: 11.5,
                  fontWeight: hits > 0 ? 700 : 500,
                  color: hits > 0 ? "var(--ink)" : scanning.has(v.id) ? "var(--ember)" : "var(--muted)",
                  whiteSpace: "nowrap",
                  maxWidth: "30%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  transition: "color .3s var(--ease)",
                }}
              >
                {v.name}
                {hits > 0 && <span className="ky-tnum" style={{ marginLeft: 5, color: "var(--ember)" }}>{hits}</span>}
              </span>
            );
          })}
      </div>
    </div>
  );
}
