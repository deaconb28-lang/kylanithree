"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePrefersReducedMotion } from "../../lib/useReducedMotion";

// The search, as a wheel.
//
// Same waveform as before, bent into a circle: bars radiate from a hub, their length oscillates,
// and a bright sweep travels around the rim while work is happening. That sweep is what makes it
// read as a loading wheel rather than as a chart — a founder knows instantly that something is
// running, without a label saying so.
//
// The rim is divided into one arc per community, so the wheel is still a map of where Kylani is
// looking rather than a decoration. A community being searched has its arc lit; a community that
// came back empty keeps its arc, quiet — an empty room is information, not something to hide.
//
// EVERY CORAL BAR IS ONE PERSON FOUND, sitting in its own community's arc. The pale bars are
// texture and carry no measurement; there is deliberately no "posts scanned" number anywhere,
// because nobody counted one.
//
// Constraints, each already paid for elsewhere in this codebase:
//   1. Seeded, never Math.random() — random differs between server and client (hydration mismatch)
//      and reshuffles on resize.
//   2. Length is a scaleY on a fixed bar. Nothing here reflows.
//   3. Motion is a claim that work is happening, so it stops when `working` goes false.
//   4. Reduced motion attaches no loop and still renders the true state: every found bar, in the
//      right arc, with the counts.
//   5. Colours are tokens — the dark palette is rebuilt, not inverted.

export type FieldVenue = { id: string; name: string; platform: string };

type Props = {
  centerLabel: string;
  venues: FieldVenue[];
  scanningIds: string[];
  scannedIds: string[];
  hitsByVenue: Record<string, number>;
  working: boolean;
  compact?: boolean;
};

const SIZE = 100;
const CX = SIZE / 2;
const CY = SIZE / 2;
/** Where a bar starts. The hub inside it carries the label. */
const INNER = 27;
/** Longest a bar can reach. Fixed, so the wheel's footprint never changes. */
const LEN = 17;
const BARS_FULL = 84;
const BARS_COMPACT = 48;
/** Seconds for the sweep to travel once around. */
const SWEEP_S = 2.6;

