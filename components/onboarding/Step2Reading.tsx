"use client";

import { useEffect, useRef, useState } from "react";
import OnboardingChrome from "./OnboardingChrome";
import ScanningWindow from "./ScanningWindow";
import type { SiteAnalysis } from "../../lib/types";
import type { ProductCategory } from "../../lib/productCategories";
import { useNotificationPermission } from "../../lib/useNotificationPermission";

// Paced by real elapsed time rather than a fixed script — a typical real analysis (site fetch +
// a handful of web searches at low effort) lands around this window. The checklist advances at
// roughly these real seconds and then holds on the last item — pulsing, not stalled-looking —
// until the actual fetch resolves, instead of racing through 4 fake steps in under 4 seconds and
// then sitting frozen on a "done" checklist for the next 15-20s of real work.
const ITEMS = [
  { text: "Reading the site — pages, pricing, and the changelog", atSecond: 0 },
  { text: "Naming the problem it removes", atSecond: 6 },
  { text: "Deciding which roles carry that problem", atSecond: 12 },
  { text: "Drafting buyer hypotheses for you to correct", atSecond: 17 },
];

export default function Step2Reading({
  url,
  note,
  category,
  onDone,
}: {
  url: string;
  note: string;
  category: ProductCategory;
  onDone: (analysis: SiteAnalysis) => void;
}) {
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [fetchDone, setFetchDone] = useState(false);
  const resultRef = useRef<SiteAnalysis | null>(null);
  const fetchDoneRef = useRef(false);
  const advancedRef = useRef(false);

  // Asked here — the first real wait in onboarding — rather than only on the longer Step5Search
  // wait, so permission is already resolved by the time the slower real lead search starts and
  // that screen doesn't need to interrupt again (it only re-asks if this was skipped or dismissed).
  const { permission: notifyPermission, request: requestNotifications } = useNotificationPermission();

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [attempt]);

  useEffect(() => {
    let cancelled = false;
    fetchDoneRef.current = false;
    resultRef.current = null;
    fetch("/api/analyze-site", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, note, category }),
    })
      .then(async (res) => {
        let data: { error?: string } | SiteAnalysis;
        try {
          data = await res.json();
        } catch {
          throw new Error(res.ok ? "PARSE_ERROR" : `HTTP_${res.status}`);
        }
        return { ok: res.ok, data };
      })
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) {
          setError((data as { error?: string }).error ?? "Couldn't analyze that site.");
          return;
        }
        resultRef.current = data as SiteAnalysis;
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error && /^(PARSE_ERROR|HTTP_)/.test(err.message)
            ? "That took longer than expected and timed out. Try again — most reads finish in under a minute."
            : "Couldn't reach the server — check your connection and try again.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          fetchDoneRef.current = true;
          setFetchDone(true);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  useEffect(() => {
    if (error || advancedRef.current) return;
    if (fetchDoneRef.current && resultRef.current) {
      advancedRef.current = true;
      const result = resultRef.current;
      const t = setTimeout(() => onDone(result), 400);
      return () => clearTimeout(t);
    }
    const t = setInterval(() => {
      if (fetchDoneRef.current && resultRef.current && !advancedRef.current) {
        advancedRef.current = true;
        clearInterval(t);
        onDone(resultRef.current);
      }
    }, 200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, error]);

  const retry = () => {
    setError(null);
    setFetchDone(false);
    advancedRef.current = false;
    setAttempt((a) => a + 1);
  };

  // The item whose atSecond threshold we've most recently crossed is "current" (pulsing); once
  // the real fetch resolves, everything snaps to complete regardless of elapsed time — reached
  // the last item's time and the fetch is still running holds there rather than racing ahead of
  // what's actually true.
  let currentIndex = 0;
  for (let i = 0; i < ITEMS.length; i++) {
    if (seconds >= ITEMS[i].atSecond) currentIndex = i;
  }
  const done = fetchDone ? ITEMS.length : currentIndex;

  if (error) {
    return (
      <OnboardingChrome>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, maxWidth: 560, textAlign: "center" }}>
          <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(24px,3.4vw,36px)", lineHeight: 1.1, letterSpacing: "-.03em", margin: 0 }}>
            Couldn&apos;t read {url}.
          </h1>
          <p style={{ margin: 0, fontSize: 15.5, color: "var(--muted-strong)", lineHeight: 1.6 }}>{error}</p>
          <button className="ky-btn-ember" onClick={retry} style={{ padding: "13px 24px", fontSize: 15.5, border: "none" }}>
            Try again
          </button>
        </div>
      </OnboardingChrome>
    );
  }

  return (
    <OnboardingChrome>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28, maxWidth: 680, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 15, color: "var(--muted)" }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: "var(--ember)", animation: "kyPulse 1.8s ease-in-out infinite" }} />
          Reading {url}
        </div>
        <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(26px,4vw,44px)", lineHeight: 1.06, letterSpacing: "-.03em", margin: 0 }}>
          Working out what you sell and who has the problem.
        </h1>

        <ScanningWindow label={`${url} · ${seconds}s`} />

        <div style={{ width: "100%", maxWidth: 620, display: "flex", flexDirection: "column", gap: 2, background: "rgba(253,252,250,.86)", border: "1px solid var(--border)", borderRadius: 14, padding: 8, boxShadow: "0 1px 2px rgba(20,18,15,.05), 0 18px 40px -22px rgba(20,18,15,.18)" }}>
          {ITEMS.map((item, i) => {
            const complete = i < done;
            const current = i === done;
            return (
              <div key={item.text} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 10, background: current ? "#F7F3EE" : "transparent", opacity: i > done ? 0.45 : 1 }}>
                {complete ? (
                  <span style={{ width: 18, height: 18, borderRadius: 999, background: "var(--green)", display: "grid", placeItems: "center", color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>✓</span>
                ) : current ? (
                  <span style={{ width: 18, height: 18, borderRadius: 999, border: "2px solid var(--ember)", boxSizing: "border-box", animation: "kyPulse 1.4s ease-in-out infinite", flexShrink: 0 }} />
                ) : (
                  <span style={{ width: 18, height: 18, borderRadius: 999, border: "2px solid var(--border-strong)", boxSizing: "border-box", flexShrink: 0 }} />
                )}
                <span style={{ fontSize: 15.5, flex: 1, textAlign: "left", fontWeight: current ? 500 : 400 }}>{item.text}</span>
              </div>
            );
          })}
        </div>
        <span style={{ fontSize: 14, color: "var(--muted)", maxWidth: 480, lineHeight: 1.55 }}>
          I&apos;ll show you two to four guesses rather than one. The wrong ones are how we find out which one is right.
        </span>
        {notifyPermission === "default" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
              justifyContent: "center",
              border: "1px solid #F3D9BE",
              background: "#FFF8F1",
              borderRadius: 14,
              padding: "12px 18px",
              maxWidth: 520,
            }}
          >
            <button
              onClick={requestNotifications}
              className="ky-btn-ember"
              style={{ padding: "10px 18px", fontSize: 14, border: "none", whiteSpace: "nowrap", animation: "kyGlow 2.2s ease-in-out infinite" }}
            >
              🔔 Notify me when it&apos;s ready
            </button>
            <span style={{ fontSize: 13, color: "var(--muted-strong)", lineHeight: 1.4 }}>
              The real lead search after this takes longer — turn this on now so you don&apos;t have to babysit either screen.
            </span>
          </div>
        )}
        {notifyPermission === "granted" && (
          <span style={{ fontSize: 13.5, color: "var(--green)", fontWeight: 600 }}>🔔 Notifications on — I&apos;ll ping you when things are ready.</span>
        )}
      </div>
    </OnboardingChrome>
  );
}
