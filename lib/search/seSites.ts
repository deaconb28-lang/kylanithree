// Pure Stack Exchange site selection, kept free of imports so the routing rules are testable
// without a network call — same reasoning as ranking.ts and excerpt.ts.

// Deliberately a curated map rather than the full site list: it keeps the fan-out narrow and
// avoids querying 180 sites for a niche that only lives on one or two. Keys are matched against
// the niche lexicon, so a recipe blog reaches Cooking and a CRM reaches Stack Overflow.
const SITE_KEYWORDS: Record<string, string[]> = {
  cooking: ["recipe", "cook", "food", "kitchen", "bake", "meal", "ingredient", "diet", "nutrition"],
  // "grow" and "seed" were here and had to go: every startup on earth says "grow revenue" and
  // "seed round", and both routed straight to Gardening as whole words, so word boundaries alone
  // would not have saved them. A keyword only earns its place if it is unlikely to appear in a
  // sentence about software.
  gardening: ["garden", "gardening", "soil", "compost", "seedling", "pruning", "houseplant"],
  money: ["invest", "stock", "budget", "tax", "saving", "retirement", "mortgage", "finance", "portfolio"],
  fitness: ["workout", "training", "gym", "exercise", "muscle", "running"],
  parenting: ["parent", "toddler", "baby", "child", "kids", "newborn"],
  photo: ["photo", "camera", "lens", "lighting", "portrait", "editing"],
  pets: ["dog", "cat", "pet", "puppy", "kitten", "vet"],
  travel: ["travel", "flight", "visa", "itinerary", "hotel", "trip"],
  // "tool" was here. It is a whole word in "roadmap planning tools", so it survived the boundary
  // fix and still sent an issue tracker to DIY — the generic-vocabulary problem, not the substring
  // one. "power tool" is the thing actually meant.
  diy: ["diy", "repair", "renovation", "plumbing", "drywall", "power tool"],
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

/**
 * Whole-word match, with the common English inflections.
 *
 * This used to be `haystack.includes(k)`, and a bare substring test routed real products to absurd
 * sites: "scattered feature requests" contains "cat", so an issue tracker was searched for on Pets,
 * and "roadmap planning tools" contains "tool", so it was also searched on DIY. Two of the three
 * Stack Exchange slots, gone — silently, because a wrong site returns few results rather than an
 * error. Observed on a live run against linear.app, not theorised.
 *
 * Boundaries on BOTH ends are what matters. A leading `\b` alone still matches "cat" inside
 * "category". The suffix group keeps the useful inflections ("tool" → "tools", "garden" →
 * "gardening") that made the loose test attractive in the first place.
 */
function mentions(haystack: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}(?:s|es|ing|ed)?\\b`, "i").test(haystack);
}

// Pure and deterministic so the choice of sites is testable without a network call.
export function pickStackExchangeSites(terms: string[], max = 3): string[] {
  const haystack = terms.join(" ").toLowerCase();
  const scored = Object.entries(SITE_KEYWORDS)
    .map(([site, keywords]) => ({ site, hits: keywords.filter((k) => mentions(haystack, k)).length }))
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  return scored.slice(0, max).map((s) => s.site);
}
