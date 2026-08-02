"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePrefersReducedMotion } from "../../lib/useReducedMotion";

// What a search actually looks like, drawn as sediment.
//
// This replaced a radar — concentric rings and a sweep — which was the wrong metaphor twice over.
// A radar implies covering an area evenly, and it implies everything it touches is a contact. What
// Kylani really does is pour an enormous amount of chatter through a filter and keep almost none of
// it. So: grains fall from each community, the pale ones wash away before they reach the floor, and
// the rare coral ones survive and settle into a seam.
//
// The discard being visible is the honest part, and it is the whole reason this metaphor was
// chosen. A founder should be able to see that most of what was examined was not a lead.
//
// EVERY NUMBER HERE IS REAL. One stratum in the seam is one person found — the layer count is the
// lead count, not a flourish. The pale grains are texture and carry no measurement at all; there is
// deliberately no "posts examined" figure anywhere, because nobody counted one.
//
// Four constraints are load-bearing and each has already cost this codebase a bug elsewhere:
//   1. Positions come from a seeded function, never Math.random() — random differs between server
//      and client (hydration mismatch) and reshuffles on every resize.
//   2. Nothing here can reflow. The container is a fixed box and everything inside moves by
//      transform or changes opacity, exactly like the landing hero's field.
//   3. Reduced motion attaches no animation loop at all and renders the true current state — a
//      frozen screen still has to be fully informative.
//   4. Colours are tokens. The palette is rebuilt for dark mode rather than inverted, so a literal
//      hex would be correct in one mode and wrong in the other.

export type FieldVenue = { id: string; name: string; platform: string };

type Props = {
  /** The niche, in the founder's own words. Sits under the seam as its label. */
  centerLabel: string;
  venues: FieldVenue[];
  /** Venue ids currently being searched. */
  scanningIds: string[];
  /** Venue ids already searched, hits or not. */
  scannedIds: string[];
  /** People found, keyed by venue display name. */
  hitsByVenue: Record<string, number>;
  working: boolean;
  /** Sidebar scale: no venue labels, fewer grains. */
  compact?: boolean;
};

// viewBox units. Taller than wide — sediment needs somewhere to fall.
const W = 100;
const H = 128;
/** Where the emitters sit, and where the floor is. Everything falls between them. */
const TOP = 22;
const FLOOR = 120;
/** Tallest the seam may draw, so a very good search cannot overflow its own box. */
const SEAM_MAX = 62;
/** One person's deposit. Thin, so ten finds read as strata rather than as a block. */
const STRATUM = 2.1;

const GRAINS_FULL = 104;
const GRAINS_COMPACT = 38;
/** Seconds for one grain to fall the whole column. Varied per grain so the field never pulses. */
const FALL_MIN = 2.6;
const FALL_MAX = 4.8;

/**
 * Deterministic pseudo-noise. Same index, same value, on the server, on the client and after every
 * resize — which is what stops the field reshuffling itself when the window moves.
 */
