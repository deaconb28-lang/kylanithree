"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUrlCycle } from "./useUrlCycle";
import KylaniLogo from "../icons/KylaniLogo";
import { markFlowStart, trackClient } from "../../lib/discover/clientTrack";
import { resolveFlow } from "../../lib/discover/flag";

// One column, centered, one thing to do.
//
// This used to be a two-up: copy on the left, a fake browser on the right replaying a recorded
// "Kylani at work" demo of a fictional logistics company. It came out because it was selling the
// old four-step flow — a flow that no longer exists — and because a scripted cursor clicking
// through someone else's product is a promise the real thing now keeps in eight seconds. The page
// no longer needs to show what happens next; you can just go and watch it happen.

export default function Hero() {
  const { url } = useUrlCycle();
  const [typedUrl, setTypedUrl] = useState("");
  const router = useRouter();

  const [shake, setShake] = useState(false);

  useEffect(() => {
    trackClient("landing_view", { flow: resolveFlow() });
  }, []);

  const goToOnboarding = () => {
    // The rotating placeholder is only ever a hint, never a real submission — the demo cycling
    // through dockside.app/fathom.dev/etc. used to get silently submitted as the URL if someone
    // clicked without typing (the placeholder looks enough like real content to skim past).
    const value = typedUrl.trim();
    if (!value) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    // The clock the whole comparison rests on starts here, at the submission, not when a route
    // eventually begins working.
    markFlowStart();
    router.push(`/onboarding?url=${encodeURIComponent(value)}`);
  };

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: "-160px -80px auto -80px",
          height: 820,
          opacity: "var(--wash)",
          pointerEvents: "none",
          background:
            "radial-gradient(46% 52% at 22% 10%, #FFE8D6 0%, rgba(255,232,214,0) 64%), radial-gradient(44% 50% at 78% 6%, #F6E4F0 0%, rgba(246,228,240,0) 66%), radial-gradient(62% 60% at 50% 58%, #E8EEFF 0%, rgba(232,238,255,0) 68%)",
        }}
      />

      <nav style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "26px 5vw", flexWrap: "wrap", gap: 16 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <KylaniLogo size={28} />
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 19, letterSpacing: "-.01em", color: "var(--ink)" }}>Kylani</span>
        </Link>
        <div className="ky-hide-mobile" style={{ display: "flex", alignItems: "center", gap: 34, fontSize: 15, color: "var(--muted)" }}>
          <a href="#how" className="ky-link">How it works</a>
          <a href="#findings" className="ky-link">Findings</a>
          <a href="#pricing" className="ky-link">Pricing</a>
          <a href="/signin" className="ky-link">Sign in</a>
          <a href="/onboarding" className="ky-btn-ember" style={{ padding: "10px 18px", fontSize: 15 }}>
            Paste your URL
          </a>
        </div>
        <a href="/onboarding" className="ky-btn-ember ky-hide-desktop" style={{ padding: "10px 18px", fontSize: 15 }}>
          Paste your URL
        </a>
      </nav>

      <div style={{ position: "relative", padding: "clamp(30px, 5vh, 72px) 5vw clamp(48px, 7vh, 84px)", display: "flex", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 26, maxWidth: 760, width: "100%" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 999, padding: "6px 14px 6px 7px" }}>
            <span style={{ width: 18, height: 18, borderRadius: 999, background: "var(--green)", display: "grid", placeItems: "center", color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Warm, human outreach — not more AI noise</span>
          </div>

          <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(42px, 7vw, 82px)", lineHeight: 0.95, letterSpacing: "-.04em", margin: 0, maxWidth: "13ch" }}>
            Find your first hundred buyers in ten minutes.
          </h1>

          <p style={{ margin: 0, fontSize: "clamp(17px, 2.1vw, 20px)", lineHeight: 1.55, color: "var(--muted-strong)", maxWidth: "46ch" }}>
            Paste your URL. Kylani finds the people who want what you built, writes to each one, and tells you who&apos;s actually
            buying.
          </p>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%", maxWidth: 640, marginTop: 4 }}>
            <div
              className="ky-field ky-field-stack"
              style={{
                display: "flex",
                gap: 10,
                width: "100%",
                maxWidth: 580,
                background: "var(--card)",
                border: shake ? "1px solid var(--ember)" : "1px solid var(--border-strong)",
                borderRadius: 15,
                padding: "8px 8px 8px 20px",
                alignItems: "center",
                textAlign: "left",
                boxShadow: "var(--lift-2)",
                animation: shake ? "kyShake .5s" : undefined,
              }}
            >
              <input
                aria-label="Your product URL"
                value={typedUrl}
                onChange={(e) => setTypedUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") goToOnboarding();
                }}
                placeholder={`e.g. ${url}`}
                style={{ fontSize: 17, color: "var(--ink)", flex: 1, minWidth: 0, overflow: "hidden", border: "none", outline: "none", background: "transparent", fontFamily: "inherit" }}
              />
              <button onClick={goToOnboarding} className="ky-btn-ember" style={{ padding: "13px 24px", fontSize: 16, whiteSpace: "nowrap" }}>
                Find my buyers free
              </button>
            </div>

            {shake && (
              <span role="alert" style={{ fontSize: 13.5, color: "var(--ember)", marginTop: -10 }}>
                Paste your own URL first — that&apos;s just an example.
              </span>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, flexWrap: "wrap", marginTop: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ display: "flex" }} aria-hidden>
                  {["#E8DDD0", "#DBD3E4", "#CFE0D8", "#E2D6CE"].map((c, i) => (
                    <span key={c} style={{ width: 28, height: 28, borderRadius: 999, background: c, border: "2px solid var(--card)", marginLeft: i === 0 ? 0 : -10 }} />
                  ))}
                </div>
                <span style={{ fontSize: 14.5, color: "var(--muted-strong)" }}>
                  <strong style={{ fontWeight: 600 }}>312 founders</strong> sent their first hundred with Kylani today
                </span>
              </div>
            </div>

            <span style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>
              First campaign free · no card · no list uploads · then <strong style={{ color: "var(--ink)", fontWeight: 600 }}>$89/month</strong>, cancel in one click.{" "}
              <a href="#pricing" style={{ fontWeight: 500, whiteSpace: "nowrap" }}>See plans</a>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
