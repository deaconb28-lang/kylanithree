import { getDb } from "../mongodb";
import { enrichCompanyByDomain, normalizeDomain, ApolloError, type CompanyRecord } from "./apollo";

// The company record store.
//
// Caching is not an optimisation here, it is a cost correctness requirement: Apollo bills a credit
// per enrichment, so looking the same company up twice spends real money for an identical answer.
// Every read goes through `getCompanyRecord`, which is the only thing that should ever call Apollo.
//
// Misses are cached too, and that is the part worth not removing. Without it, a domain Apollo has
// never heard of is re-requested on every single lead from that company forever — the most
// expensive possible way to learn nothing. A miss is a real answer and it gets stored as one.
//
// What is NOT cached is a refusal. A 402 (out of credits) or a 429 (rate limited) means "ask
// again later", and writing that down as "no such company" would silently poison the store for
// every company looked up during a quota stall.

/** How long a found record is trusted. Firmographics move slowly; headcount and funding do not. */
const HIT_TTL_DAYS = 90;
/** Misses expire sooner — a company Apollo lacked in March may well exist by June. */
const MISS_TTL_DAYS = 30;

export interface CompanyDoc {
  /** Normalized registrable domain. The cache key, and unique. */
  domain: string;
  /** Absent when Apollo had no record. The presence of this field is what "hit" means. */
  record?: CompanyRecord;
  /** True when Apollo answered and had nothing. Distinct from "never looked". */
  miss: boolean;
  fetchedAt: Date;
  /** Bumped whenever a lead resolved to this company, so popularity is visible without a join. */
  lookups: number;
}

export async function Companies() {
  return (await getDb()).collection<CompanyDoc>("companies");
}

export async function ensureCompanyIndexes(): Promise<void> {
  try {
    const companies = await Companies();
    await companies.createIndex({ domain: 1 }, { name: "company_domain", unique: true });
    // Finding what is stale enough to refresh.
    await companies.createIndex({ fetchedAt: 1 }, { name: "company_freshness" });
  } catch (err) {
    // Non-fatal, exactly like ensureIngestIndexes: a missing index makes a query slower, while a
    // throw here would take down whatever route is enriching.
    console.error("[companies] index not created:", err instanceof Error ? err.message : err);
  }
}

function isStale(doc: CompanyDoc): boolean {
  const ttlDays = doc.miss ? MISS_TTL_DAYS : HIT_TTL_DAYS;
  return Date.now() - doc.fetchedAt.getTime() > ttlDays * 86_400_000;
}

export interface CompanyLookup {
  record: CompanyRecord | null;
  /** Where the answer came from — "apollo" is the only one that spent a credit. */
  source: "cache" | "apollo" | "unavailable";
  /** Set when Apollo could not be asked; the caller should retry later rather than treat as a miss. */
  deferred?: string;
}

/**
 * One company record, by domain, paid for at most once per TTL.
 *
 * Never throws for an Apollo-side problem. A lead is still a lead without firmographics, so a quota
 * stall degrades the record to `unavailable` and leaves the lead intact — it does not fail the
 * search that was enriching it.
 */
export async function getCompanyRecord(rawDomain: string): Promise<CompanyLookup> {
  const domain = normalizeDomain(rawDomain);
  if (!domain) return { record: null, source: "cache" };

  const companies = await Companies();
  const existing = await companies.findOne({ domain });

  if (existing && !isStale(existing)) {
    // Counted even on a cache hit: the number is "how often this company came up", not "how often
    // we paid Apollo", and the second is already derivable from fetchedAt.
    await companies.updateOne({ domain }, { $inc: { lookups: 1 } });
    return { record: existing.record ?? null, source: "cache" };
  }

  let record: CompanyRecord | null;
  try {
    record = await enrichCompanyByDomain(domain);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[companies] Apollo lookup failed for ${domain}: ${message}`);
    // A stale hit beats nothing. Serving last quarter's headcount is a smaller error than
    // presenting a company we already know about as unknown.
    if (existing) return { record: existing.record ?? null, source: "cache", deferred: message };
    return { record: null, source: "unavailable", deferred: message };
  }

  await companies.updateOne(
    { domain },
    {
      $set: { domain, record: record ?? undefined, miss: record === null, fetchedAt: new Date() },
      $inc: { lookups: 1 },
    },
    { upsert: true },
  );

  return { record, source: "apollo" };
}

/**
 * Records for several domains, deduped, sequentially.
 *
 * Sequential on purpose. Apollo rate limits per minute and the bulk endpoint bills the same credits
 * as the singles, so there is nothing to win by racing it — and a 429 mid-batch would cost the
 * whole batch rather than one row. Same reasoning as the crawler polling sources one at a time.
 */
export async function getCompanyRecords(rawDomains: string[]): Promise<Map<string, CompanyRecord | null>> {
  const out = new Map<string, CompanyRecord | null>();
  const unique = [...new Set(rawDomains.map(normalizeDomain).filter((d): d is string => Boolean(d)))];

  for (const domain of unique) {
    const { record, source, deferred } = await getCompanyRecord(domain);
    // An unavailable domain is left OUT of the map rather than mapped to null: absent means
    // "unknown", null means "Apollo says there is nothing". Collapsing them would let a quota
    // stall look like a company that does not exist.
    if (source === "unavailable" && deferred) continue;
    out.set(domain, record);
  }
  return out;
}

/** Quota-aware detector, so a caller can stop a batch early rather than grind through a 429. */
export function isQuotaProblem(err: unknown): boolean {
  return err instanceof ApolloError && err.quota;
}
