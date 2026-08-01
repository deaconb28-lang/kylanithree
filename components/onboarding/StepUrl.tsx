"use client";

import { useState } from "react";
import OnboardingChrome from "./OnboardingChrome";

// One field. This screen used to also ask the founder to pick a product category and offer a notes
// box that promised file attachment we never built — two decisions asked before Kylani had read
// anything, and the category answer only fed a canned paragraph into the analysis prompt. Reading
// the site is the thing that actually determines both, so the URL is now the only question.
export default function StepUrl({ onSubmit }: { onSubmit: (url: string) => void }) {
  const [url, setUrl] = useState("");

  return (
    <OnboardingChrome>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30, maxWidth: 680, textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(32px,5vw,52px)", lineHeight: 1.02, letterSpacing: "-.035em", margin: 0 }}>
          Where does your product <span style={{ color: "var(--ember)" }}>live</span>?
        </h1>
        <p style={{ margin: 0, fontSize: 18, color: "var(--muted-strong)", lineHeight: 1.55 }}>
          Paste the URL. I&apos;ll read it and tell you who I think buys it — you can correct me on the next screen.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) onSubmit(url.trim());
          }}
          style={{ width: "100%", maxWidth: 620 }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              background: "var(--card)",
              border: "1px solid var(--ink)",
              borderRadius: 14,
              padding: "9px 9px 9px 22px",
              alignItems: "center",
              boxShadow: "var(--lift-2)",
            }}
          >
            <input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="yourproduct.com"
              style={{ flex: 1, minWidth: 0, fontSize: 18, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", color: "var(--ink)" }}
            />
            <button
              type="submit"
              className="ky-btn-ember"
              disabled={!url.trim()}
              style={{ padding: "13px 26px", fontSize: 16, border: "none", opacity: url.trim() ? 1 : 0.5, cursor: url.trim() ? "pointer" : "default" }}
            >
              Read my product
            </button>
          </div>
        </form>
        <span style={{ fontSize: 14, color: "var(--muted)" }}>Takes about forty seconds. Nothing sends until you approve it.</span>
      </div>
    </OnboardingChrome>
  );
}
