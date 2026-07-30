import type { ProductCategory } from "./productCategories";
import type { GeneratedSeed } from "./generateCampaignSeed";

export type OnboardingResult = {
  url: string;
  whatYouSell: string;
  buyers: { name: string; desc: string }[];
  channels: Record<string, boolean>;
  category?: ProductCategory;
  keywords?: string[];
  // The real, already-completed lead search from Step5Search — see lib/seed.ts's
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
