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
};