function noise(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export default function SearchWheel({
  centerLabel,
  venues,
  scanningIds,
  scannedIds,
  hitsByVenue,
  working,
  compact = false,
}: Props) {
  const reduced = usePrefersReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const rimRef = useRef<SVGGElement>(null);

  const scanning = useMemo(() => new Set(scanningIds), [scanningIds]);
  const scanned = useMemo(() => new Set(scannedIds), [scannedIds]);
  const barCount = compact ? BARS_COMPACT : BARS_FULL;

  const totalFound = useMemo(
    () => venues.reduce((sum, v) => sum + (hitsByVenue[v.name] ?? 0), 0),
    [venues, hitsByVenue],
  );

  /** Motion is a claim that work is happening. It stops when that stops being true. */
  const animate = !reduced && working;

  /**
   * One bar per rim slot, each belonging to a community's arc.
   *
   * Found bars are placed deterministically inside their own arc and never move, so the wheel's
   * coral marks are a stable picture of which community produced whom.
   */
  const bars = useMemo(() => {
    const n = Math.max(venues.length, 1);
    const per = Math.floor(barCount / n);
    const out: {
      i: number;
      deg: number;
      venue: FieldVenue | null;
      found: boolean;
      seed: number;
    }[] = [];

    for (let i = 0; i < barCount; i++) {
      const slot = Math.min(Math.floor(i / per), n - 1);
      const venue = venues[slot] ?? null;
      const withinArc = i - slot * per;
      const hits = venue ? (hitsByVenue[venue.name] ?? 0) : 0;
      // Spread this community's finds across its own arc rather than clustering at its start.
      const shown = Math.min(hits, Math.max(1, per - 1));
      const step = shown > 0 ? per / shown : 0;
      const found =
        shown > 0 && withinArc < per && Math.floor(withinArc / Math.max(step, 1)) < shown && withinArc % Math.max(Math.round(step), 1) === 0;
      out.push({ i, deg: (i * 360) / barCount, venue, found, seed: noise(i * 5 + 3) });
    }
    return out;
  }, [venues, hitsByVenue, barCount]);

  /**
   * The sweep.
   *
   * One rAF loop writing a scale per bar. The bright band travelling round the rim is the loading
   * signal; the underlying oscillation is the waveform. A bar in an arc nobody is searching sits
   * low but never flat — the room is noisy whether or not we matched anyone in it, and a flat line
   * would say otherwise.
   */
  useEffect(() => {
    if (!animate) return;
    const rim = rimRef.current;
    const wrap = wrapRef.current;
    if (!rim || !wrap) return;

    const nodes = Array.from(rim.querySelectorAll<SVGGElement>("g[data-bar]"));
    let frame = 0;
    let onScreen = true;
    const started = performance.now();

    const paint = (now: number) => {
      const t = (now - started) / 1000;
      const head = (t % SWEEP_S) / SWEEP_S;
      for (const el of nodes) {
        if (el.dataset.found === "1") continue; // a find is fixed; it does not breathe
        const f = Number(el.dataset.f);
        const isScanning = el.dataset.scanning === "1";
        const grain = Number(el.dataset.seed);
        const wave = Math.sin(t * 2.2 - f * Math.PI * 4) * 0.5 + 0.5;
        let a = isScanning ? 0.32 + wave * 0.6 * (0.5 + grain * 0.5) : 0.16 + grain * 0.12 + wave * 0.05;
        // Distance round the rim to the sweep head, wrapped — so the band crosses 0° seamlessly
        // instead of restarting there.
        let d = Math.abs(f - head);
        if (d > 0.5) d = 1 - d;
        if (d < 0.075) a = Math.min(1, a + (1 - d / 0.075) * 0.65);
        el.style.setProperty("--a", a.toFixed(3));
      }
      frame = requestAnimationFrame(paint);
    };

    const start = () => {
      if (!frame && onScreen) frame = requestAnimationFrame(paint);
    };
    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const observer = new IntersectionObserver(
      ([e]) => {
        onScreen = e.isIntersecting;
        if (onScreen) start();
        else stop();
      },
      { rootMargin: "80px" },
    );
    observer.observe(wrap);
    start();
    return () => {
      stop();
      observer.disconnect();
    };
  }, [animate, bars, barCount]);

  const width = compact ? 200 : 340;

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", maxWidth: width, margin: "0 auto" }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: "100%", height: "auto", display: "block" }} aria-hidden>
        {/* The rim these sit on. Quiet — it frames the bars without competing. */}
        <circle cx={CX} cy={CY} r={INNER - 2.5} fill="none" stroke="var(--border)" strokeWidth={0.4} />

        <g ref={rimRef}>
          {bars.map((b) => {
            const isScanning = b.venue ? scanning.has(b.venue.id) : false;
            const w = b.found ? 1.5 : 1.05;
            return (
              // Rotation as an SVG attribute about the hub, scale as CSS about the bar's inner
              // end. Two different origins, so they cannot share one transform.
              <g key={b.i} transform={`rotate(${b.deg} ${CX} ${CY})`}>
                <g
                  data-bar
                  data-f={(b.i / barCount).toFixed(4)}
                  data-found={b.found ? "1" : "0"}
                  data-scanning={isScanning ? "1" : "0"}
                  data-seed={b.seed.toFixed(4)}
                  style={{
                    transform: `scaleY(var(--a, ${b.found ? 1 : 0.24}))`,
                    transformOrigin: `${CX}px ${CY - INNER}px`,
                    transformBox: "view-box",
                  }}
                >
                  <rect
                    x={CX - w / 2}
                    y={CY - INNER - LEN}
                    width={w}
                    height={LEN}
                    rx={w / 2}
                    fill={b.found ? "var(--ember)" : "var(--field-idle)"}
                    opacity={b.found ? 1 : isScanning ? 0.95 : 0.55}
                  />
                </g>
              </g>
            );
          })}
        </g>

        {/* Arc ticks: one per community boundary, so the divisions are legible as divisions. */}
        {venues.map((v, i) => {
          const deg = (i * 360) / Math.max(venues.length, 1);
          const done = scanned.has(v.id);
          const isScanning = scanning.has(v.id);
          return (
            <g key={v.id} transform={`rotate(${deg} ${CX} ${CY})`}>
              <rect
                x={CX - 0.25}
                y={CY - INNER - LEN - 2.5}
                width={0.5}
                height={2}
                fill={isScanning ? "var(--ember)" : "var(--border-strong)"}
                opacity={isScanning ? 1 : done ? 0.6 : 0.3}
              />
            </g>
          );
        })}
      </svg>

      {/* The hub. Text lives outside the SVG so it stays crisp and readable by anything that reads
          text — the wheel is the illustration, these are the facts. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          textAlign: "center",
          padding: "0 26%",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: compact ? 11 : 14,
            lineHeight: 1.15,
            letterSpacing: "-.02em",
            color: "var(--ink)",
          }}
        >
          {centerLabel}
        </span>
        {totalFound > 0 && (
          <span className="ky-tnum" style={{ fontSize: compact ? 9.5 : 12, color: "var(--muted)", marginTop: 2 }}>
            {totalFound} found
          </span>
        )}
        {!working && totalFound === 0 && (
          <span style={{ fontSize: compact ? 9.5 : 12, color: "var(--muted)", marginTop: 2 }}>nobody yet</span>
        )}
      </div>

      {/* Which communities, as real text. The wheel shows where the finds came from; this says the
          names, because a founder reads "r/logistics, of course" and the arc alone cannot say it. */}
      {!compact && venues.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "5px 12px", marginTop: 12 }}>
          {venues.map((v) => {
            const hits = hitsByVenue[v.name] ?? 0;
            const isScanning = scanning.has(v.id);
            return (
              <span
                key={v.id}
                style={{
                  fontSize: 11.5,
                  fontWeight: hits > 0 ? 700 : 500,
                  color: hits > 0 ? "var(--ink)" : isScanning ? "var(--ember)" : "var(--muted)",
                  transition: "color .3s var(--ease)",
                }}
              >
                {v.name}
                {hits > 0 && <span className="ky-tnum" style={{ marginLeft: 4, color: "var(--ember)" }}>{hits}</span>}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
