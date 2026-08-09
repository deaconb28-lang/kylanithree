"use client";

import { useEffect, useState } from "react";

// The referral program, from the referrer's side.
//
// Two numbers, and the distinction between them is the honest part: `qualified` means somebody paid
// and the credit is owed, `rewarded` means it has actually landed on the Stripe balance. Collapsing
// them into one "earned" figure would claim money had moved when it may not have — which is the
// same fabrication rule the rest of this product is held to, applied to the one place where it is
// literally about money.
//
// Nothing here is shown until the API answers. A referral count rendered as 0 while loading reads
// as "you have referred nobody", which is a claim rather than a loading state.

type Summary = {
  code: string;
  link: string;
  pending: number;
  qualified: number;
  rewarded: number;
  earnedCents: number;
  rewardCents: number;
  currency: string;
};

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

export default function ReferralPanel() {
  const [data, setData] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/referrals")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const copy = () => {
    if (!data) return;
    navigator.clipboard?.writeText(data.link).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      },
      () => {},
    );
  };

  if (failed) return null;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", background: "var(--card)", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, letterSpacing: "-.01em" }}>
          Give a month, get a month
        </span>
        <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>
          {data
            ? `Anyone who signs up through your link gets their first month free. Once they pay for their second, you get ${money(data.rewardCents, data.currency)} off your next invoice.`
            : "Loading…"}
        </span>
      </div>

      {data && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <code
              style={{
                flex: 1,
                minWidth: 200,
                fontFamily: "inherit",
                fontSize: 13,
                color: "var(--muted-strong)",
                background: "var(--card-alt)",
                border: "1px solid var(--border)",
                borderRadius: 9,
                padding: "9px 12px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {data.link}
            </code>
            <button className="ky-btn-outline" onClick={copy} style={{ padding: "9px 15px", fontSize: 13.5, fontWeight: 600, minHeight: 0 }}>
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>

          {/* Three states, never merged. "Signed up" owes nothing yet; "earned" is owed; "credited"
              has actually moved. A single blended number would imply money changed hands when it
              may not have. */}
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap", fontSize: 13 }}>
            {[
              { label: "Signed up", value: String(data.pending), hint: "not paid yet" },
              { label: "Earned", value: String(data.qualified), hint: "credit owed" },
              { label: "Credited", value: money(data.earnedCents, data.currency), hint: `${data.rewarded} applied` },
            ].map((s) => (
              <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span className="ky-tnum" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, letterSpacing: "-.02em" }}>
                  {s.value}
                </span>
                <span style={{ fontSize: 12, color: "var(--muted-strong)", fontWeight: 600 }}>{s.label}</span>
                <span style={{ fontSize: 11.5, color: "var(--faint)" }}>{s.hint}</span>
              </div>
            ))}
          </div>

          {data.qualified > 0 && (
            // Owed but not yet applied. Says why rather than leaving a number looking stuck.
            <span style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>
              {data.qualified === 1 ? "One credit is" : `${data.qualified} credits are`} waiting — they apply
              automatically to your next invoice once you have an active subscription.
            </span>
          )}
        </>
      )}
    </div>
  );
}
