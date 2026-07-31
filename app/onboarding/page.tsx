"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Step1Url from "../../components/onboarding/Step1Url";
import Step2Reading from "../../components/onboarding/Step2Reading";
import Step3Buyers from "../../components/onboarding/Step3Buyers";
import Step5Search from "../../components/onboarding/Step5Search";
import Step6Complete from "../../components/onboarding/Step6Complete";
import type { SiteAnalysis } from "../../lib/types";
import type { ProductCategory } from "../../lib/productCategories";
import { saveOnboardingResult } from "../../lib/onboardingStorage";
import { CHANNELS } from "../../lib/data";

// Onboarding no longer asks where to reach people — every matched channel starts on, same as the
// "Turn on all matched" default, and founders adjust it afterward from the real Channels page.
const DEFAULT_CHANNELS: Record<string, boolean> = Object.fromEntries(CHANNELS.map((c) => [c.key, c.matched]));

function OnboardingInner() {
  const params = useSearchParams();
  const prefilledUrl = params.get("url");

  const [step, setStep] = useState(prefilledUrl ? 2 : 1);
  const [url, setUrl] = useState(prefilledUrl || "dockside.app");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<ProductCategory>("app");
  const [analysis, setAnalysis] = useState<SiteAnalysis | null>(null);
  const [whatYouSell, setWhatYouSell] = useState("");
  const [buyers, setBuyers] = useState<{ name: string; desc: string }[]>([]);
  const channels = DEFAULT_CHANNELS;

  switch (step) {
    case 1:
      return (
        <Step1Url
          onSubmit={(submittedUrl, submittedNote, submittedCategory) => {
            setUrl(submittedUrl);
            setNote(submittedNote);
            setCategory(submittedCategory);
            setStep(2);
          }}
        />
      );
    case 2:
      return (
        <Step2Reading
          url={url}
          note={note}
          category={category}
          onDone={(result) => {
            setAnalysis(result);
            setStep(3);
          }}
        />
      );
    case 3:
      return (
        <Step3Buyers
          analysis={analysis}
          onDone={(finalWhatYouSell, finalBuyers) => {
            setWhatYouSell(finalWhatYouSell);
            setBuyers(finalBuyers);
            setStep(5);
          }}
        />
      );
    case 5:
      return (
        <Step5Search
          url={url}
          whatYouSell={whatYouSell}
          buyers={buyers}
          channels={channels}
          category={category}
          analysis={analysis}
          onDone={(seed) => {
            saveOnboardingResult({
              url,
              whatYouSell,
              buyers,
              channels,
              category,
              keywords: analysis?.keywords,
              problem: analysis?.problem,
              nicheKey: analysis?.nicheKey,
              problemPhrases: analysis?.problemPhrases,
              seekingPhrases: analysis?.seekingPhrases,
              negativeTerms: analysis?.negativeTerms,
              relevanceWindowDays: analysis?.relevanceWindowDays,
              seed,
            });
            setStep(6);
          }}
        />
      );
    default:
      return <Step6Complete />;
  }
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingInner />
    </Suspense>
  );
}
