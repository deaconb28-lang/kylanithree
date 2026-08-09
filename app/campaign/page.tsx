"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import DashboardShell from "../../components/dashboard/DashboardShell";
import LegacyDashboard from "../../components/campaign/LegacyDashboard";
import Dashboard from "../../components/campaign/Dashboard";
import { resolveCampaignVersion } from "../../lib/campaign/flag";

// The campaign IS the dashboard — one route, and everything else is a lens or a workspace inside it.
//
// While v0.8 is built in phases, this file is a switch rather than the dashboard itself: `?v=8`
// renders the new one, `?v=7` the old, and `NEXT_PUBLIC_CAMPAIGN_V8=on` decides which is default.
// See lib/campaign/flag.ts — a rewrite shipped in phases needs a rollback that is not a revert.

function Switch() {
  const version = resolveCampaignVersion(useSearchParams().get("v"));
  if (version === "v7") return <LegacyDashboard />;
  return (
    <DashboardShell active="campaign">
      <Dashboard />
    </DashboardShell>
  );
}

export default function CampaignPage() {
  return (
    // useSearchParams needs a boundary, and the fallback is the legacy dashboard rather than a
    // spinner: almost every load resolves to it, so rendering it straight away is the correct guess
    // rather than a flash of nothing.
    <Suspense fallback={<LegacyDashboard />}>
      <Switch />
    </Suspense>
  );
}
