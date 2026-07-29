"use client";

import Link from "next/link";
import { useState } from "react";
import OnboardingChrome from "./OnboardingChrome";
import { dashboardPath } from "../../lib/dashboardUrl";

export default function Step6Complete() {
  const [queueHref] = useState(() => dashboardPath("/app/queue"));

  return (
    <OnboardingChrome>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28, maxWidth: 680, textAlign: "center" }}>
        <span style={{ fontSize: 15, color: "var(--muted)" }}>First pass done</span>
        <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(30px,4.5vw,50px)", lineHeight: 1.02, letterSpacing: "-.035em", margin: 0 }}>
          Your first buyers, each with a reason attached.
        </h1>
        <p style={{ margin: 0, fontSize: 17.5, color: "var(--muted-strong)", lineHeight: 1.6 }}>
          Sign in and your list will be waiting — real leads and communities drafted from what you just told me, not a demo.
          More get added the longer I keep looking.
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
          <Link href={queueHref} className="ky-btn-ember" style={{ padding: "16px 30px", fontSize: 17, boxShadow: "0 1px 2px rgba(20,18,15,.12)" }}>
            Read the first drafts
          </Link>
          <span style={{ fontSize: 14.5, color: "var(--muted)" }}>Nothing sends until you approve each one.</span>
        </div>
        <span style={{ fontSize: 13.5, color: "var(--muted)", maxWidth: 620, lineHeight: 1.5 }}>
          <strong style={{ color: "var(--ink)", fontWeight: 600 }}>Next 24 hours:</strong> I space approved drafts under your
          daily cap, watch for replies, and surface anything time-sensitive on Today.
        </span>
      </div>
    </OnboardingChrome>
  );
}
