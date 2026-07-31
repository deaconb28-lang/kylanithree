// Pure Stack Exchange site selection, kept free of imports so the routing rules are testable
// without a network call — same reasoning as ranking.ts and excerpt.ts.

// Deliberately a curated map rather than the full site list: it keeps the fan-out narrow and
// avoids querying 180 sites for a niche that only lives on one or two. Keys are matched against
// the niche lexicon, so a recipe blog reaches Cooking and a CRM reaches Stack Overflow.
const SITE_KEYWORDS: Record<string, string[]> = {
  cooking: ["recipe", "cook", "food", "kitchen", "bake", "meal", "ingredient", "diet", "nutrition"],
  gardening: ["garden", "plant", "soil", "grow", "seed", "compost"],
  money: ["invest", "stock", "budget", "tax", "saving", "retirement", "mortgage", "finance", "portfolio"],
  fitness: ["workout", "training", "gym", "exercise", "muscle", "running"],
  parenting: ["parent", "toddler", "baby", "child", "kids", "newborn"],
  photo: ["photo", "camera", "lens", "lighting", "portrait", "editing"],
  pets: ["dog", "cat", "pet", "puppy", "kitten", "vet"],
  travel: ["travel", "flight", "visa", "itinerary", "hotel", "trip"],
  diy: ["diy", "repair", "renovation", "plumbing", "drywall", "tool"],
  woodworking: ["woodwork", "lumber", "joinery", "sawdust", "carpentry"],
  bicycles: ["bike", "bicycle", "cycling", "derailleur"],
  boardgames: ["board game", "tabletop", "boardgame"],
  music: ["guitar", "music", "recording", "instrument", "song"],
  outdoors: ["hiking", "camping", "backpacking", "trail"],
  workplace: ["manager", "coworker", "hiring", "workplace", "colleague", "promotion"],
  academia: ["thesis", "phd", "professor", "research paper", "academic"],
  webmasters: ["seo", "website traffic", "domain", "analytics", "sitemap"],
  ux: ["usability", "user experience", "ux", "onboarding flow", "interface"],
  serverfault: ["server", "dns", "nginx", "load balancer", "sysadmin"],
  dba: ["database", "sql", "postgres", "mysql", "query performance"],
  security: ["security", "phishing", "encryption", "vulnerability"],
  superuser: ["windows", "macos", "laptop", "printer", "wifi", "browser"],
  stackoverflow: ["api", "code", "developer", "javascript", "python", "integration", "library", "sdk"],
  softwareengineering: ["architecture", "design pattern", "refactor", "microservice", "technical debt"],
};

// Pure and deterministic so the choice of sites is testable without a network call.
export function pickStackExchangeSites(terms: string[], max = 3): string[] {
  const haystack = terms.join(" ").toLowerCase();
  const scored = Object.entries(SITE_KEYWORDS)
    .map(([site, keywords]) => ({ site, hits: keywords.filter((k) => haystack.includes(k)).length }))
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  return scored.slice(0, max).map((s) => s.site);
}
