"use client";

import { useEffect, useRef, useState } from "react";

// The crowd, and the nine people in it who are buying.
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
