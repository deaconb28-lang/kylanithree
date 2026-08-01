export type OnboardingFlow = "discover" | "legacy";

/**
 * Which onboarding runs.
 *
 * The old flow is kept rather than deleted because "2-3x faster" is a claim about two things, and
 * with only one of them shipping there is nothing to measure against. Both emit the same analytics
 * event names, so `flowReport` can compare them directly.
 *
 * `?flow=legacy` on any entry URL forces the old one; `NEXT_PUBLIC_ONBOARDING_FLOW=legacy` flips
 * the default back for everyone, which is the rollback if the new flow turns out worse.
 */
export function resolveFlow(param?: string | null): OnboardingFlow {
  if (param === "legacy" || param === "discover") return param;
  return process.env.NEXT_PUBLIC_ONBOARDING_FLOW === "legacy" ? "legacy" : "discover";
}
