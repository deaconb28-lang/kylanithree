/**
 * Which campaign dashboard renders.
 *
 * v0.8 ships in phases, which means there is a window where the new dashboard knows less than the
 * one it replaces. A flag is the difference between a rollback and a revert — the same reason the
 * legacy onboarding flow is still in this repo (`lib/discover/flag.ts`), and the same shape.
 *
 * `?v=8` forces the new one for a single visit, which is how it gets reviewed before it is default.
 * `?v=7` forces the old one. `NEXT_PUBLIC_CAMPAIGN_V8=on` flips the default for everyone, and is
 * what gets set at the end of phase 7.
 */
export type CampaignVersion = "v7" | "v8";

export function resolveCampaignVersion(param?: string | null): CampaignVersion {
  if (param === "8" || param === "v8") return "v8";
  if (param === "7" || param === "v7") return "v7";
  return process.env.NEXT_PUBLIC_CAMPAIGN_V8 === "on" ? "v8" : "v7";
}
