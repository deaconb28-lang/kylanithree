"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import StepUrl from "../../components/onboarding/StepUrl";
import StepStart from "../../components/onboarding/StepStart";
import { resolveFlow } from "../../lib/discover/flag";
import { markFlowStart, sinceFlowStart, trackClient } from "../../lib/discover/clientTrack";
import StepReading from "../../components/onboarding/StepReading";
import StepBuyers from "../../components/onboarding/StepBuyers";
import StepSearch from "../../components/onboarding/StepSearch";
import StepDone from "../../components/onboarding/StepDone";
import type { SiteAnalysis } from "../../lib/types";
import { saveOnboardingResult } from "../../lib/onboardingStorage";

// The whole product in four screens: paste a URL, read the site, correct who it's for, go find
// them. Anything that wasn't one of those four things has been taken out — a product-category
// picker and a notes box on the first screen (both guesses made before Kylani had read anything),
// and a channel-toggle step whose answer no search route ever read. Channels are still a real
// setting, just one you adjust from the Channels page once you're in and have something to adjust.

type Step = "url" | "reading" | "buyers" | "search" | "done";

function OnboardingInner() {
  const params = useSearchParams();
  const prefilledUrl = params.get("url");
  const flow = resolveFlow(params.get("flow"));

  // Everything below this line is the old four-screen flow, kept behind the flag so the two can be
  // compared on the same events rather than replaced on faith. /onboarding stays the one entry URL
  // in both cases, so no link on the site has to know which flow is live.
  const [step, setStep] = useState<Step>(prefilledUrl ? "reading" : "url");
  const [url, setUrl] = useState(prefilledUrl ?? "");
  const [analysis, setAnalysis] = useState<SiteAnalysis | null>(null);
  const [whatYouSell, setWhatYouSell] = useState("");
  const [buyers, setBuyers] = useState<{ name: string; desc: string }[]>([]);

  // Arriving with the URL already filled in means the landing page was the submission; the legacy
  // flow has no route that would otherwise record it.
  useEffect(() => {
    if (flow === "legacy" && prefilledUrl) trackClient("url_submitted", { flow: "legacy" });
  }, [flow, prefilledUrl]);

  if (flow === "discover") return <StepStart prefilledUrl={prefilledUrl} />;

  switch (step) {
    case "url":
      return (
        <StepUrl
          onSubmit={(submittedUrl) => {
            markFlowStart();
            trackClient("url_submitted", { flow: "legacy" });
            setUrl(submittedUrl);
            setStep("reading");
          }}
        />
      );
    case "reading":
      return (
        <StepReading
          url={url}
          onDone={(result) => {
            setAnalysis(result);
            setStep("buyers");
          }}
        />
      );
    case "buyers":
      return (
        <StepBuyers
          analysis={analysis}
          url={url}
          onDone={(finalWhatYouSell, finalBuyers) => {
            setWhatYouSell(finalWhatYouSell);
            setBuyers(finalBuyers);
            setStep("search");
          }}
        />
      );
    case "search":
      return (
        <StepSearch
          url={url}
          whatYouSell={whatYouSell}
          buyers={buyers}
          analysis={analysis}
          onDone={(seed) => {
            trackClient("search_complete", { flow: "legacy", ms: sinceFlowStart() });
            saveOnboardingResult({
              url,
              whatYouSell,
              buyers,
              keywords: analysis?.keywords,
              problem: analysis?.problem,
              nicheKey: analysis?.nicheKey,
              problemPhrases: analysis?.problemPhrases,
              seekingPhrases: analysis?.seekingPhrases,
              negativeTerms: analysis?.negativeTerms,
              relevanceWindowDays: analysis?.relevanceWindowDays,
              seed,
            });
            setStep("done");
          }}
        />
      );
    default:
      return <StepDone />;
  }
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingInner />
    </Suspense>
  );
}
