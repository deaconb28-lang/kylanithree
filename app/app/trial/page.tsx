"use client";

import { useEffect, useState } from "react";
import DashboardShell from "../../../components/dashboard/DashboardShell";

type Campaign = { productName: string; trialEndsAt: string | null };

const INCLUDED = [
  "Human-approved drafts, never auto-sent",
  "Unlimited buyer discovery across channels",
  "Reddit, Slack, Discord and email replies",
  "Weekly Findings reports, in plain language",
  "Suppression and compliance built in",
  "Priority support from a real person",
];

export default function TrialPage() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);

  useEffect(() => {
    fetch("/api/campaign").then((r) => r.json()).then(setCampaign);
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
            You&apos;re reaching real buyers with {campaign.productName}.
          </h1>
          <p style={{ margin: 0, fontSize: 16, color: "var(--muted)", lineHeight: 1.6 }}>
            {daysLeft === null
              ? "Your setup is complete."
              : daysLeft > 0
                ? `Your trial is active — no action needed. ${daysLeft} day${daysLeft === 1 ? "" : "s"} left, ends ${endedLabel}.`
                : `Your 7-day trial ended ${endedLabel}. Everything keeps working — there's no billing set up yet, so nothing is charged or paused.`}
          </p>
        </div>

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
              {daysLeft !== null && daysLeft > 0 ? `Trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : "Trial period"}
            </span>
            <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5, maxWidth: 190 }}>
              {endedLabel ? `${daysLeft !== null && daysLeft > 0 ? "Ends" : "Ended"} ${endedLabel}.` : ""} No billing is set up — nothing is charged.
            </span>
          </div>
        </div>

        <div style={{ position: "relative", width: "100%", maxWidth: 900, background: "#FFF8F1", border: "1px solid #F3D9BE", borderRadius: 20, padding: 32, display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 36, textAlign: "left", boxShadow: "0 1px 2px rgba(20,18,15,.05), 0 26px 54px -26px rgba(20,18,15,.18)" }} className="trial-card">
          <style>{`@media (max-width: 720px) { .trial-card { grid-template-columns: 1fr !important; } }`}</style>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: 21, letterSpacing: "-.02em" }}>Kylani Growth</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "#A8431C", background: "#FBE4CE", padding: "3px 8px", borderRadius: 999, letterSpacing: ".04em" }}>MULTI-CHANNEL</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: 38, letterSpacing: "-.03em" }}>7 days free</span>
              <span style={{ fontSize: 15, color: "var(--muted)" }}>then $99/month</span>
            </div>
            <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>
              For founders who want a real pipeline from Reddit, Slack, and Discord — without sounding like a bot.
            </p>
            <div style={{ border: "1px solid var(--border-strong)", borderRadius: 12, padding: 15, textAlign: "center", fontSize: 14.5, fontWeight: 600, color: "var(--muted)", marginTop: 6 }}>
              {daysLeft !== null && daysLeft > 0 ? "Trial already active — nothing to start" : "Billing isn't set up yet"}
            </div>
            <span style={{ fontSize: 12.5, color: "var(--muted)", textAlign: "center" }}>Nothing sends without your approval, trial or not</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 16 }}>What&apos;s included</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }} className="trial-included">
              <style>{`@media (max-width: 480px) { .trial-included { grid-template-columns: 1fr !important; } }`}</style>
              {INCLUDED.map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ width: 19, height: 19, borderRadius: 999, background: "var(--ember)", display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1 }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5.2l2 2 4-4.4" /></svg>
                  </div>
                  <span style={{ fontSize: 14, lineHeight: 1.4 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
