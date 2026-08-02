"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePrefersReducedMotion } from "../../lib/useReducedMotion";

// Listening, drawn.
//
// One channel per community, stacked. Each runs a live waveform, most of it noise. While a
// community is being searched a coral scan head sweeps its channel; every real person found leaves
// a tall coral spike behind that STAYS. By the end the picture is a set of rooms you listened to
// and a mark for each voice you caught in them.
//
// This replaced a radar and then a sediment column. The waveform is the right one because it is the
// same visual language the landing page already speaks — a field of bars where a few are coral, and
// a hero that oscillates like a sound wave as you scroll. The search screen now continues that
// sentence instead of starting a new one.
//
// EVERY MARK IS REAL WHERE IT COUNTS. One spike is one person found — the spike count per channel
// is that community's actual yield. The low background ticks are texture and carry no measurement;
// there is deliberately no "posts scanned" figure anywhere, because nobody counted one.
//
// Constraints, each of which has already cost this codebase a bug elsewhere:
//   1. Seeded, never Math.random() — random differs between server and client (hydration mismatch)
//      and reshuffles on every resize.
//   2. Amplitude is a scaleY on a fixed-height tick. Nothing here can reflow.
//   3. Motion is a claim that work is happening, so it stops when `working` goes false.
//   4. Reduced motion attaches no loop at all and still renders the true state — spikes, labels,
//      counts. A frozen screen has to stay informative.
//   5. Colours are tokens. The palette is rebuilt for dark mode rather than inverted.

export type FieldVenue = { id: string; name: string; platform: string };

type Props = {
  /** The niche, in the founder's own words. */
  centerLabel: string;
  venues: FieldVenue[];
  /** Venue ids currently being searched. */
  scanningIds: string[];
  /** Venue ids already searched, hits or not. */
  scannedIds: string[];
  /** People found, keyed by venue display name. */
  hitsByVenue: Record<string, number>;
  working: boolean;
  /** Sidebar scale: no labels, fewer ticks. */
  compact?: boolean;
};

const W = 100;
/** Vertical space one channel occupies, in viewBox units. */
const ROW = 12;
/** Half-height of a channel's waveform. A tick is drawn from the centre line outward. */
const AMP = 4.4;
const TICKS_FULL = 46;
const TICKS_COMPACT = 26;
/** Where a channel's waveform starts, leaving room for the label gutter on the left. */
const X0 = 20;
const X1 = 98;
/** Seconds for the scan head to cross one channel. */
const SWEEP_S = 2.4;

