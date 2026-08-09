"use client";

import { useCallback, useSyncExternalStore } from "react";

type Permission = NotificationPermission | "unsupported";

// useSyncExternalStore (not useState+useEffect) so the very first client render already matches
// the server's snapshot exactly — no hydration mismatch from reading a browser-only API during
// render — and so updating the value after the user responds to the permission prompt doesn't
// require a setState call inside an effect body (flagged by this repo's react-hooks/set-state-in-
// effect lint rule); notifying `listeners` just tells React to re-read the snapshot.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Permission {
  return "Notification" in window ? Notification.permission : "unsupported";
}

function getServerSnapshot(): Permission {
  return "unsupported";
}

export function useNotificationPermission() {
  const permission = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const request = useCallback(() => {
    if (!("Notification" in window)) return;
    Notification.requestPermission().then(() => {
      listeners.forEach((l) => l());
    });
  }, []);

  return { permission, request };
}
