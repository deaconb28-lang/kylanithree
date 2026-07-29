"use client";

import { Suspense, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import { CHANNELS, type ChannelKey } from "../../../lib/data";

type Campaign = {
  productName: string;
  productUrl: string;
  dailyCap: number;
  paused: boolean;
  channels: Record<string, boolean>;
  stripe?: { connected: boolean };
};

function StripeNotice() {
  const params = useSearchParams();
  const stripeStatus = params.get("stripe");
  if (!stripeStatus) return null;
  const copy =
    stripeStatus === "connected"
      ? { text: "Stripe connected — real revenue numbers now show on Map.", color: "var(--green)" }
      : stripeStatus === "denied"
        ? { text: "Stripe connection was cancelled.", color: "var(--muted)" }
        : { text: "Couldn't connect Stripe. Try again.", color: "var(--ember)" };
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "12px 18px", background: "var(--card-alt)", fontSize: 14, fontWeight: 600, color: copy.color }}>
      {copy.text}
    </div>
  );
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    fetch("/api/campaign")
      .then((r) => r.json())
      .then(setCampaign);
  }, []);

  const patchCampaign = (body: Partial<Campaign>) => {
    setCampaign((c) => (c ? { ...c, ...body } : c));
    fetch("/api/campaign", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  };

  const toggleChannel = (key: ChannelKey) => {
    if (!campaign) return;
    const channels = { ...campaign.channels, [key]: !campaign.channels[key] };
    patchCampaign({ channels });
  };

  const disconnectStripe = async () => {
    setDisconnecting(true);
    await fetch("/api/stripe/disconnect", { method: "POST" }).catch(() => {});
    setCampaign((c) => (c ? { ...c, stripe: { connected: false } } : c));
    setDisconnecting(false);
  };

  if (!campaign) {
    return (
      <DashboardShell active="settings">
        <div style={{ padding: "36px 5vw", color: "var(--muted)" }}>Loading…</div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell active="settings">
      <div style={{ padding: "36px 5vw", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 28, maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(26px,3.2vw,34px)", letterSpacing: "-.03em", margin: 0 }}>
            Settings
          </h1>
          <span style={{ fontSize: 15, color: "var(--muted)" }}>{campaign.productName} · {campaign.productUrl} · campaign 1</span>
        </div>

        <Suspense fallback={null}>
          <StripeNotice />
        </Suspense>

        <div style={{ border: "1px solid var(--border)", borderRadius: 16, padding: "22px 24px", display: "flex", flexDirection: "column", gap: 14, background: "var(--card)" }}>
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 17 }}>Sending inbox</span>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg, #EA4335, #FBBC04)", flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{session?.user?.email ?? "connecting…"}</span>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>Gmail · connected</span>
            </div>
          </div>
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: 16, padding: "22px 24px", display: "flex", flexDirection: "column", gap: 14, background: "var(--card)" }}>
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 17 }}>Payments</span>
          <p style={{ margin: 0, fontSize: 14.5, color: "var(--muted)", lineHeight: 1.5 }}>
            Connect Stripe so Map shows your real revenue and reply-to-close numbers instead of an estimate.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ width: 30, height: 30, borderRadius: 8, background: "#635BFF", display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontFamily: "var(--font-outfit)", fontSize: 14, flexShrink: 0 }}>
              S
            </span>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{campaign.stripe?.connected ? "Stripe connected" : "Not connected"}</span>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>
                {campaign.stripe?.connected ? "Real revenue data is live on Map." : "No payment data yet — numbers on Map are estimates."}
              </span>
            </div>
            <div style={{ marginLeft: "auto" }}>
              {campaign.stripe?.connected ? (
                <button
                  onClick={disconnectStripe}
                  disabled={disconnecting}
                  className="ky-btn-outline"
                  style={{ padding: "10px 16px", fontSize: 14, fontWeight: 600, opacity: disconnecting ? 0.6 : 1 }}
                >
                  {disconnecting ? "Disconnecting…" : "Disconnect"}
                </button>
              ) : (
                <a
                  href="/api/stripe/connect"
                  className="ky-btn-ember"
                  style={{ padding: "11px 18px", fontSize: 14, fontWeight: 600, border: "none", display: "inline-block" }}
                >
                  Connect Stripe
                </a>
              )}
            </div>
          </div>
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: 16, padding: "22px 24px", display: "flex", flexDirection: "column", gap: 14, background: "var(--card)" }}>
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 17 }}>Daily send cap</span>
          <p style={{ margin: 0, fontSize: 14.5, color: "var(--muted)", lineHeight: 1.5 }}>
            Kylani will never send more than this many messages a day, no matter how many drafts are approved.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={campaign.dailyCap}
              onChange={(e) => setCampaign((c) => (c ? { ...c, dailyCap: Number(e.target.value) } : c))}
              onMouseUp={(e) => patchCampaign({ dailyCap: Number((e.target as HTMLInputElement).value) })}
              onTouchEnd={(e) => patchCampaign({ dailyCap: Number((e.target as HTMLInputElement).value) })}
              style={{ flex: 1, accentColor: "var(--ember)" }}
            />
            <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 18, width: 70, textAlign: "right" }}>{campaign.dailyCap}/day</span>
          </div>
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", background: "var(--card)" }}>
          <div style={{ padding: "20px 24px 4px" }}>
            <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 17 }}>Channels</span>
          </div>
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
                  padding: "14px 24px",
                  borderTop: i === 0 ? "1px solid var(--border)" : "none",
                  borderBottom: i < CHANNELS.length - 1 ? "1px solid var(--border)" : "none",
                  flexWrap: "wrap",
                  color: disabled ? "var(--muted)" : "inherit",
                }}
              >
                <span style={{ width: 28, height: 28, borderRadius: 7, background: c.color, display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: 12, fontFamily: "var(--font-outfit)", flexShrink: 0 }}>
                  {c.glyph}
                </span>
                <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 15, width: 180, flexShrink: 0 }}>{c.name}</span>
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

        <div style={{ border: `1px solid ${campaign.paused ? "var(--border)" : "#E8B4A6"}`, borderRadius: 16, padding: "22px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap", background: campaign.paused ? "var(--card-alt)" : "var(--card)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 17 }}>{campaign.paused ? "Campaign paused" : "Pause this campaign"}</span>
            <span style={{ fontSize: 14, color: "var(--muted)" }}>
              {campaign.paused ? "No new messages will send. Your findings and history are kept." : "Stops all sending immediately. You can resume any time."}
            </span>
          </div>
          <button
            onClick={() => patchCampaign({ paused: !campaign.paused })}
            className="ky-btn-outline"
            style={{ padding: "12px 20px", fontSize: 14.5, fontWeight: 600, color: campaign.paused ? "var(--green)" : "var(--ember)", borderColor: campaign.paused ? "var(--green)" : "#E8B4A6", whiteSpace: "nowrap" }}
          >
            {campaign.paused ? "Resume campaign" : "Pause campaign"}
          </button>
        </div>
      </div>
    </DashboardShell>
  );
}