/** Deterministic pseudo-noise — same index, same value, on the server and after every resize. */
function noise(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export default function WaveField({
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
  const rootRef = useRef<SVGSVGElement>(null);

  const scanning = useMemo(() => new Set(scanningIds), [scanningIds]);
  const scanned = useMemo(() => new Set(scannedIds), [scannedIds]);
  const tickCount = compact ? TICKS_COMPACT : TICKS_FULL;

  const totalFound = useMemo(
    () => venues.reduce((sum, v) => sum + (hitsByVenue[v.name] ?? 0), 0),
    [venues, hitsByVenue],
  );

  const H = Math.max(venues.length, 1) * ROW + 10;

  /** Motion is a claim that work is happening. It stops when that stops being true. */
  const animate = !reduced && working;

  const channels = useMemo(
    () =>
      venues.map((v, row) => {
        const hits = hitsByVenue[v.name] ?? 0;
        const cy = 6 + row * ROW + ROW / 2;
        // Spikes are placed deterministically across the channel and never move. One per person,
        // capped at what fits — the count beside the label stays exact regardless.
        const shown = Math.min(hits, Math.floor(tickCount / 3));
        const spikes = Array.from({ length: shown }, (_, k) =>
          Math.floor(((k + 0.5 + noise(row * 31 + k) * 0.6) * tickCount) / Math.max(shown, 1)) % tickCount,
        );
        return { venue: v, row, cy, hits, spikeAt: new Set(spikes) };
      }),
    [venues, hitsByVenue, tickCount],
  );

  /**
   * The waveform.
   *
   * One rAF loop writing a scale and an opacity per tick. Phase is derived from elapsed time plus
   * the tick's own index, so each channel reads as a continuous travelling wave rather than a row
   * of independently blinking bars. A channel that is not being scanned sits near flat: the
   * amplitude IS the statement that this room is being listened to right now.
   */
  useEffect(() => {
    if (!animate) return;
    const root = rootRef.current;
    const wrap = wrapRef.current;
    if (!root || !wrap) return;

    const rows = Array.from(root.querySelectorAll<SVGGElement>("g[data-row]"));
    let frame = 0;
    let onScreen = true;
    const started = performance.now();

    const paint = (now: number) => {
      const t = (now - started) / 1000;
      for (const row of rows) {
        const isScanning = row.dataset.scanning === "1";
        const ticks = row.children;
        // Scan head position, 0..1 across the channel. Only a scanning channel has one.
        const head = isScanning ? ((t % SWEEP_S) / SWEEP_S) : -1;

        for (let i = 0; i < ticks.length; i++) {
          const el = ticks[i] as SVGGElement;
          if (el.dataset.spike === "1") continue; // a find is fixed; it does not breathe
          const f = i / ticks.length;
          // Two crests across the channel, travelling. Low spatial frequency on purpose — at the
          // original 9 the crests were narrower than the tick pitch and the row read as bunched
          // noise rather than as a wave moving through it.
          const wave = Math.sin(t * 2.4 - f * 4.2) * 0.5 + 0.5;
          const grain = noise(i * 7 + Number(row.dataset.row) * 13);
          // A finished channel keeps a real waveform. Collapsing it to a flat line said the room
          // was silent, when what actually happened is that it was noisy and few of them matched.
          let a = isScanning
            ? 0.3 + wave * 0.7 * (0.5 + grain * 0.5)
            : 0.16 + grain * 0.14 + wave * 0.06;
          // The scan head lifts whatever it is passing over — the sweep reads as attention moving.
          if (head >= 0) {
            const d = Math.abs(f - head);
            if (d < 0.06) a = Math.min(1, a + (1 - d / 0.06) * 0.55);
          }
          el.style.setProperty("--a", a.toFixed(3));
        }
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
      ([entry]) => {
        onScreen = entry.isIntersecting;
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
  }, [animate, channels, tickCount]);

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", maxWidth: compact ? 260 : 460, margin: "0 auto" }}>
      <svg
        ref={rootRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
        aria-hidden
      >
        {channels.map(({ venue, row, cy, hits, spikeAt }) => {
          const isScanning = scanning.has(venue.id);
          const isDone = scanned.has(venue.id);
          return (
            <g key={venue.id}>
              {/* The channel's resting line. A room that returned nothing keeps its line — an empty
                  community is information, not something to hide. */}
              <line
                x1={X0}
                y1={cy}
                x2={X1}
                y2={cy}
                stroke="var(--border)"
                strokeWidth={0.35}
                strokeOpacity={isDone || isScanning ? 0.9 : 0.45}
              />
              <g data-row={row} data-scanning={isScanning ? "1" : "0"}>
                {Array.from({ length: tickCount }, (_, i) => {
                  const isSpike = spikeAt.has(i);
                  const x = X0 + ((X1 - X0) * i) / (tickCount - 1);
                  // Full height always occupied; only the scale changes. Nothing can reflow.
                  const h = isSpike ? AMP * 1.75 : AMP;
                  return (
                    <g
                      key={i}
                      data-spike={isSpike ? "1" : "0"}
                      style={{
                        transform: `translateY(0px) scaleY(var(--a, ${isSpike ? 1 : 0.22}))`,
                        transformOrigin: `${x}px ${cy}px`,
                        transformBox: "view-box",
                      }}
                    >
                      <rect
                        x={x - (isSpike ? 0.62 : 0.5)}
                        y={cy - h / 2}
                        width={isSpike ? 1.25 : 1.0}
                        height={h}
                        rx={0.5}
                        fill={isSpike ? "var(--ember)" : "var(--field-idle)"}
                        opacity={isSpike ? 1 : isScanning ? 0.95 : 0.5}
                      />
                    </g>
                  );
                })}
              </g>
              {hits > 0 && (
                <circle cx={X0 - 3.4} cy={cy} r={1.5} fill="var(--ember)" />
              )}
            </g>
          );
        })}
      </svg>

      {/* Text outside the SVG so it stays crisp and readable by anything that reads text. */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {!compact &&
          channels.map(({ venue, cy, hits }) => {
            const isScanning = scanning.has(venue.id);
            return (
              <span
                key={venue.id}
                style={{
                  position: "absolute",
                  left: 0,
                  top: `${(cy / H) * 100}%`,
                  transform: "translateY(-50%)",
                  maxWidth: `${(X0 / W) * 100 - 5}%`,
                  fontSize: 9.5,
                  fontWeight: hits > 0 ? 700 : 500,
                  color: hits > 0 ? "var(--ink)" : isScanning ? "var(--ember)" : "var(--muted)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  transition: "color .3s var(--ease)",
                }}
              >
                {venue.name}
              </span>
            );
          })}
      </div>

      <div style={{ textAlign: "center", marginTop: 8 }}>
        <div style={{ fontSize: compact ? 10 : 12, fontWeight: 700, letterSpacing: "-.01em", color: "var(--ink)" }}>{centerLabel}</div>
        {totalFound > 0 && (
          <div className="ky-tnum" style={{ fontSize: compact ? 9.5 : 11.5, color: "var(--muted)" }}>
            {totalFound} {totalFound === 1 ? "person" : "people"} heard
          </div>
        )}
        {!working && totalFound === 0 && (
          <div style={{ fontSize: compact ? 9.5 : 11.5, color: "var(--muted)" }}>nobody yet</div>
        )}
      </div>
    </div>
  );
}
