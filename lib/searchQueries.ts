// Turns a handful of real problem-phrases into a large candidate pool of concrete search queries,
// split into two intents: COMMUNITIES (where buyers congregate) and PEOPLE (an individual real
// post/thread/listing). This is deterministic string templating, not an LLM call — free, instant,
// and gives Claude's web_search tool concrete starting points instead of inventing queries ad hoc
// from scratch, so its limited search budget (see generateCampaignSeed.ts) is spent more
// effectively. Claude still decides which candidates are actually worth running and can adapt
// wording — this is a candidate pool, not a script to execute verbatim.

const COMMUNITY_TEMPLATES = [
  (k: string) => `${k} reddit community`,
  (k: string) => `best subreddits for ${k}`,
  (k: string) => `${k} slack community`,
  (k: string) => `${k} discord server`,
  (k: string) => `${k} forum`,
  (k: string) => `${k} newsletter community`,
  (k: string) => `online community for ${k}`,
  (k: string) => `${k} facebook group`,
];

const PEOPLE_TEMPLATES = [
  (k: string) => `"${k}" site:reddit.com`,
  (k: string) => `${k} complaint`,
  (k: string) => `${k} help site:reddit.com`,
  (k: string) => `"${k}" forum post`,
  (k: string) => `${k} alternative to spreadsheet`,
  (k: string) => `${k} site:news.ycombinator.com`,
  (k: string) => `"${k}" site:twitter.com OR site:x.com`,
  (k: string) => `${k} job posting`,
  (k: string) => `hiring for ${k}`,
  (k: string) => `${k} how do you handle`,
  (k: string) => `${k} frustrated`,
  (k: string) => `${k} looking for a tool`,
];

const BUYER_COMMUNITY_TEMPLATES = [
  (role: string) => `where do ${role}s hang out online`,
  (role: string) => `${role} community forum`,
  (role: string) => `${role} slack group`,
];

const BUYER_PEOPLE_TEMPLATES = [
  (role: string) => `${role} job posting responsibilities`,
  (role: string) => `${role} asking for advice reddit`,
];

export function expandSearchQueries(params: { keywords: string[]; buyers: { name: string }[] }): {
  communityQueries: string[];
  peopleQueries: string[];
  totalCandidates: number;
} {
  const keywords = params.keywords.length ? params.keywords : ["this problem"];
  const roles = params.buyers.map((b) => b.name.toLowerCase());

  const allCommunity = [
    ...keywords.flatMap((k) => COMMUNITY_TEMPLATES.map((t) => t(k))),
    ...roles.flatMap((r) => BUYER_COMMUNITY_TEMPLATES.map((t) => t(r))),
  ];
  const allPeople = [
    ...keywords.flatMap((k) => PEOPLE_TEMPLATES.map((t) => t(k))),
    ...roles.flatMap((r) => BUYER_PEOPLE_TEMPLATES.map((t) => t(r))),
  ];

  const totalCandidates = allCommunity.length + allPeople.length;

  // The full pool can run to 100+ combinations, more than is useful to inline into a prompt —
  // sample a representative, deduplicated slice from each intent so Claude sees real breadth
  // without the prompt ballooning. Deterministic (no Math.random) so behavior is reproducible.
  const sample = (arr: string[], n: number) => Array.from(new Set(arr)).filter((_, i) => i % Math.max(1, Math.floor(arr.length / n)) === 0).slice(0, n);

  return {
    communityQueries: sample(allCommunity, 20),
    peopleQueries: sample(allPeople, 24),
    totalCandidates,
  };
}
