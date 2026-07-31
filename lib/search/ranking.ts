// Pure venue-ranking math. Deliberately free of Mongo/Anthropic imports so the rules that decide
// which communities win can be unit-tested on their own, without a database or an API key.

// Size fit peaks in the 1k-100k band: big enough to have live conversation, small enough that a
// post about this specific problem isn't buried under general category chatter. This is the rule
// that makes "prefer the focused 8k community over the 2M general one" real rather than a prompt.
export function sizeFit(subscribers: number | null): number {
  if (subscribers === null) return 0.6;
  if (subscribers < 500) return 0.35;
  if (subscribers < 1_000) return 0.6;
  if (subscribers < 10_000) return 1.0;
  if (subscribers < 100_000) return 0.95;
  if (subscribers < 500_000) return 0.7;
  if (subscribers < 2_000_000) return 0.45;
  return 0.25;
}

// Derived from the platform's real subscriber count — never a model-authored string.
export function formatMembers(subscribers: number | null): string {
  if (subscribers === null) return "size unknown";
  if (subscribers >= 1_000_000) return `${(subscribers / 1_000_000).toFixed(1)}m members`;
  if (subscribers >= 1_000) return `${(subscribers / 1_000).toFixed(subscribers >= 10_000 ? 0 : 1)}k members`;
  return `${subscribers} members`;
}

export function termRelevance(haystack: string, terms: string[]): number {
  const lower = haystack.toLowerCase();
  const hits = terms.filter((t) => t && lower.includes(t.toLowerCase())).length;
  return Math.min(1, hits / Math.max(1, Math.min(terms.length, 3)));
}
