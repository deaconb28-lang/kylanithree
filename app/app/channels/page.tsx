"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import { CHANNELS, type ChannelKey } from "../../../lib/data";

type Campaign = {
  productName: string;
  productUrl: string;
  channels: Record<string, boolean>;
};

export default function ChannelsPage() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/campaign")
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) {
          setLoadError(data.error ?? "Couldn't load Channels.");
          return;
        }
        setCampaign(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't reach the server.");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const patchChannels = (channels: Record<string, boolean>) => {
    setCampaign((c) => (c ? { ...c, channels } : c));
    fetch("/api/campaign", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channels }),
    }).catch(() => {});
  };

  const toggleChannel = (key: ChannelKey) => {
    if (!campaign) return;
    patchChannels({ ...campaign.channels, [key]: !campaign.channels[key] });
  };

  const turnOnAllMatched = () => {
    if (!campaign) return;
    const channels = { ...campaign.channels };
    for (const c of CHANNELS) {
      if (c.matched) channels[c.key] = true;
    }
    patchChannels(channels);
  };

  if (loadError) {
    return (
      <DashboardShell active="channels">
        <div style={{ padding: "36px 5vw", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14 }}>
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 18 }}>Couldn&apos;t load Channels.</span>
          <span style={{ fontSize: 14.5, color: "var(--muted)" }}>{loadError}</span>
          <button className="ky-btn-ember" onClick={() => { setLoadError(null); setAttempt((a) => a + 1); }} style={{ padding: "11px 20px", fontSize: 14.5, border: "none" }}>
            Try again
          </button>
        </div>
      </DashboardShell>
    );
  }

  if (!campaign) {
    return (
      <DashboardShell active="channels">
        <div style={{ padding: "36px 5vw", color: "var(--muted)" }}>Loading…</div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell active="channels">
      <div style={{ padding: "36px 5vw", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 22, maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(26px,3.2vw,32px)", letterSpacing: "-.03em", margin: 0 }}>
              Where should I reach people?
            </h1>
            <p style={{ margin: 0, fontSize: 14.5, color: "var(--muted)", lineHeight: 1.5, maxWidth: 640 }}>
              Email is required and sends from your own account. Everything else is optional, and each behaves the way
              that channel expects.
            </p>
          </div>
          <button
            onClick={turnOnAllMatched}
            className="ky-btn-outline"
            style={{ padding: "11px 16px", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}
          >
            Turn on all matched
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--green)", background: "var(--green-tint)", padding: "3px 7px", borderRadius: 999, letterSpacing: ".03em" }}>
              RECOMMENDED
            </span>
          </button>
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", background: "var(--card)" }}>
          {CHANNELS.map((c, i) => {
            const enabled = campaign.channels[c.key] ?? c.matched;
            const disabled = !c.matched;
            return (
              <div
                key={c.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "16px 24px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  flexWrap: "wrap",
                  color: disabled ? "var(--muted)" : "inherit",
                }}
              >
                <span style={{ width: 32, height: 32, borderRadius: 9, background: c.color, display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: 14, fontFamily: "var(--font-outfit)", flexShrink: 0 }}>
                  {c.glyph}
                </span>
                <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 15.5, width: 190, flexShrink: 0 }}>{c.name}</span>
                <span style={{ fontSize: 13.5, color: "var(--muted)", flex: 1, minWidth: 160 }}>{disabled ? "Not matched yet" : c.desc}</span>
                {disabled ? (
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#A39C90", whiteSpace: "nowrap" }}>Add once matched</span>
                ) : c.required ? (
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--green)", whiteSpace: "nowrap" }}>Required</span>
                ) : (
                  <div
                    onClick={() => toggleChannel(c.key)}
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
          <span style={{ fontSize: 13, color: "var(--muted)", maxWidth: 640, lineHeight: 1.45 }}>
            Suppression is checked before anything sends. Disconnect a channel and it stops immediately; your findings
            stay.
          </span>
          <Link href="/app/suppressed" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap" }}>
            View suppressed contacts →
          </Link>
        </div>
      </div>
    </DashboardShell>
  );
}
