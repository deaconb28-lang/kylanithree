import type { GeneratedSeed } from "./generateCampaignSeed";

export type OnboardingResult = {
  url: string;
  whatYouSell: string;
  buyers: { name: string; desc: string }[];
  keywords?: string[];
  // Carried across the sign-in redirect so finalize stores the same lexicon the search actually
  // used — a later re-search then reuses it rather than re-deriving a coarser one.
  problem?: string;
  nicheKey?: string;
  problemPhrases?: string[];
  seekingPhrases?: string[];
  negativeTerms?: string[];
  relevanceWindowDays?: number;
  // The real, already-completed lead search from StepSearch — see lib/seed.ts's
  // finalizeOnboarding, which persists this instead of searching again post-signin.
  seed?: GeneratedSeed;
};

const KEY = "kylani_onboarding";

export function saveOnboardingResult(result: OnboardingResult) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(result));
  } catch {
    // sessionStorage unavailable (private browsing, etc.) — personalization is best-effort.
  }
}

export function readOnboardingResult(): OnboardingResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OnboardingResult) : null;
  } catch {
    return null;
  }
}

export function clearOnboardingResult() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // no-op
  }
}
