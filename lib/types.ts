export type SiteBuyer = {
  key: string;
  name: string;
  tag: string | null;
  desc: string;
  where: string;
};

export type SiteAnalysis = {
  whatYouSell: string;
  problem: string;
  siteSummary: string;
  buyers: SiteBuyer[];
  keywords: string[];
  // Shared cache key for venue resolution — keyed on the buyer+problem niche, not the company, so
  // two founders selling into the same niche reuse the same resolved communities.
  nicheKey: string;
  problemPhrases: string[];
  seekingPhrases: string[];
  negativeTerms: string[];
  // Varies by niche: fast markets decay in weeks, durable B2B problems stay live for months.
  relevanceWindowDays: number;
};
