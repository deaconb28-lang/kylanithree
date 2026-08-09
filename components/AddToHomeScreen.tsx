"use client";

import { useCallback, useEffect, useState } from "react";

// The "add to home screen" nudge, which has to work two completely different ways.
//
// Android/Chrome fires `beforeinstallprompt`, which can be captured and replayed later against a
// button of our own — a real, one-tap install.
//
// iOS Safari has no equivalent. Apple has never shipped an install API, so the only honest option
// is to show the actual steps and let the person do it. Pretending otherwise would mean a button
// that does nothing, which is worse than a short instruction.
//
// Either way this stays quiet unless it can help: never on desktop, never once the app is already
// installed, and not again for a fortnight after being dismissed.

const DISMISS_KEY = "kylani_a2hs_dismissed_at";
const DISMISS_DAYS = 14;
// A first-visit prompt is an interruption; this waits until someone has actually looked around.
const SHOW_AFTER_MS = 25_000;

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __kylaniInstallPrompt?: InstallPromptEvent;
  }
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // Safari's own, non-standard flag — the only way to detect an installed iOS web app.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as a Mac, so touch support is what distinguishes it.
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return isIos() || /Android|Mobile/i.test(window.navigator.userAgent);
}

function recentlyDismissed(): boolean {
  try {
    const at = window.localStorage.getItem(DISMISS_KEY);
    if (!at) return false;
    return Date.now() - Number(at) < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

export default function AddToHomeScreen() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (!isMobile() || isStandalone() || recentlyDismissed()) return;

    // Chrome fires beforeinstallprompt once it has fetched the manifest and its own engagement
    // heuristics are satisfied, which in practice lands well after hydration — so listening here is
    // sufficient. `adopt` covers the case where something captured it earlier; it is a no-op
    // otherwise. A pre-hydration capture script was tried and rejected: a raw inline script in the
    // body breaks React hydration, which cost more than the race it was guarding against.
    const adopt = () => {
      if (!window.__kylaniInstallPrompt) return false;
      setDeferred(window.__kylaniInstallPrompt);
      setVisible(true);
      return true;
    };

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
      setVisible(true);
    };
    if (!adopt()) {
      window.addEventListener("beforeinstallprompt", onBeforeInstall);
      window.addEventListener("kylani:installready", adopt);
    }

    // iOS never fires that event, so the hint is time-triggered instead.
    const timer = isIos()
      ? setTimeout(() => {
          setIosHint(true);
          setVisible(true);
        }, SHOW_AFTER_MS)
      : undefined;

    const onInstalled = () => setVisible(false);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("kylani:installready", adopt);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Private browsing — it simply reappears next visit, which is acceptable.
    }
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    delete window.__kylaniInstallPrompt;
    setDeferred(null);
    setVisible(false);
  }, [deferred]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Add Kylani to your home screen"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        // Clears the iOS home indicator rather than sitting under it.
        bottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "var(--card)",
        border: "1px solid var(--border-strong)",
        borderRadius: 16,
        padding: "12px 14px",
        boxShadow: "var(--lift-3)",
        animation: "kyRise .32s ease both",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" width={38} height={38} style={{ borderRadius: 9, flexShrink: 0 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 14.5, fontWeight: 700 }}>Keep Kylani one tap away</span>
        <span style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45 }}>
          {iosHint ? (
            <>
              Tap <strong style={{ color: "var(--ink)" }}>Share</strong>, then{" "}
              <strong style={{ color: "var(--ink)" }}>Add to Home Screen</strong>.
            </>
          ) : (
            "Add it to your home screen and new leads are one tap away."
          )}
        </span>
      </div>
      {!iosHint && (
        <button onClick={install} className="ky-btn-ember" style={{ padding: "10px 16px", fontSize: 14, border: "none", whiteSpace: "nowrap", flexShrink: 0 }}>
          Add
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 20, lineHeight: 1, padding: "4px 6px", flexShrink: 0 }}
      >
        ×
      </button>
    </div>
  );
}
