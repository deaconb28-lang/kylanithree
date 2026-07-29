"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Step1Url from "../../components/onboarding/Step1Url";
import Step2Reading from "../../components/onboarding/Step2Reading";
import Step3Buyers from "../../components/onboarding/Step3Buyers";
import Step4Channels from "../../components/onboarding/Step4Channels";
import Step5Search from "../../components/onboarding/Step5Search";
import Step6Complete from "../../components/onboarding/Step6Complete";
import type { SiteAnalysis } from "../../lib/types";
import { saveOnboardingResult } from "../../lib/onboardingStorage";

function OnboardingInner() {
  const params = useSearchParams();
  const prefilledUrl = params.get("url");

  const [step, setStep] = useState(prefilledUrl ? 2 : 1);
  const [url, setUrl] = useState(prefilledUrl || "dockside.app");
  const [note, setNote] = useState("");
  const [analysis, setAnalysis] = useState<SiteAnalysis | null>(null);
  const [whatYouSell, setWhatYouSell] = useState("");
  const [buyers, setBuyers] = useState<{ name: string; desc: string }[]>([]);

  switch (step) {
    case 1:
      return (
        <Step1Url
          onSubmit={(submittedUrl, submittedNote) => {
            setUrl(submittedUrl);
            setNote(submittedNote);
            setStep(2);
          }}
        />
      );
    case 2:
      return (
        <Step2Reading
          url={url}
          note={note}
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
            setStep(4);
          }}
        />
      );
    case 4:
      return (
        <Step4Channels
          onDone={(channels) => {
            saveOnboardingResult({ url, whatYouSell, buyers, channels });
            setStep(5);
          }}
        />
      );
    case 5:
      return <Step5Search onDone={() => setStep(6)} />;
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
