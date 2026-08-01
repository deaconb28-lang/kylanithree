"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import { DAILY_CAP_MAX, PLAN_COPY, type SubscriptionPlan } from "../../../lib/billing";

type Campaign = {
  productName: string;
  productUrl: string;
  dailyCap: number;
  paused: boolean;
  channels: Record<string, boolean>;
  stripe?: { connected: boolean };
  subscription?: { plan: SubscriptionPlan; interval: "monthly" | "annual"; status: "active" | "past_due" | "canceled" | "incomplete" };
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/campaign")
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) {
          setLoadError(data.error ?? "Couldn't load Settings.");
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

  const patchCampaign = (body: Partial<Campaign>) => {
    setCampaign((c) => (c ? { ...c, ...body } : c));
    fetch("/api/campaign", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  };

  const disconnectStripe = async () => {
    setDisconnecting(true);
    await fetch("/api/stripe/disconnect", { method: "POST" }).catch(() => {});
    setCampaign((c) => (c ? { ...c, stripe: { connected: false } } : c));
    setDisconnecting(false);
  };

  if (loadError) {
    return (
      <DashboardShell active="settings">
        <div style={{ padding: "36px 5vw", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14 }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>Couldn&apos;t load Settings.</span>
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
      <DashboardShell active="settings">
        <div style={{ padding: "36px 5vw", color: "var(--muted)" }}>Loading…</div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell active="settings">
      <div style={{ padding: "36px 5vw", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 28, maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(26px,3.2vw,34px)", letterSpacing: "-.03em", margin: 0 }}>
            Settings
          </h1>
          <span style={{ fontSize: 15, color: "var(--muted)" }}>{campaign.productName} · {campaign.productUrl} · campaign 1</span>
        </div>

        <Suspense fallback={null}>
          <StripeNotice />
        </Suspense>

        <div style={{ border: "1px solid var(--border)", borderRadius: 16, padding: "22px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, background: "var(--card)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17 }}>Plan &amp; billing</span>
            <span style={{ fontSize: 14, color: "var(--muted)" }}>
              {campaign.subscription?.status === "active"
                ? `${PLAN_COPY[campaign.subscription.plan].name}, billed ${campaign.subscription.interval}.`
                : "No active subscription — see plans and trial status."}
            </span>
          </div>
          {campaign.subscription?.status === "active" ? (
            <a href="/api/stripe/portal" className="ky-btn-outline" style={{ padding: "10px 16px", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>
              Manage billing
            </a>
          ) : (
            <Link href="/app/trial" className="ky-btn-ember" style={{ padding: "11px 18px", fontSize: 14, fontWeight: 600, border: "none", whiteSpace: "nowrap" }}>
              View plans
            </Link>
          )}
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: 16, padding: "22px 24px", display: "flex", flexDirection: "column", gap: 14, background: "var(--card)" }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17 }}>Sending inbox</span>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg, #EA4335, #FBBC04)", flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{session?.user?.email ?? "connecting…"}</span>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>Gmail · connected</span>
            </div>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11.5,
                fontWeight: 700,
                color: "var(--green)",
                background: "var(--green-tint)",
                padding: "4px 10px",
                borderRadius: 999,
                letterSpacing: ".03em",
                whiteSpace: "nowrap",
              }}
            >
              REQUIRED TO SEND
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
            This can&apos;t be disconnected — without it, Kylani has nowhere to send approved messages from. To send from a
            different account, sign in with that account instead.
          </p>
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: 16, padding: "22px 24px", display: "flex", flexDirection: "column", gap: 14, background: "var(--card)" }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17 }}>Payments</span>
          <p style={{ margin: 0, fontSize: 14.5, color: "var(--muted)", lineHeight: 1.5 }}>
            Connect Stripe so Map shows your real revenue and reply-to-close numbers instead of an estimate.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ width: 30, height: 30, borderRadius: 8, background: "#635BFF", display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontFamily: "var(--font-display)", fontSize: 14, flexShrink: 0 }}>
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
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17 }}>Daily send cap</span>
          <p style={{ margin: 0, fontSize: 14.5, color: "var(--muted)", lineHeight: 1.5 }}>
            Kylani will never send more than this many messages a day, no matter how many drafts are approved.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <input
              type="range"
              min={5}
              max={campaign.subscription?.status === "active" ? DAILY_CAP_MAX[campaign.subscription.plan] : DAILY_CAP_MAX.trial}
              step={5}
              value={campaign.dailyCap}
              onChange={(e) => setCampaign((c) => (c ? { ...c, dailyCap: Number(e.target.value) } : c))}
              onMouseUp={(e) => patchCampaign({ dailyCap: Number((e.target as HTMLInputElement).value) })}
              onTouchEnd={(e) => patchCampaign({ dailyCap: Number((e.target as HTMLInputElement).value) })}
              style={{ flex: 1, accentColor: "var(--ember)" }}
            />
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, width: 70, textAlign: "right" }}>{campaign.dailyCap}/day</span>
          </div>
          {campaign.subscription?.status !== "active" && (
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Founder plans can go up to {DAILY_CAP_MAX.founder}/day.</span>
          )}
        </div>

        <Link
          href="/app/channels"
          style={{ border: "1px solid var(--border)", borderRadius: 16, padding: "22px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, background: "var(--card)", textDecoration: "none", flexWrap: "wrap" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "var(--ink)" }}>Channels</span>
            <span style={{ fontSize: 14, color: "var(--muted)" }}>Where Kylani looks, and how it behaves once it&apos;s there.</span>
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap" }}>Manage channels →</span>
        </Link>

        <div style={{ border: `1px solid ${campaign.paused ? "var(--border)" : "var(--attention-border)"}`, borderRadius: 16, padding: "22px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap", background: campaign.paused ? "var(--card-alt)" : "var(--card)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17 }}>{campaign.paused ? "Campaign paused" : "Pause this campaign"}</span>
            <span style={{ fontSize: 14, color: "var(--muted)" }}>
              {campaign.paused ? "No new messages will send. Your findings and history are kept." : "Stops all sending immediately. You can resume any time."}
            </span>
          </div>
          <button
            onClick={() => patchCampaign({ paused: !campaign.paused })}
            className="ky-btn-outline"
            style={{ padding: "12px 20px", fontSize: 14.5, fontWeight: 600, color: campaign.paused ? "var(--green)" : "var(--ember)", borderColor: campaign.paused ? "var(--green)" : "var(--attention-border)", whiteSpace: "nowrap" }}
          >
            {campaign.paused ? "Resume campaign" : "Pause campaign"}
          </button>
        </div>
      </div>
    </DashboardShell>
  );
}
