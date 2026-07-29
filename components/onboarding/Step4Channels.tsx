"use client";

import { useState } from "react";
import OnboardingChrome from "./OnboardingChrome";
import { CHANNELS, type ChannelKey } from "../../lib/data";

export default function Step4Channels({ onDone }: { onDone: (channels: Record<ChannelKey, boolean>) => void }) {
  const [on, setOn] = useState<Record<ChannelKey, boolean>>(() => {
    const init = {} as Record<ChannelKey, boolean>;
    CHANNELS.forEach((c) => {
      init[c.key] = c.matched;
    });
    return init;
  });

  const turnOnAllMatched = () => {
    setOn((prev) => {
      const next = { ...prev };
      CHANNELS.forEach((c) => {
        if (c.matched) next[c.key] = true;
      });
      return next;
    });
  };

  return (
    <OnboardingChrome align="stretch">
      <div style={{ width: "100%", maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(24px,3.4vw,30px)", lineHeight: 1.1, letterSpacing: "-.03em", margin: 0 }}>
              Where should I reach people?
            </h1>
            <p style={{ margin: 0, fontSize: 14.5, color: "var(--muted-strong)", lineHeight: 1.5, maxWidth: 560 }}>
              Email is required and sends from your own account. Everything else is optional.
            </p>
          </div>
          <button
            onClick={turnOnAllMatched}
            className="ky-btn-outline"
            style={{ border: "1.5px solid var(--ink)", color: "var(--ink)", padding: "12px 18px", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}
          >
            Turn on all matched
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--green)", background: "var(--green-tint)", padding: "3px 7px", borderRadius: 999, letterSpacing: ".03em" }}>
              RECOMMENDED
            </span>
          </button>
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", background: "var(--card)" }}>
          {CHANNELS.map((c, i) => {
            const enabled = on[c.key];
            const disabled = !c.matched;
            return (
              <div
                key={c.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "16px 22px",
                  borderBottom: i < CHANNELS.length - 1 ? "1px solid var(--border)" : "none",
                  background: c.required ? "var(--card-alt)" : "transparent",
                  flexWrap: "wrap",
                  color: disabled ? "var(--muted)" : "inherit",
                }}
              >
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: c.color,
                    display: "grid",
                    placeItems: "center",
                    color: c.key === "forums" || c.key === "x" ? "var(--card)" : "#fff",
                    fontWeight: 700,
                    fontSize: 13,
                    fontFamily: "var(--font-outfit)",
                    flexShrink: 0,
                  }}
                >
                  {c.glyph}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, width: 190, flexShrink: 0 }}>
                  <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 15.5, color: disabled ? "var(--ink)" : "inherit" }}>{c.name}</span>
                  {c.required && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--green)", background: "var(--green-tint)", padding: "3px 8px", borderRadius: 999, letterSpacing: ".03em" }}>
                      CONNECTED
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 13.5, color: "var(--muted)", flex: 1, minWidth: 200 }}>{c.desc}</span>
                {disabled ? (
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#A39C90", whiteSpace: "nowrap", flexShrink: 0 }}>Add once matched</span>
                ) : c.required ? (
                  <div style={{ width: 40, height: 24, borderRadius: 999, background: "var(--green)", padding: 3, boxSizing: "border-box", display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
                    <div style={{ width: 18, height: 18, borderRadius: 999, background: "#fff" }} />
                  </div>
                ) : (
                  <div
                    onClick={() => setOn((s) => ({ ...s, [c.key]: !s[c.key] }))}
                    style={{
                      width: 40,
                      height: 24,
                      borderRadius: 999,
                      background: enabled ? "var(--green)" : "var(--border-strong)",
                      padding: 3,
                      boxSizing: "border-box",
                      display: "flex",
                      justifyContent: enabled ? "flex-end" : "flex-start",
                      flexShrink: 0,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: 999, background: "#fff" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "var(--muted)", maxWidth: 560, lineHeight: 1.45 }}>
            Suppression is checked before anything sends. Disconnect a channel and it stops immediately; your findings stay.
          </span>
          <button onClick={() => onDone(on)} className="ky-btn-ember" style={{ padding: "14px 26px", fontSize: 15, border: "none", whiteSpace: "nowrap" }}>
            Start the search
          </button>
        </div>
      </div>
    </OnboardingChrome>
  );
}
