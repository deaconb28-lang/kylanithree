"use client";

import { useState } from "react";
import OnboardingChrome from "./OnboardingChrome";
import SiteBadge, { useSitePreview } from "./SiteBadge";
import type { SiteAnalysis } from "../../lib/types";

type Buyer = {
  key: string;
  name: string;
  tag?: string | null;
  desc: string;
  where: string;
  dropped: boolean;
  editing?: boolean;
};

const DEFAULT_SUMMARY = "I read your site and matched it against a few real buyers — correct anything that's off.";
const DEFAULT_SELL = "Describe what you sell in a sentence.";

export default function StepBuyers({
  analysis,
  url,
  onDone,
}: {
  analysis: SiteAnalysis | null;
  url: string;
  onDone: (whatYouSell: string, buyers: { name: string; desc: string }[]) => void;
}) {
  const preview = useSitePreview(url);
  const [buyers, setBuyers] = useState<Buyer[]>(() => (analysis?.buyers ?? []).map((b) => ({ ...b, dropped: false })));
  const [whatYouSell, setWhatYouSell] = useState(analysis?.whatYouSell ?? DEFAULT_SELL);
  const [editingSell, setEditingSell] = useState(false);
  const siteSummary = analysis?.siteSummary ?? DEFAULT_SUMMARY;

  return (
    <OnboardingChrome align="stretch">
      <div style={{ width: "100%", maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 40, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Identity only here — the summary is the subheading directly below, so passing it
                into the badge as well would print the same sentence twice. */}
            <SiteBadge url={url} preview={preview} description={null} hideDescription compact />
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(28px,4vw,40px)", lineHeight: 1.06, letterSpacing: "-.03em", margin: 0 }}>
              Is this your audience?
            </h1>
            <p style={{ margin: 0, fontSize: 16.5, color: "var(--muted-strong)", lineHeight: 1.55, maxWidth: 640 }}>
              {siteSummary}
            </p>
            <span style={{ fontSize: 13.5, color: "var(--muted)" }}>Guesses ordered most likely first — correct anything, I&apos;ll search for what you keep.</span>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
            <button
              className="ky-btn-ember"
              onClick={() =>
                onDone(
                  whatYouSell,
                  buyers.filter((b) => !b.dropped).map((b) => ({ name: b.name, desc: b.desc })),
                )
              }
              style={{ padding: "13px 22px", fontSize: 15, border: "none" }}
            >
              Looks right — find them
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {buyers.map((b) => (
            <div
              key={b.key}
              style={{
                background: b.dropped ? "var(--card-alt)" : b.tag ? "var(--card)" : "var(--card-veil)",
                border: b.dropped ? "1px dashed var(--border-strong)" : b.tag ? "1.5px solid var(--ink)" : "1px solid var(--border)",
                borderRadius: 14,
                padding: "20px 22px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                opacity: b.dropped ? 0.55 : 1,
                boxShadow: b.tag && !b.dropped ? "var(--lift-2)" : "none",
              }}
              className="buyer-row"
            >
              {b.editing ? (
                <div
                  tabIndex={-1}
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                      setBuyers((bs) => bs.map((x) => (x.key === b.key ? { ...x, editing: false } : x)));
                    }
                  }}
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  <input
                    autoFocus
                    value={b.name}
                    onChange={(e) => setBuyers((bs) => bs.map((x) => (x.key === b.key ? { ...x, name: e.target.value } : x)))}
                    style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 21, letterSpacing: "-.02em", border: "1px solid var(--border-strong)", borderRadius: 8, padding: "6px 10px" }}
                  />
                  <textarea
                    value={b.desc}
                    onChange={(e) => setBuyers((bs) => bs.map((x) => (x.key === b.key ? { ...x, desc: e.target.value } : x)))}
                    rows={2}
                    style={{ fontSize: 15, color: "var(--muted-strong)", lineHeight: 1.5, border: "1px solid var(--border-strong)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", resize: "vertical" }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".07em", flexShrink: 0 }}>Where they work</span>
                    <input
                      value={b.where}
                      onChange={(e) => setBuyers((bs) => bs.map((x) => (x.key === b.key ? { ...x, where: e.target.value } : x)))}
                      style={{ flex: "1 1 200px", fontSize: 15, border: "1px solid var(--border-strong)", borderRadius: 8, padding: "6px 10px" }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 21, letterSpacing: "-.02em" }}>{b.name}</span>
                      {b.tag && <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ember)", background: "var(--ember-tint)", padding: "3px 9px", borderRadius: 999 }}>{b.tag}</span>}
                      {b.dropped && <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Dropped</span>}
                    </div>
                    <div style={{ display: "flex", gap: 8, fontSize: 14, color: "var(--muted)", flexShrink: 0 }}>
                      <span
                        onClick={() => setBuyers((bs) => bs.map((x) => (x.key === b.key ? { ...x, editing: true } : x)))}
                        className="ky-btn-outline"
                        style={{ padding: "7px 12px", fontSize: 14, cursor: "pointer" }}
                      >
                        Edit
                      </span>
                      <span
                        onClick={() => setBuyers((bs) => bs.map((x) => (x.key === b.key ? { ...x, dropped: !x.dropped } : x)))}
                        className="ky-btn-outline"
                        style={{ padding: "7px 12px", fontSize: 14, cursor: "pointer" }}
                      >
                        {b.dropped ? "Undo" : "Drop"}
                      </span>
                    </div>
                  </div>
                  <span style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.5 }}>{b.desc}</span>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".07em", flexShrink: 0 }}>Where they work</span>
                    <span style={{ fontSize: 14, color: "var(--ink)" }}>{b.where}</span>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14.5, color: "var(--muted)", borderTop: "1px solid var(--border)", paddingTop: 18, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, color: "var(--ink)" }}>What you sell:</span>
          {editingSell ? (
            <input
              autoFocus
              value={whatYouSell}
              onChange={(e) => setWhatYouSell(e.target.value)}
              onBlur={() => setEditingSell(false)}
              style={{ flex: 1, minWidth: 200, fontSize: 14.5, border: "1px solid var(--border-strong)", borderRadius: 8, padding: "6px 10px", fontFamily: "inherit" }}
            />
          ) : (
            <span>{whatYouSell}</span>
          )}
          <span onClick={() => setEditingSell(true)} style={{ color: "var(--ember)", fontWeight: 500, cursor: "pointer" }}>
            Edit
          </span>
        </div>
      </div>
    </OnboardingChrome>
  );
}
