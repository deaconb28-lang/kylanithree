"use client";

import { useSyncExternalStore } from "react";

// A media query is an external store, so it is read as one — no effect, no state, and no first
// paint that animates before being told not to.
//
// The server snapshot is `false` deliberately: the server cannot know the preference, and assuming
// motion is allowed means the markup it sends matches what a browser with no preference set will
// render. A browser that does prefer reduced motion corrects on hydration, before paint.

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
