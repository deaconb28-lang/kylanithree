"use client";

import { useState } from "react";
import OnboardingChrome from "./OnboardingChrome";

export default function Step1Url({
  onSubmit,
}: {
  onSubmit: (url: string, note: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);

  return (
    <OnboardingChrome>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30, maxWidth: 680, textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(32px,5vw,52px)", lineHeight: 1.02, letterSpacing: "-.035em", margin: 0 }}>
          Where does your product live?
        </h1>
        <p style={{ margin: 0, fontSize: 18, color: "var(--muted-strong)", lineHeight: 1.55 }}>
          Paste the URL. I&apos;ll read it and tell you who I think buys it — you can correct me on the next screen.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) onSubmit(url.trim(), note.trim());
          }}
          style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", maxWidth: 620 }}
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
              boxShadow: "0 1px 2px rgba(20,18,15,.06), 0 16px 34px -18px rgba(20,18,15,.2)",
            }}
          >
            <input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="yourproduct.com"
              style={{ flex: 1, fontSize: 18, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", color: "var(--ink)" }}
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

          <div
            onClick={() => setShowNote(true)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              gap: 10,
              background: "var(--card-alt)",
              border: "1px dashed var(--border-strong)",
              borderRadius: 12,
              padding: "10px 16px",
              boxSizing: "border-box",
              cursor: showNote ? "default" : "pointer",
            }}
          >
            {showNote ? (
              <textarea
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Files, current leads, notes — optional."
                rows={2}
                style={{ border: "none", outline: "none", background: "transparent", resize: "vertical", fontSize: 13.5, fontFamily: "inherit", color: "var(--ink)" }}
              />
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13.5, color: "var(--muted-strong)", flex: 1, textAlign: "left" }}>
                  Anything else I should know? Attach files, current leads, notes — optional.
                </span>
                <span style={{ fontSize: 12.5, color: "var(--ember)", fontWeight: 600, whiteSpace: "nowrap" }}>Add</span>
              </div>
            )}
          </div>
        </form>
        <span style={{ fontSize: 14, color: "var(--muted)" }}>Takes about forty seconds. Nothing sends until you approve it.</span>
      </div>
    </OnboardingChrome>
  );
}
