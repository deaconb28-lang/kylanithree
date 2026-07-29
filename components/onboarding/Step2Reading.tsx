"use client";

import { useEffect, useRef, useState } from "react";
import OnboardingChrome from "./OnboardingChrome";
import type { SiteAnalysis } from "../../lib/types";

const ITEMS = [
  { text: "Read the site — pages, pricing, and the changelog", secs: "11s" },
  { text: "Named the problem it removes", secs: "6s" },
  { text: "Deciding which roles carry that problem", secs: null },
  { text: "Drafting buyer hypotheses for you to correct", secs: null },
];

export default function Step2Reading({
  url,
  note,
  onDone,
}: {
  url: string;
  note: string;
  onDone: (analysis: SiteAnalysis) => void;
}) {
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const resultRef = useRef<SiteAnalysis | null>(null);
  const fetchDoneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchDoneRef.current = false;
    resultRef.current = null;
    fetch("/api/analyze-site", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, note }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) {
          setError(data.error ?? "Couldn't analyze that site.");
          return;
        }
        resultRef.current = data as SiteAnalysis;
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't reach the server.");
      })
      .finally(() => {
        if (!cancelled) fetchDoneRef.current = true;
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  useEffect(() => {
    if (error) return;
    if (done >= ITEMS.length) {
      if (fetchDoneRef.current) {
        if (!resultRef.current) return; // an error just landed on this same tick — let the error branch render
        const result = resultRef.current;
        const t = setTimeout(() => onDone(result), 500);
        return () => clearTimeout(t);
      }
      const t = setInterval(() => {
        if (fetchDoneRef.current && resultRef.current) {
          clearInterval(t);
          onDone(resultRef.current);
        }
      }, 200);
      return () => clearInterval(t);
    }
    const t = setTimeout(() => setDone((d) => d + 1), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, error]);

  const retry = () => {
    setError(null);
    setDone(0);
    setAttempt((a) => a + 1);
  };

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
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 34, maxWidth: 680, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 15, color: "var(--muted)" }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: "var(--ember)", animation: "kyPulse 1.8s ease-in-out infinite" }} />
          Reading {url}
        </div>
        <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(26px,4vw,44px)", lineHeight: 1.06, letterSpacing: "-.03em", margin: 0 }}>
          Working out what you sell and who has the problem.
        </h1>
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
                {complete && item.secs && <span style={{ fontSize: 13, color: "var(--muted)" }}>{item.secs}</span>}
              </div>
            );
          })}
        </div>
        <span style={{ fontSize: 14, color: "var(--muted)", maxWidth: 480, lineHeight: 1.55 }}>
          I&apos;ll show you two to four guesses rather than one. The wrong ones are how we find out which one is right.
        </span>
      </div>
    </OnboardingChrome>
  );
}
