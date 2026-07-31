import type { IntentTier } from "./types";

// The user-facing quality score. Pure and dependency-free so every number on screen can be
// unit-tested and, more importantly, explained.
//
// This replaces truncating results to an arbitrary count. Cutting a list at 25 throws away real
// people for no reason a founder can see; ranking everything that passed the quality gate and
// showing WHY keeps the judgement with the person doing the outreach. The gate itself is unchanged
// — nothing weak gets in here, this only orders what already qualified.

export type LeadScoreBreakdown = {
  intent: number; // 0-40 — is this person shopping, venting, or adjacent?
  confidence: number; // 0-25 — how sure the qualifier was
  recency: number; // 0-20 — decays across the niche's own relevance window
  engagement: number; // 0-15 — a thread people replied to is a thread worth joining
};

export type LeadScore = {
  total: number; // 0-100
  stars: number; // 1-5, in half steps
  label: string;
  breakdown: LeadScoreBreakdown;
};

// Intent dominates deliberately: someone actively asking for a recommendation is worth more than a
// popular six-week-old complaint, and no amount of upvotes should out-rank that.
const INTENT_POINTS: Record<IntentTier, number> = {
  seeking: 40,
  complaining: 26,
  adjacent: 12,
};

export function scoreLead(input: {
  intentTier: IntentTier;
  confidence: number;
  postedAt: Date | string;
  score: number;
  numComments: number;
  relevanceWindowDays: number;
}): LeadScore {
  const posted = input.postedAt instanceof Date ? input.postedAt : new Date(input.postedAt);
  const windowDays = Math.max(input.relevanceWindowDays, 1);

  const intent = INTENT_POINTS[input.intentTier] ?? 0;
  const confidence = Math.round(Math.max(0, Math.min(1, input.confidence)) * 25);

  // Linear decay across the niche's own window, so "fresh" means fresh for THIS market: a week is
  // stale in finance and current in warehouse ops.
  const ageDays = Number.isNaN(posted.getTime()) ? windowDays : (Date.now() - posted.getTime()) / 86_400_000;
  const recency = Math.round(Math.max(0, Math.min(1, 1 - ageDays / windowDays)) * 20);

  // Log-scaled: the gap between 0 and 5 replies matters far more than 200 versus 400.
  const engagementRaw = Math.log10(1 + Math.max(0, input.score) + Math.max(0, input.numComments) * 2) / 2.5;
  const engagement = Math.round(Math.min(1, engagementRaw) * 15);

  const total = Math.max(0, Math.min(100, intent + confidence + recency + engagement));
  return { total, stars: starsFromTotal(total), label: labelFromTotal(total), breakdown: { intent, confidence, recency, engagement } };
}

// Half steps so the scale has enough resolution to be worth reading, floored at 1 — anything that
// reached this point cleared the quality gate, so zero stars would misrepresent it.
export function starsFromTotal(total: number): number {
  const raw = (Math.max(0, Math.min(100, total)) / 100) * 5;
  return Math.max(1, Math.round(raw * 2) / 2);
}

export function labelFromTotal(total: number): string {
  if (total >= 82) return "Ready to talk";
  if (total >= 68) return "Strong signal";
  if (total >= 52) return "Worth a look";
  if (total >= 36) return "Early";
  return "Long shot";
}

// Highest score first. Recency breaks ties so two equally strong leads surface newest-first.
export function rankLeads<T extends { intentTier: IntentTier; confidence: number; postedAt: Date | string; score: number; numComments: number }>(
  leads: T[],
  relevanceWindowDays: number,
): (T & { leadScore: LeadScore })[] {
  return leads
    .map((l) => ({ ...l, leadScore: scoreLead({ ...l, relevanceWindowDays }) }))
    .sort((a, b) => {
      if (b.leadScore.total !== a.leadScore.total) return b.leadScore.total - a.leadScore.total;
      return new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime();
    });
}
