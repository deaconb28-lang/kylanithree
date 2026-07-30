"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import { PLAN_COPY, type BillingInterval, type SubscriptionPlan } from "../../../lib/billing";

type Subscription = {
  plan: SubscriptionPlan;
  interval: BillingInterval;
  status: "active" | "past_due" | "canceled" | "incomplete";
  currentPeriodEnd?: string | null;
};
type Campaign = { productName: string; trialEndsAt: string | null; subscription?: Subscription };
type CheckoutLinks = Record<SubscriptionPlan, Record<BillingInterval, string>>;

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

function PlanCard({
  plan,
  interval,
  onIntervalChange,
  checkoutUrl,
  isCurrent,
}: {
  plan: SubscriptionPlan;
  interval: BillingInterval;
  onIntervalChange: (i: BillingInterval) => void;
  checkoutUrl: string | null;
  isCurrent: boolean;
}) {
  const copy = PLAN_COPY[plan];
  return (
    <div
      style={{
        flex: 1,
        minWidth: 280,
        background: plan === "founder" ? "#FFF8F1" : "var(--card)",
        border: plan === "founder" ? "1px solid #F3D9BE" : "1px solid var(--border)",
        borderRadius: 20,
        padding: 28,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        textAlign: "left",
        boxShadow: "0 1px 2px rgba(20,18,15,.05), 0 26px 54px -26px rgba(20,18,15,.18)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: 20, letterSpacing: "-.02em" }}>{copy.name}</span>
        {isCurrent && (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--green)", background: "var(--green-tint)", padding: "3px 8px", borderRadius: 999, letterSpacing: ".03em" }}>
            YOUR PLAN
          </span>
        )}
      </div>
      <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>{copy.tagline}</p>

      <div style={{ display: "flex", gap: 6, fontSize: 13, background: "var(--card-alt)", padding: 4, borderRadius: 999, width: "fit-content" }}>
        {(["monthly", "annual"] as const).map((i) => (
          <span
            key={i}
            onClick={() => onIntervalChange(i)}
            style={{
              cursor: "pointer",
              padding: "6px 13px",
              borderRadius: 999,
              fontWeight: 600,
              background: interval === i ? "var(--ink)" : "transparent",
              color: interval === i ? "var(--card)" : "var(--muted-strong)",
            }}
          >
            {i === "monthly" ? "Monthly" : "Annual"}
          </span>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {copy.features.map((f) => (
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
      ) : checkoutUrl ? (
        <a href={checkoutUrl} className="ky-btn-ember" style={{ padding: "13px 20px", fontSize: 14.5, border: "none", textAlign: "center" }}>
          Subscribe {interval === "monthly" ? "monthly" : "annually"} on Stripe
        </a>
      ) : (
        <span style={{ fontSize: 13, color: "var(--muted)", textAlign: "center" }}>Loading checkout link…</span>
      )}
      <span style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
        Pricing shown at checkout on Stripe · cancel anytime · nothing sends without your approval
      </span>
    </div>
  );
}

function TrialInner() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [links, setLinks] = useState<CheckoutLinks | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  useEffect(() => {
    fetch("/api/campaign").then((r) => r.json()).then(setCampaign);
    fetch("/api/stripe/checkout-links").then((r) => r.json()).then(setLinks);
  }, []);

  if (!campaign) {
    return (
      <DashboardShell active="home">
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
    <DashboardShell active="home">
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
          <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(28px,4vw,40px)", lineHeight: 1.12, letterSpacing: "-.03em", margin: 0 }}>
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
                    : `Your 7-day trial ended ${endedLabel}. Nothing's paused — subscribe below whenever you're ready.`}
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
              <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 15.5 }}>Setup ready</span>
              <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5, maxWidth: 190 }}>Channels connected and your buyer profile confirmed.</span>
            </div>
            <div style={{ width: 60, height: 46, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <div style={{ width: "100%", height: 1.5, background: "var(--border-strong)" }} />
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{ width: 46, height: 46, borderRadius: 999, background: "var(--ember)", display: "grid", placeItems: "center", boxShadow: "0 0 0 6px #FFF1E7" }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.7 2.3L4.6 9.7h3.9l-.8 6 5.7-8h-4.2z" /></svg>
              </div>
              <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 15.5 }}>Kylani goes to work</span>
              <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5, maxWidth: 210 }}>I find conversations and draft replies — you approve every one.</span>
            </div>
            <div style={{ width: 60, height: 46, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <div style={{ width: "100%", height: 1.5, background: "var(--border-strong)" }} />
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{ width: 46, height: 46, borderRadius: 999, border: "1.5px solid var(--border-strong)", display: "grid", placeItems: "center" }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#9C948A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.6l1.6 3.5 3.8.4-2.8 2.6.8 3.8-3.4-1.9-3.4 1.9.8-3.8-2.8-2.6 3.8-.4z" /></svg>
              </div>
              <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 15.5, color: "var(--muted)" }}>
                {daysLeft !== null && daysLeft > 0 ? `Trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : "Subscribe when ready"}
              </span>
              <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5, maxWidth: 190 }}>
                {endedLabel && daysLeft !== null && daysLeft > 0 ? `Ends ${endedLabel}. ` : ""}Nothing is paused or gated when it ends.
              </span>
            </div>
          </div>
        )}

        <div style={{ position: "relative", display: "flex", gap: 20, width: "100%", maxWidth: 900, flexWrap: "wrap" }}>
          {(["pro", "founder"] as const).map((plan) => (
            <PlanCard
              key={plan}
              plan={plan}
              interval={interval}
              onIntervalChange={setInterval}
              checkoutUrl={links?.[plan][interval] ?? null}
              isCurrent={isActive && subscription!.plan === plan}
            />
          ))}
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