function noise(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export default function SedimentField({
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
  const grainsRef = useRef<SVGGElement>(null);

  const scanning = useMemo(() => new Set(scanningIds), [scanningIds]);
  const scanned = useMemo(() => new Set(scannedIds), [scannedIds]);

  const totalFound = useMemo(
    () => venues.reduce((sum, v) => sum + (hitsByVenue[v.name] ?? 0), 0),
    [venues, hitsByVenue],
  );

  /** Emitter x positions, evenly spread with an inset so edge grains stay inside the box. */
  const emitters = useMemo(() => {
    const n = Math.max(venues.length, 1);
    return venues.map((v, i) => ({
      venue: v,
      x: n === 1 ? W / 2 : 10 + (i * (W - 20)) / (n - 1),
    }));
  }, [venues]);

  /**
   * The seam profile: one polygon whose top edge is bumpy, so the deposit reads as settled material
   * rather than as a filled rectangle. Height is a pure function of people found.
   */
  const seamHeight = Math.min(totalFound * STRATUM, SEAM_MAX);
  const seamTop = FLOOR - seamHeight;
  const seamPath = useMemo(() => {
    if (seamHeight <= 0) return "";
    const steps = 22;
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const x = (i * W) / steps;
      // A shallow, seeded undulation. Damped near the ends so the pile meets the walls flat.
      const edge = Math.min(i, steps - i) / (steps / 2);
      const bump = (noise(i * 3 + 11) - 0.5) * 2.6 * Math.min(1, edge * 1.6);
      pts.push(`${x.toFixed(2)},${(seamTop + bump).toFixed(2)}`);
    }
    return `M 0,${FLOOR} L ${pts.join(" L ")} L ${W},${FLOOR} Z`;
  }, [seamHeight, seamTop]);

  /** One visible layer per person found, newest on top. Capped to what fits inside SEAM_MAX. */
  const strata = useMemo(() => {
    const layers = Math.min(totalFound, Math.floor(SEAM_MAX / STRATUM));
    return Array.from({ length: layers }, (_, i) => FLOOR - (i + 1) * STRATUM);
  }, [totalFound]);

  /**
   * Every grain, precomputed once per (venue set, size). A grain belongs to an emitter and knows
   * whether it is noise or a find; the animation only moves it.
   *
   * `found` grains exist in proportion to real hits at that venue, so the coral traffic a founder
   * sees falling from a community is that community's actual yield — not a constant trickle.
   */
  const grains = useMemo(() => {
    const budget = compact ? GRAINS_COMPACT : GRAINS_FULL;
    if (emitters.length === 0) return [];
    const out: {
      key: string;
      x: number;
      drift: number;
      size: number;
      dur: number;
      delay: number;
      found: boolean;
    }[] = [];

    for (let i = 0; i < budget; i++) {
      const e = emitters[i % emitters.length];
      const hits = hitsByVenue[e.venue.name] ?? 0;
      // Which grains are finds: spread across this emitter's share so coral never clumps.
      const nth = Math.floor(i / emitters.length);
      const found = hits > 0 && nth < Math.min(hits, 4);
      out.push({
        key: `${e.venue.id}:${i}`,
        x: e.x + (noise(i * 5 + 1) - 0.5) * 7,
        drift: (noise(i * 7 + 3) - 0.5) * 14,
        size: found ? 1.8 + noise(i * 11) * 0.9 : 0.8 + noise(i * 13) * 0.95,
        dur: FALL_MIN + noise(i * 17 + 2) * (FALL_MAX - FALL_MIN),
        delay: noise(i * 19 + 5) * 3.2,
        found,
      });
    }
    return out;
  }, [emitters, hitsByVenue, compact]);

  /**
   * The fall.
   *
   * One rAF loop writing two custom properties per grain — a fraction of the work the landing
   * hero's scroll wave already does per frame, so the cost is known-good. Phase is derived from
   * elapsed time and each grain's own duration, which keeps the field desynchronised without a
   * timer per grain.
   *
   * Not attached at all under reduced motion: a fall has no meaningful final frame to gate in CSS,
   * so the honest fix is to do no work rather than to animate and hide it.
   */
  // Motion here is a claim that something is happening, so it stops when it stops being true: a
  // finished search shows its seam and its sources at rest, never a fall that suggests it is still
  // looking. Reduced motion takes the same branch — the resting frame is the honest one either way.
  const animate = !reduced && working;

  useEffect(() => {
    if (!animate) return;
    const host = grainsRef.current;
    const wrap = wrapRef.current;
    if (!host || !wrap) return;

    let frame = 0;
    let onScreen = true;
    const started = performance.now();

    const paint = (now: number) => {
      const t = (now - started) / 1000;
      const nodes = host.children;
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i] as SVGGElement;
        const dur = Number(el.dataset.dur);
        const delay = Number(el.dataset.delay);
        const isFound = el.dataset.found === "1";
        // Progress through this grain's own fall, wrapped — one cycle per `dur` seconds.
        let p = ((t - delay) % dur) / dur;
        if (p < 0) p += 1;

        // A find stops at the seam surface; noise carries on to the floor and is gone before it.
        const landAt = isFound ? seamTop : FLOOR;
        const y = TOP + p * (landAt - TOP);
        el.style.setProperty("--gy", y.toFixed(2));
        el.style.setProperty("--gx", (Number(el.dataset.drift) * p).toFixed(2));
        // Noise thins out as it descends — washed away rather than deleted at a hard line.
        el.style.opacity = isFound ? String(Math.min(1, p * 4)) : (0.95 * (1 - p * p * p)).toFixed(3);
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

    // Below the fold this is invisible work. Same guard as the hero wave.
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
  }, [animate, grains, seamTop]);

  const grainId = compact ? "ky-sed-grain-c" : "ky-sed-grain";

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        width: "100%",
        // Fixed ratio, so the box never changes size as the seam grows. Nothing below can move.
        aspectRatio: `${W} / ${H}`,
        maxWidth: compact ? 240 : 420,
        margin: "0 auto",
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
        aria-hidden
      >
        <defs>
          {/* The grain.
              A DISPLACEMENT map, not a composite. The first attempt clipped desaturated turbulence
              to SourceAlpha, which replaces the artwork with grey noise instead of texturing it —
              it turned a coral seam grey. Displacing SourceGraphic roughens every edge while
              leaving the fill colour exactly as the token set it, which is what makes this work in
              both themes with no dark-mode rule. */}
          <filter id={grainId} x="-6%" y="-6%" width="112%" height="112%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.62" numOctaves={3} seed={7} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={1.1} xChannelSelector="R" yChannelSelector="G" />
          </filter>

          {/* Free-standing grit, laid over the seam so the deposit reads as material rather than as
              a filled shape. Carries no colour of its own — it darkens what is beneath it. */}
          <filter id={`${grainId}-grit`} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves={4} seed={19} result="n" />
            <feColorMatrix
              in="n"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 -0.35"
            />
          </filter>

          {/* Depth in the pile: brightest at the surface, oldest and most compacted at the bottom. */}
          <linearGradient id={`${grainId}-seam`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ember)" />
            <stop offset="55%" stopColor="var(--ember)" />
            <stop offset="100%" stopColor="var(--ember-dark)" />
          </linearGradient>

          {/* Clips the grit to the seam's own silhouette. */}
          <clipPath id={`${grainId}-clip`}>
            <path d={seamPath || "M 0,0 Z"} />
          </clipPath>
        </defs>

        {/* The column walls. Quiet — they frame the fall without competing with it. */}
        <line x1={0.4} y1={TOP - 4} x2={0.4} y2={FLOOR} stroke="var(--border)" strokeWidth={0.5} />
        <line x1={W - 0.4} y1={TOP - 4} x2={W - 0.4} y2={FLOOR} stroke="var(--border)" strokeWidth={0.5} />
        <line x1={0} y1={FLOOR} x2={W} y2={FLOOR} stroke="var(--border-strong)" strokeWidth={0.7} />

        {/* Emitters. A source that is being searched right now is lit; one that finished is dim but
            still present, because a community that returned nothing is information too. */}
        {emitters.map(({ venue, x }) => {
          const isScanning = scanning.has(venue.id);
          const isDone = scanned.has(venue.id);
          const hits = hitsByVenue[venue.name] ?? 0;
          return (
            <g key={venue.id}>
              <line
                x1={x}
                y1={TOP - 5}
                x2={x}
                y2={TOP}
                stroke={hits > 0 ? "var(--ember)" : isScanning ? "var(--ember)" : "var(--border-strong)"}
                strokeWidth={hits > 0 ? 1.5 : 1}
                strokeOpacity={isScanning ? 1 : isDone ? 0.5 : 0.28}
                strokeLinecap="round"
                style={{ transition: "stroke .35s var(--ease), stroke-opacity .35s var(--ease)" }}
              />
              {isScanning && !reduced && (
                <circle cx={x} cy={TOP} r={1.6} fill="var(--ember)" opacity={0.5}
                  style={{ animation: "kyPulse 1.4s ease-in-out infinite", transformOrigin: `${x}px ${TOP}px` }} />
              )}
            </g>
          );
        })}

        {/* The fall. Each grain is a <g> whose transform reads two custom properties the loop
            writes — transform only, so none of this can move anything around it. */}
        <g ref={grainsRef} filter={`url(#${grainId})`}>
          {grains.map((g) => (
            <g
              key={g.key}
              data-dur={g.dur}
              data-delay={g.delay}
              data-drift={g.drift}
              data-found={g.found ? "1" : "0"}
              style={{
                transform: "translate(calc(var(--gx, 0) * 1px), calc(var(--gy, 0) * 1px))",
                // The resting frame: grains sit at the top, invisible, until the loop moves them.
                // This is also exactly what reduced motion renders, which is why it is empty rather
                // than a scatter that would imply a search in progress.
                opacity: animate ? undefined : 0,
              }}
            >
              <circle
                cx={g.x}
                cy={0}
                r={g.size}
                fill={g.found ? "var(--ember)" : "var(--border-strong)"}
              />
            </g>
          ))}
        </g>

        {/* The seam. Height is people found, and each visible layer is one person. */}
        {seamHeight > 0 && (
          <g>
            <path d={seamPath} fill={`url(#${grainId}-seam)`} filter={`url(#${grainId})`} />
            {/* Grit over the deposit, clipped to its own shape. */}
            <g clipPath={`url(#${grainId}-clip)`}>
              <rect x={0} y={seamTop - 4} width={W} height={seamHeight + 6} filter={`url(#${grainId}-grit)`} opacity={0.5} />
            </g>
            {strata.map((y, i) => (
              <line
                key={y}
                x1={1.5}
                y1={y}
                x2={W - 1.5}
                y2={y}
                stroke="var(--on-ember)"
                strokeWidth={0.4}
                // Deeper layers are more compacted, so their edges read fainter.
                strokeOpacity={0.34 - 0.2 * (i / Math.max(strata.length, 1))}
              />
            ))}
            {/* The surface line last, so nothing above draws over it. */}
            <path d={seamPath} fill="none" stroke="var(--ember)" strokeWidth={0.9} />
          </g>
        )}
      </svg>

      {/* Text lives outside the SVG so it stays crisp and readable by anything that reads text —
          the drawing is decoration, the names and counts are the content. */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {!compact &&
          emitters.map(({ venue, x }) => {
            const hits = hitsByVenue[venue.name] ?? 0;
            const isScanning = scanning.has(venue.id);
            return (
              <span
                key={venue.id}
                style={{
                  position: "absolute",
                  left: `${x}%`,
                  top: `${(TOP / H) * 100}%`,
                  transform: "translate(-6px, -100%) rotate(-58deg)",
                  transformOrigin: "bottom left",
                  fontSize: 9.5,
                  fontWeight: hits > 0 ? 700 : 500,
                  color: hits > 0 ? "var(--ink)" : isScanning ? "var(--ember)" : "var(--muted)",
                  whiteSpace: "nowrap",
                  transition: "color .3s var(--ease)",
                }}
              >
                {venue.name}
                {hits > 0 && <span className="ky-tnum" style={{ marginLeft: 4, color: "var(--ember)" }}>{hits}</span>}
              </span>
            );
          })}

        {/* Under the seam, not on it. A niche name is as long as it is. */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: `${(FLOOR / H) * 100}%`,
            transform: "translate(-50%, 6px)",
            textAlign: "center",
            maxWidth: "88%",
            fontSize: compact ? 10 : 12,
            fontWeight: 700,
            lineHeight: 1.25,
            letterSpacing: "-.01em",
            color: "var(--ink)",
          }}
        >
          {centerLabel}
          {totalFound > 0 && (
            <span className="ky-tnum" style={{ display: "block", fontWeight: 500, color: "var(--muted)", fontSize: compact ? 9.5 : 11.5 }}>
              {totalFound} {totalFound === 1 ? "person" : "people"} settled
            </span>
          )}
          {!working && totalFound === 0 && (
            <span style={{ display: "block", fontWeight: 500, color: "var(--muted)", fontSize: compact ? 9.5 : 11.5 }}>
              nothing settled
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
