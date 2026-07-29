"use client";

import Link from "next/link";
import OnboardingChrome from "./OnboardingChrome";

const CONFETTI = Array.from({ length: 26 }).map((_, i) => ({
  left: ((i * 41 + 5) % 100) + "%",
  color: ["#E4572E", "#2F7A56", "#DBD3E4", "#CFE0D8", "#14120F"][i % 5],
  shape: i % 3 === 0 ? "999px" : "2px",
  delay: ((i * 63) % 700) + "ms",
}));

export default function Step6Complete() {
  return (
    <OnboardingChrome>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        {CONFETTI.map((p, i) => (
          <div
            key={i}
            style={{ position: "absolute", left: p.left, top: -14, width: 8, height: 8, background: p.color, borderRadius: p.shape, animation: "kyConfetti 1.3s ease-in forwards", animationDelay: p.delay }}
          />
        ))}
      </div>
      <div className="ky-fade-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28, maxWidth: 680, textAlign: "center" }}>
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            background: "var(--green)",
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontSize: 20,
            fontWeight: 700,
            animation: "kyPulse .6s ease-out",
          }}
        >
          ✓
        </span>
        <span style={{ fontSize: 15, color: "var(--muted)" }}>First pass done</span>
        <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(30px,4.5vw,50px)", lineHeight: 1.02, letterSpacing: "-.035em", margin: 0 }}>
          Your first buyers, each with a reason attached.
        </h1>
        <p style={{ margin: 0, fontSize: 17.5, color: "var(--muted-strong)", lineHeight: 1.6 }}>
          Sign in and your list will be waiting — real leads and communities drafted from what you just told me, not a demo.
          More get added the longer I keep looking.
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
          <Link href="/app/queue" className="ky-btn-ember" style={{ padding: "16px 30px", fontSize: 17, boxShadow: "0 1px 2px rgba(20,18,15,.12)" }}>
            Read the first drafts
          </Link>
          <span style={{ fontSize: 14.5, color: "var(--muted)" }}>Nothing sends until you approve each one.</span>
        </div>
        <span style={{ fontSize: 13.5, color: "var(--muted)", maxWidth: 620, lineHeight: 1.5 }}>
          <strong style={{ color: "var(--ink)", fontWeight: 600 }}>Next 24 hours:</strong> I space approved drafts under your
          daily cap, watch for replies, and surface anything time-sensitive on Today.
        </span>
      </div>
    </OnboardingChrome>
  );
}
