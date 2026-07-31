"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useHeroDemo } from "./useHeroDemo";
import { useUrlCycle } from "./useUrlCycle";
import KylaniLogo from "../icons/KylaniLogo";

const STAGE_LABELS = ["Reading five pages, pricing, changelog", "", "", ""];

export default function Hero() {
  const demo = useHeroDemo();
  const { url } = useUrlCycle();
  const [typedUrl, setTypedUrl] = useState("");
  const router = useRouter();

  const [shake, setShake] = useState(false);

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
    router.push(`/onboarding?url=${encodeURIComponent(value)}`);
  };

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: "-120px -80px auto -80px",
          height: 900,
          opacity: "var(--wash)",
          background:
            "radial-gradient(58% 62% at 12% 8%, #FFE8D6 0%, rgba(255,232,214,0) 62%), radial-gradient(52% 58% at 86% 4%, #F6E4F0 0%, rgba(246,228,240,0) 64%), radial-gradient(64% 70% at 62% 46%, #E8EEFF 0%, rgba(232,238,255,0) 66%)",
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
          <a href="/onboarding" className="ky-btn-ember" style={{ padding: "10px 18px", fontSize: 15, boxShadow: "0 1px 2px rgba(20,18,15,.12)" }}>
            Paste your URL
          </a>
        </div>
        <a href="/onboarding" className="ky-btn-ember ky-hide-desktop" style={{ padding: "10px 18px", fontSize: 15 }}>
          Paste your URL
        </a>
      </nav>

      <div style={{ position: "relative", padding: "40px 5vw 90px", display: "grid", gridTemplateColumns: "1fr minmax(320px, 620px)", gap: 56, alignItems: "start" }} className="hero-grid">
        <style>{`@media (max-width: 980px) { .hero-grid { grid-template-columns: 1fr !important; } }`}</style>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 999, padding: "6px 14px 6px 7px", width: "fit-content" }}>
            <span style={{ width: 18, height: 18, borderRadius: 999, background: "var(--green)", display: "grid", placeItems: "center", color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Warm, human outreach — not more AI noise</span>
          </div>
          <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(38px, 5.5vw, 76px)", lineHeight: 0.96, letterSpacing: "-.035em", margin: 0, maxWidth: "15ch" }}>
            Find your first hundred buyers in ten minutes.
          </h1>
          <p style={{ margin: 0, fontSize: 20, lineHeight: 1.55, color: "var(--muted-strong)", maxWidth: "42ch" }}>
            Paste your URL. Kylani finds the people who want what you built, writes to each one, and tells you who&apos;s actually
            buying.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 560 }}>
            <div
              style={{
                display: "flex",
                gap: 10,
                background: "var(--card)",
                border: shake ? "1px solid var(--ember)" : "1px solid var(--border)",
                borderRadius: 14,
                padding: "8px 8px 8px 20px",
                alignItems: "center",
                boxShadow: "0 1px 2px rgba(20,18,15,.05), 0 12px 28px -14px rgba(20,18,15,.16)",
                animation: shake ? "kyShake .5s" : undefined,
              }}
            >
              <input
                value={typedUrl}
                onChange={(e) => setTypedUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") goToOnboarding();
                }}
                placeholder={`e.g. ${url}`}
                style={{ fontSize: 17, color: "var(--ink)", flex: 1, overflow: "hidden", border: "none", outline: "none", background: "transparent", fontFamily: "inherit" }}
              />
              <button onClick={goToOnboarding} className="ky-btn-ember" style={{ padding: "13px 24px", fontSize: 16, border: "none", whiteSpace: "nowrap" }}>
                Find my buyers free
              </button>
            </div>
            {shake && (
              <span style={{ fontSize: 13.5, color: "var(--ember)", marginTop: -10 }}>Paste your own URL first — that&apos;s just an example.</span>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ display: "flex" }}>
                  {["#E8DDD0", "#DBD3E4", "#CFE0D8", "#E2D6CE"].map((c, i) => (
                    <span key={c} style={{ width: 28, height: 28, borderRadius: 999, background: c, border: "2px solid var(--card)", marginLeft: i === 0 ? 0 : -10 }} />
                  ))}
                </div>
                <span style={{ fontSize: 14.5, color: "var(--muted-strong)" }}>
                  <strong style={{ fontWeight: 600 }}>312 founders</strong> sent their first hundred with Kylani today
                </span>
              </div>
              <span style={{ fontSize: 14.5, color: "var(--muted-strong)", display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--green)" }} />
                <strong style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>Live tracked below</strong>
              </span>
            </div>
            <span style={{ fontSize: 14, color: "var(--muted)" }}>
              First campaign free · no card · no list uploads · then <strong style={{ color: "var(--ink)", fontWeight: 600 }}>$89/month</strong>, cancel in one click.{" "}
              <a href="#pricing" style={{ fontWeight: 500 }}>See plans</a>
            </span>
          </div>
        </div>

        <div
          style={{
            position: "relative",
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            minHeight: 520,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 2px 4px rgba(20,18,15,.06), 0 40px 80px -30px rgba(20,18,15,.32)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "var(--card-alt)", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: "var(--border-strong)" }} />
              <span style={{ width: 10, height: 10, borderRadius: 999, background: "var(--border-strong)" }} />
              <span style={{ width: 10, height: 10, borderRadius: 999, background: "var(--border-strong)" }} />
            </div>
            <div style={{ flex: 1, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 7, padding: "5px 12px", fontSize: 12.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "var(--green)" }}>●</span> home.kylani.app/dockside
            </div>
            <span className="ky-hide-mobile" style={{ fontSize: 12, color: "var(--muted)" }}>recorded, not staged</span>
          </div>

          <div style={{ position: "relative", flex: 1, padding: "24px 26px 22px", display: "flex", flexDirection: "column", gap: 18, minHeight: 380 }}>
            <div
              style={{
                position: "absolute",
                left: demo.curX,
                top: demo.curY,
                zIndex: 5,
                transition: "left 1.1s cubic-bezier(.4,0,.2,1), top 1.1s cubic-bezier(.4,0,.2,1)",
                pointerEvents: "none",
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
              }}
            >
              <span style={{ width: 30, height: 30, borderRadius: 999, background: "rgba(228,87,46,.18)", position: "absolute", left: -9, top: -6, animation: "kyPulse 1.5s ease-in-out infinite" }} />
              {demo.cursorClicking && (
                <span style={{ width: 26, height: 26, borderRadius: 999, border: "2px solid var(--ember)", position: "absolute", left: -7, top: -4, animation: "kyClickRing .5s ease-out" }} />
              )}
              <svg width="19" height="26" viewBox="0 0 19 26" style={{ filter: "drop-shadow(0 2px 4px rgba(20,18,15,.35))", position: "relative", transform: demo.cursorScale, transition: "transform .15s ease" }}>
                <path d="M2 1.5 L2 21 L7 16.5 L10.5 24.5 L13.5 23 L10 15.5 L16.5 15.5 Z" fill="#14120F" stroke="#FDFCFA" strokeWidth="1.4" />
              </svg>
              <span style={{ background: "var(--ink)", color: "var(--card)", fontSize: 11.5, fontWeight: 500, padding: "4px 9px", borderRadius: 6, whiteSpace: "nowrap", marginTop: 14 }}>
                {demo.curLabel}
              </span>
            </div>

            {demo.confetti && (
              <div style={{ position: "absolute", inset: 0, zIndex: 6, overflow: "hidden", pointerEvents: "none" }}>
                {demo.confettiParticles.map((p, i) => (
                  <div
                    key={i}
                    style={{ position: "absolute", left: p.left, top: -14, width: 8, height: 8, background: p.color, borderRadius: p.shape, animation: "kyConfetti 1.1s ease-in forwards", animationDelay: p.delay }}
                  />
                ))}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 24 }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--ember)", animation: "kyPulse 1.8s ease-in-out infinite" }} />
              <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 15, flex: 1 }}>Kylani at work · dockside.app</span>
              <span onClick={demo.togglePlay} className="ky-link" style={{ fontSize: 13, cursor: "pointer" }}>
                {demo.playLabel}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: -8 }}>
              {demo.dots.map((c, i) => (
                <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: c }} />
              ))}
            </div>

            {demo.stage === 1 && (
              <div className="ky-fade-in" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14.5, color: "var(--muted)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--ember)", animation: "kyPulse 1.2s ease-in-out infinite" }} />
                  {STAGE_LABELS[0]}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {[92, 78, 86, 54, 70].map((w, i) => (
                    <div key={i} style={{ height: 12, borderRadius: 6, background: i === 4 ? "#F7F3EE" : "var(--card-alt)", width: `${w}%` }} />
                  ))}
                </div>
                <span style={{ fontSize: 13.5, color: "var(--muted)" }}>Naming the problem it removes…</span>
              </div>
            )}

            {demo.stage === 2 && (
              <div className="ky-fade-in" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 19, lineHeight: 1.25, letterSpacing: "-.02em" }}>Here&apos;s who I think buys this.</span>
                <div style={{ border: "1.5px solid var(--ink)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 4, boxShadow: demo.clickTarget === "profileOps" ? "0 0 0 4px rgba(20,18,15,.14)" : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 15.5, fontWeight: 600 }}>Operations manager</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ember)", background: "var(--ember-tint)", padding: "3px 8px", borderRadius: 999 }}>Most likely</span>
                  </div>
                  <span style={{ fontSize: 13.5, color: "var(--muted)" }}>3PLs, 20–200 people · owns the receiving schedule</span>
                </div>
                <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 4, boxShadow: demo.clickTarget === "profileWarehouse" ? "0 0 0 4px rgba(20,18,15,.14)" : "none" }}>
                  <span style={{ fontSize: 15.5, fontWeight: 600 }}>Warehouse manager</span>
                  <span style={{ fontSize: 13.5, color: "var(--muted)" }}>Feels it daily, rarely holds the budget</span>
                </div>
                <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 4, boxShadow: demo.clickTarget === "profileLogistics" ? "0 0 0 4px rgba(20,18,15,.14)" : "none" }}>
                  <span style={{ fontSize: 15.5, fontWeight: 600 }}>Logistics director</span>
                  <span style={{ fontSize: 13.5, color: "var(--muted)" }}>Least confident — worth testing</span>
                </div>
                <span style={{ fontSize: 13.5, color: "var(--muted)" }}>Correct me, and I search for what you keep.</span>
              </div>
            )}

            {demo.stage === 3 && (
              <div className="ky-fade-in" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: 44, letterSpacing: "-.04em", fontVariantNumeric: "tabular-nums" }}>{demo.demoFound}</span>
                  <span style={{ fontSize: 14, color: "var(--muted)" }}>buyers found so far</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {demo.demoFeed.map((row) => (
                    <div key={row.text} className="ky-fade-in" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                      <span style={{ width: 22, height: 22, borderRadius: 6, background: "var(--card-alt)", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, color: "var(--muted)" }}>
                        {row.tag}
                      </span>
                      <span style={{ fontSize: 13.5, flex: 1 }}>{row.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {demo.stage === 4 && (
              <div className="ky-fade-in" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 19, letterSpacing: "-.02em" }}>104 buyers. Here&apos;s the first draft.</span>
                <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--card-alt)", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>To: eli@northlinefreight.com · ops manager, 74 people</span>
                  <span style={{ fontSize: 14.5, lineHeight: 1.6 }}>
                    Eli — saw Northline is hiring a receiving clerk and &ldquo;managing carrier arrival windows&rdquo; is the first line of the
                    ad. That specific part is what I build…
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div
                    style={{
                      flex: 1,
                      background: "var(--ember)",
                      color: "#fff",
                      borderRadius: 10,
                      padding: 12,
                      textAlign: "center",
                      fontSize: 14.5,
                      fontWeight: 600,
                      boxShadow: demo.clickTarget === "approve" ? "0 0 0 4px rgba(228,87,46,.35)" : "none",
                      transform: demo.clickTarget === "approve" ? "scale(.97)" : "scale(1)",
                      transition: "box-shadow .15s ease, transform .15s ease",
                    }}
                  >
                    Approve · send today
                  </div>
                  <div onClick={demo.runDemo} className="ky-btn-outline" style={{ padding: "11px 14px", fontSize: 14.5, cursor: "pointer" }}>
                    Replay
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
