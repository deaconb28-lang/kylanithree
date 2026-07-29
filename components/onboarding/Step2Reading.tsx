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

const FALLBACK: SiteAnalysis = {
  whatYouSell: "Dock appointment scheduling that stops trucks stacking up at receiving.",
  problem: "Dockside removes the 6am queue at the receiving dock.",
  buyers: [
    {
      key: "ops",
      name: "Operations manager",
      tag: "Most likely",
      desc: "Owns the receiving schedule, gets called when a truck waits two hours. Buys tools that make a Monday quieter.",
      where: "Third-party logistics, 20–200 people",
    },
    {
      key: "warehouse",
      name: "Warehouse manager",
      tag: null,
      desc: "On the floor, feels the congestion directly, rarely holds the budget. Good for learning the language, slower to buy.",
      where: "Distribution centres, 50–500 people",
    },
    {
      key: "logistics",
      name: "Logistics director",
      tag: null,
      desc: "Your site talks to this person, but the pain is a level below them. Least confident here — worth testing against the other two.",
      where: "Enterprise shippers, 500+ people",
    },
  ],
};

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
  const resultRef = useRef<SiteAnalysis | null>(null);
  const fetchDoneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/analyze-site", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, note }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("analysis failed"))))
      .then((data: SiteAnalysis) => {
        if (!cancelled) resultRef.current = data;
      })
      .catch(() => {
        if (!cancelled) resultRef.current = FALLBACK;
      })
      .finally(() => {
        if (!cancelled) fetchDoneRef.current = true;
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (done >= ITEMS.length) {
      if (fetchDoneRef.current) {
        const t = setTimeout(() => onDone(resultRef.current ?? FALLBACK), 500);
        return () => clearTimeout(t);
      }
      const t = setInterval(() => {
        if (fetchDoneRef.current) {
          clearInterval(t);
          onDone(resultRef.current ?? FALLBACK);
        }
      }, 200);
      return () => clearInterval(t);
    }
    const t = setTimeout(() => setDone((d) => d + 1), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

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
