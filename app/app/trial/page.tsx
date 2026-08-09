"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import { PLAN, PLAN_COPY, TRIAL_DAYS, formattedPrice, type BillingInterval, type SubscriptionPlan } from "../../../lib/billing";
import ReferralPanel from "../../../components/dashboard/ReferralPanel";

type Subscription = {
  plan: SubscriptionPlan;
  interval: BillingInterval;
  status: "active" | "past_due" | "canceled" | "incomplete";
  currentPeriodEnd?: string | null;
};
type Campaign = { productName: string; trialEndsAt: string | null; subscription?: Subscription };

const STATUS_LABEL: Record<Subscription["status"], string> = {
  active: "Active",
  past_due: "Payment past due",
  canceled: "Canceled",
  incomplete: "Incomplete",
};

function BillingNotice() {
  const params = useSearchParams();
  const billing = params.get("billing");
  if (!billing) return null;
  const copy =
    billing === "no-subscription"
      ? { text: "No active subscription to manage yet — pick a plan below.", color: "var(--muted)" }
      : { text: "Couldn't open billing right now. Try again in a bit.", color: "var(--ember)" };
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 720, border: "1px solid var(--border)", borderRadius: 12, padding: "12px 18px", background: "var(--card-alt)", fontSize: 14, fontWeight: 600, color: copy.color }}>
      {copy.text}
    </div>
  );
}

/**
 * The single plan, and the button that opens a real Stripe Checkout Session.
 *
 * This replaced two side-by-side tier cards with a monthly/annual toggle, each linking to one of
 * four fixed Payment Link URLs. The toggle is gone because there is one interval; the links are
 * gone because a Payment Link cannot carry a per-customer referral discount.
 *
 * The price is rendered from `formattedPrice()`, the same cents the Stripe Price is created with,
 * so the figure on this page and the figure on the invoice cannot drift apart.
 */
function PlanCard({ isCurrent }: { isCurrent: boolean }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subscribe = async () => {
    setOpening(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? "Couldn't open checkout right now.");
        setOpening(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Couldn't reach the server.");
      setOpening(false);
    }
  };

  return (
    <div
      style={{
        width: "min(100%, 440px)",
        margin: "0 auto",
        background: "var(--card)",
        border: "1.5px solid var(--ember)",
        borderRadius: 20,
        padding: 28,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        textAlign: "left",
        boxShadow: "var(--lift-3)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, letterSpacing: "-.02em" }}>{PLAN.name}</span>
        {isCurrent && (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--green)", background: "var(--green-tint)", padding: "3px 8px", borderRadius: 999, letterSpacing: ".03em" }}>
            YOUR PLAN
          </span>
        )}
      </div>

      <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 40, letterSpacing: "-.03em", lineHeight: 1 }}>
        {formattedPrice()}
        <span style={{ fontSize: 16, fontWeight: 500, color: "var(--muted)" }}>/month</span>
      </span>
      <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>{PLAN.tagline}</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {PLAN.features.map((f) => (
          <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
            <div style={{ width: 17, height: 17, borderRadius: 999, background: "var(--ember)", display: "grid", placeItems: "center", flexShrink: 0, marginTop: 2 }}>
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5.2l2 2 4-4.4" /></svg>
            </div>
            <span style={{ fontSize: 13.5, lineHeight: 1.4 }}>{f}</span>
          </div>
        ))}
      </div>

      {isCurrent ? (
        <a href="/api/stripe/portal" className="ky-btn-outline" style={{ padding: "13px 20px", fontSize: 14.5, fontWeight: 600, textAlign: "center" }}>
          Manage billing
        </a>
      ) : (
        <button className="ky-btn-ember" onClick={subscribe} disabled={opening} style={{ padding: "13px 20px", fontSize: 14.5, border: "none", opacity: opening ? 0.6 : 1 }}>
          {opening ? "Opening Stripe…" : "Subscribe"}
        </button>
      )}
      {/* The technical reason never reaches here — toUserError logs it and returns a sentence. */}
      {error && <span style={{ fontSize: 13, color: "var(--ember)", textAlign: "center" }}>{error}</span>}
      <span style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
        Secure checkout on Stripe · cancel anytime · nothing sends without your approval
      </span>
    </div>
  );
}

