"use client";

import { useEffect, useRef, useState } from "react";

// The crowd, and the few in it who are buying.
//
// This is the one animated thing on the page and it carries the whole claim: thousands of people
// are talking, most of it is noise, and Kylani's entire job is picking out the handful that isn't.
// A number could say that. A field of marks lets you see it happen.
//
// Two constraints shape every decision here. Heights are derived from the index, never random —
// `Math.random()` would produce different markup on the server and the client, which React reports
// as a hydration mismatch, and would reshuffle the whole field on every resize. And the entrance
// animates transform and colour only, so a field appearing under the headline cannot move the URL
// input by a pixel.

const FOUND_COUNT = 9;
const BAR_PITCH = 9; // one bar per ~9px of container
const MIN_BARS = 32;
const MAX_BARS = 110;
const STAGGER_MS = 80;

// --- the scroll wave -----------------------------------------------------------------------------
// Scrolling runs a travelling sine through the field, the way a waveform moves across a scrubbing
// audio display. Scroll POSITION is the phase, not scroll velocity: position is absolute, so the
// field looks identical every time you return to a given offset, and reversing the scroll reverses
// the wave instead of restarting it.
/** Radians of phase per pixel scrolled. Roughly one full cycle per 520px of travel. */
const WAVE_PHASE_PER_PX = 0.012;
/** Radians between neighbouring bars — how many visible crests span the field at once. */
const WAVE_PHASE_PER_BAR = 0.42;
/** Peak deviation from resting scale. 0.42 keeps troughs visible rather than collapsing them. */
const WAVE_AMPLITUDE = 0.42;

/**
 * Deterministic pseudo-noise. Same index, same value, forever — on the server, on the client, and
 * across every resize. That last part is what keeps the field from reshuffling as the window moves.
 */
function noise(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Which bars are the buyers.
 *
 * Spread across the full width by construction — one per even slice, nudged inside it — because a
 * random draw clusters, and two coral bars side by side read as one thick mark rather than two
 * people. The nudge is index-based so a bar keeps its slot when the count changes on resize.
 */
function foundIndices(total: number): Set<number> {
  const found = new Set<number>();
  const slice = total / FOUND_COUNT;
  for (let n = 0; n < FOUND_COUNT; n++) {
    const within = 0.25 + noise(n * 7 + 3) * 0.5;
    found.add(Math.min(total - 1, Math.floor(slice * (n + within))));
  }
  return found;
}

export default function FoundField({ caption }: { caption: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(72);
  // Whether the entrance has run. The motion preference is deliberately NOT read here — the
  // stylesheet decides whether the pre-entrance state applies at all, so reduced motion needs no
  // JavaScript and is correct on the very first paint rather than after hydration.
  const [entered, setEntered] = useState(false);

  // Bar count follows the container, not the viewport — the field sits inside a max-width column,
  // so a viewport query would be measuring the wrong box.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = el.clientWidth;
        if (width > 0) setCount(Math.max(MIN_BARS, Math.min(MAX_BARS, Math.round(width / BAR_PITCH))));
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  // One frame at rest before growing, so the transition has a start state to move from.
  useEffect(() => {
    const timer = setTimeout(() => setEntered(true), 90);
    return () => clearTimeout(timer);
  }, []);

  // The scroll wave.
  //
  // Reduced motion is read here rather than in CSS, which is the opposite of the entrance above —
  // and deliberately so. The entrance has a meaningful final state that CSS can render on the first
  // paint; a scroll animation's "final state" is just the field at rest, which is what --ky-wave
  // already defaults to. So there is nothing for the stylesheet to gate, and the honest fix is to
  // never attach the listener at all: no work per frame for someone who asked for no motion.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    let frame = 0;
    let onScreen = true;

    const paint = () => {
      frame = 0;
      const phase = window.scrollY * WAVE_PHASE_PER_PX;
      const bars = el.children;
      for (let i = 0; i < bars.length; i++) {
        const scale = 1 + WAVE_AMPLITUDE * Math.sin(i * WAVE_PHASE_PER_BAR + phase);
        (bars[i] as HTMLElement).style.setProperty("--ky-wave", scale.toFixed(3));
      }
    };

    const onScroll = () => {
      // Hand the transform transition over to the wave the first time it actually runs, rather than
      // on a timer racing the entrance — whichever finishes first, the handover happens once.
      el.classList.add("ky-field-live");
      if (!onScreen || frame) return;
      frame = requestAnimationFrame(paint);
    };

    // Below the fold this is pure waste: the work is invisible and still costs a style recalc on
    // every frame of a long scroll down the page.
    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        if (onScreen) onScroll();
      },
      { rootMargin: "120px" },
    );
    observer.observe(el);

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
    // Re-attached when the bar count changes, so the loop always walks the current children.
  }, [count]);

  const found = foundIndices(count);
  let foundSoFar = 0;

  return (
    <div style={{ width: "100%" }}>
      <div
        ref={ref}
        aria-hidden="true"
        className="ky-field-bars"
        style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 3, width: "100%" }}
      >
        {Array.from({ length: count }, (_, i) => {
          const isFound = found.has(i);
          // Full height is what the bar occupies in layout from the very first paint; the entrance
          // only scales it. Nothing here can reflow once mounted.
          const height = isFound ? 52 + Math.round(noise(i) * 18) : 14 + Math.round(noise(i) * 26);
          const delay = isFound ? foundSoFar++ * STAGGER_MS : 0;
          const idleFraction = (14 + Math.round(noise(i) * 26)) / height;

          return (
            <span
              key={i}
              className={`ky-bar ${isFound ? (entered ? "ky-bar-found" : "ky-bar-found ky-bar-waiting") : ""}`}
              style={
                {
                  height: `calc(${height} * var(--ky-field-unit))`,
                  // The start of the entrance is a custom property rather than a transform, so the
                  // stylesheet gets to decide whether it applies. Reduced motion never reads it.
                  "--ky-idle-fraction": idleFraction.toFixed(3),
                  // Stagger belongs to the entrance and nothing else. Left in place, a resize —
                  // which changes the bar count and therefore which indices are buyers — would
                  // replay the whole left-to-right cascade every time the window moved.
                  transitionDelay: entered ? "0ms" : `${delay}ms`,
                } as React.CSSProperties
              }
            />
          );
        })}
      </div>
      <p className="ky-field-caption" style={{ margin: "10px 0 0", textAlign: "center", fontSize: 13, color: "var(--faint)", lineHeight: 1.5 }}>
        {caption}
      </p>
    </div>
  );
}