function TrialInner() {
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
          setLoadError(data.error ?? "Couldn't load Trial.");
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

  if (loadError) {
    return (
      <DashboardShell active="campaign">
        <div style={{ padding: "36px 5vw", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14 }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>Couldn&apos;t load Trial.</span>
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
      <DashboardShell active="campaign">
        <div style={{ padding: "36px 5vw", color: "var(--muted)" }}>Loading…</div>
      </DashboardShell>
    );
  }

  const trialEndsAt = campaign.trialEndsAt ? new Date(campaign.trialEndsAt) : null;
  const daysLeft = trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt.getTime() - new Date().getTime()) / 86_400_000)) : null;
  const endedLabel = trialEndsAt ? trialEndsAt.toLocaleDateString("en-US", { month: "long", day: "numeric" }) : null;
  const subscription = campaign.subscription;
  const isActive = subscription?.status === "active";

  return (
    <DashboardShell active="campaign">
      <div style={{ position: "relative", overflow: "hidden", padding: "56px 5vw", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 34, alignItems: "center", textAlign: "center" }}>
        <div
          style={{
            position: "absolute",
            inset: "-160px -60px auto -60px",
            height: 520,
            opacity: "var(--wash)",
            background: "radial-gradient(48% 58% at 26% 0%, #FFE8D6 0%, rgba(255,232,214,0) 62%), radial-gradient(44% 54% at 82% 10%, #E8EEFF 0%, rgba(232,238,255,0) 64%)",
          }}
        />

        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(28px,4vw,40px)", lineHeight: 1.12, letterSpacing: "-.03em", margin: 0 }}>
            {isActive ? `You're on ${PLAN_COPY[subscription!.plan].name}.` : `You're reaching real buyers with ${campaign.productName}.`}
          </h1>
          <p style={{ margin: 0, fontSize: 16, color: "var(--muted)", lineHeight: 1.6 }}>
            {isActive
              ? `Billed ${subscription!.interval}${subscription!.currentPeriodEnd ? `, renews ${new Date(subscription!.currentPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric" })}` : ""}. ${STATUS_LABEL[subscription!.status]}.`
              : subscription?.status && subscription.status !== "active"
                ? `Your subscription is ${STATUS_LABEL[subscription.status].toLowerCase()} — pick a plan below to reactivate.`
                : daysLeft === null
                  ? "Your setup is complete."
                  : daysLeft > 0
                    ? `Your trial is active — no action needed yet. ${daysLeft} day${daysLeft === 1 ? "" : "s"} left, ends ${endedLabel}.`
                    : `Your ${TRIAL_DAYS}-day trial ended ${endedLabel}. Nothing's paused — subscribe below whenever you're ready.`}
          </p>
        </div>

        <Suspense fallback={null}>
          <BillingNotice />
        </Suspense>

        {!isActive && (
          <div style={{ position: "relative", display: "flex", alignItems: "flex-start", width: "100%", maxWidth: 760 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{ width: 46, height: 46, borderRadius: 999, background: "var(--green)", display: "grid", placeItems: "center" }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 9.3l3 3 6-6.6" /></svg>
              </div>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15.5 }}>Setup ready</span>
              <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5, maxWidth: 190 }}>Channels connected and your buyer profile confirmed.</span>
            </div>
            <div style={{ width: 60, height: 46, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <div style={{ width: "100%", height: 1.5, background: "var(--border-strong)" }} />
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{ width: 46, height: 46, borderRadius: 999, background: "var(--ember)", display: "grid", placeItems: "center", boxShadow: "0 0 0 6px var(--ember-tint)" }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.7 2.3L4.6 9.7h3.9l-.8 6 5.7-8h-4.2z" /></svg>
              </div>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15.5 }}>Kylani goes to work</span>
              <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5, maxWidth: 210 }}>I find conversations and draft replies — you approve every one.</span>
            </div>
            <div style={{ width: 60, height: 46, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <div style={{ width: "100%", height: 1.5, background: "var(--border-strong)" }} />
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{ width: 46, height: 46, borderRadius: 999, border: "1.5px solid var(--border-strong)", display: "grid", placeItems: "center" }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.6l1.6 3.5 3.8.4-2.8 2.6.8 3.8-3.4-1.9-3.4 1.9.8-3.8-2.8-2.6 3.8-.4z" /></svg>
              </div>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15.5, color: "var(--muted)" }}>
                {daysLeft !== null && daysLeft > 0 ? `Trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : "Subscribe when ready"}
              </span>
              <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5, maxWidth: 190 }}>
                {endedLabel && daysLeft !== null && daysLeft > 0 ? `Ends ${endedLabel}. ` : ""}Nothing is paused or gated when it ends.
              </span>
            </div>
          </div>
        )}

        <div style={{ position: "relative", width: "100%", maxWidth: 900, display: "flex", flexDirection: "column", gap: 20 }}>
          <PlanCard isCurrent={isActive} />
          {/* Shown to everyone, subscribed or not: a trial user can refer, and the credit waits as
              `qualified` until they have a Stripe customer to apply it to. */}
          <div style={{ width: "min(100%, 440px)", margin: "0 auto", textAlign: "left" }}>
            <ReferralPanel />
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

export default function TrialPage() {
  return (
    <Suspense fallback={null}>
      <TrialInner />
    </Suspense>
  );
}
