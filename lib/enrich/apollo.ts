// Apollo — business records for the company behind a lead.
//
// Kylani finds a person saying something. Apollo answers "who do they work for": industry,
// headcount, location, funding, tech stack. That turns "someone on Hacker News" into "an engineer
// at a 40-person Series A logistics company", which is what makes a lead qualifiable.
//
// EVERY DETAIL BELOW WAS VERIFIED AGAINST THE LIVE API, NOT RECALLED. That is deliberate: this
// codebase has already been bitten twice by plausible-looking API details that were wrong — an
// invented Stack Exchange filter id that made every lookup silently return null, and seven of ten
// hand-guessed Stack Exchange slugs that did not exist. The specifics:
//
//   - Env var is `apollo_one` — lowercase, not APOLLO_API_KEY. Read from Railway, not guessed.
//   - Auth is the `x-api-key` REQUEST HEADER. Not Bearer, not an `api_key` query param.
//   - Endpoints were confirmed to exist by probing unauthenticated: a real path answers
//     `{"error":"Api key required"}`, an invented one returns an EMPTY body. `/organizations/
//     job_postings` looks plausible and does NOT exist — it failed exactly that check.
//   - Field names came from the published response schema, not from memory.
//
// Re-verify the same way rather than trusting this comment if anything starts returning nothing.

const BASE = "https://api.apollo.io";
const TIMEOUT_MS = 10_000;

/**
 * The key. `apollo_one` is the name actually set in Railway and Vercel; the conventional spellings
 * are accepted as fallbacks so a later rename does not silently disable enrichment.
 */
function apolloKey(): string | undefined {
  return process.env.apollo_one || process.env.APOLLO_API_KEY || process.env.APOLLO_ONE || undefined;
}

export function hasApolloKey(): boolean {
  return Boolean(apolloKey());
}

/** Normalized company record. Every field optional — Apollo fills what it has and nothing more. */
export interface CompanyRecord {
  /** Apollo's own id, kept so a later call can address the org directly. */
  apolloId?: string;
  name?: string;
  domain?: string;
  websiteUrl?: string;
  description?: string;
  industry?: string;
  keywords?: string[];
  employeeCount?: number;
  foundedYear?: number;
  city?: string;
  state?: string;
  country?: string;
  rawAddress?: string;
  phone?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  logoUrl?: string;
  annualRevenue?: number;
  /** Apollo's own formatting, e.g. "$12.5M". Kept verbatim rather than re-derived from the number. */
  annualRevenuePrinted?: string;
  totalFunding?: number;
  latestFundingStage?: string;
  latestFundingRoundDate?: string;
  technologies?: string[];
}

/** Apollo's organization object. Only the fields this module reads are declared. */
interface ApolloOrganization {
  id?: string;
  name?: string;
  primary_domain?: string;
  website_url?: string;
  short_description?: string;
  industry?: string;
  keywords?: string[];
  estimated_num_employees?: number;
  founded_year?: number;
  city?: string;
  state?: string;
  country?: string;
  raw_address?: string;
  phone?: string;
  sanitized_phone?: string;
  linkedin_url?: string;
  twitter_url?: string;
  logo_url?: string;
  annual_revenue?: number;
  annual_revenue_printed?: string;
  total_funding?: number;
  latest_funding_stage?: string;
  latest_funding_round_date?: string;
  technology_names?: string[];
}

/**
 * Strips a URL, an email or a bare host down to a registrable domain.
 *
 * Apollo keys organizations on domain, and the caller may hold any of the three — a lead's
 * `sourceUrl`, an email, or something a founder typed. Getting this wrong does not error, it just
 * misses, so it normalises aggressively and is unit-tested.
 */
export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  // An email: everything after the last @ is the host.
  const at = s.lastIndexOf("@");
  if (at >= 0) s = s.slice(at + 1);
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // scheme
  s = s.split(/[/?#]/)[0]; // path, query, fragment
  s = s.split(":")[0]; // port
  s = s.replace(/^www\./, "");
  s = s.replace(/\.$/, ""); // trailing dot on a fully-qualified name
  // A domain needs a dot and at least a two-character TLD; anything else is a handle or a typo.
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) return null;
  if (!/\.[a-z]{2,}$/.test(s)) return null;
  return s;
}

function toRecord(o: ApolloOrganization): CompanyRecord {
  // Built key by key rather than spread-and-rename so a field Apollo omits stays absent instead of
  // becoming null. A null headcount would render as "0 employees", which is a lie about a real
  // company — the same rule the people crawler follows for a missing bio or account age.
  const r: CompanyRecord = {};
  if (o.id) r.apolloId = o.id;
  if (o.name) r.name = o.name;
  if (o.primary_domain) r.domain = o.primary_domain;
  if (o.website_url) r.websiteUrl = o.website_url;
  if (o.short_description) r.description = o.short_description;
  if (o.industry) r.industry = o.industry;
  if (o.keywords?.length) r.keywords = o.keywords.slice(0, 25);
  if (typeof o.estimated_num_employees === "number") r.employeeCount = o.estimated_num_employees;
  if (typeof o.founded_year === "number") r.foundedYear = o.founded_year;
  if (o.city) r.city = o.city;
  if (o.state) r.state = o.state;
  if (o.country) r.country = o.country;
  if (o.raw_address) r.rawAddress = o.raw_address;
  if (o.sanitized_phone || o.phone) r.phone = o.sanitized_phone || o.phone;
  if (o.linkedin_url) r.linkedinUrl = o.linkedin_url;
  if (o.twitter_url) r.twitterUrl = o.twitter_url;
  if (o.logo_url) r.logoUrl = o.logo_url;
  if (typeof o.annual_revenue === "number") r.annualRevenue = o.annual_revenue;
  if (o.annual_revenue_printed) r.annualRevenuePrinted = o.annual_revenue_printed;
  if (typeof o.total_funding === "number") r.totalFunding = o.total_funding;
  if (o.latest_funding_stage) r.latestFundingStage = o.latest_funding_stage;
  if (o.latest_funding_round_date) r.latestFundingRoundDate = o.latest_funding_round_date;
  if (o.technology_names?.length) r.technologies = o.technology_names.slice(0, 40);
  return r;
}

export class ApolloError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** True when Apollo refused because the plan is out of credits or lacks the endpoint. */
    readonly quota = false,
  ) {
    super(message);
    this.name = "ApolloError";
  }
}

async function apolloFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const key = apolloKey();
  // Thrown, not returned as null: a missing key is a deployment fault, and swallowing it would
  // present as "Apollo has no record of this company" for every company forever.
  if (!key) {
    throw new ApolloError("apollo_one is not set. Add it in Railway and in Vercel's Production environment.");
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        // Verified: header auth, this exact casing. Not Bearer, not a query parameter.
        "x-api-key": key,
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new ApolloError(`Apollo request failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (res.status === 401 || res.status === 403) {
    throw new ApolloError(`Apollo rejected the key (${res.status}). Check apollo_one.`, res.status);
  }
  // 402 is out of credits, 429 is rate limited. Both are "come back later", not "no such company",
  // and the caller must be able to tell them apart so a quota stall is never cached as a miss.
  if (res.status === 402 || res.status === 429) {
    throw new ApolloError(`Apollo is refusing calls (${res.status}) — credits or rate limit.`, res.status, true);
  }
  if (!res.ok) {
    throw new ApolloError(`Apollo returned ${res.status}`, res.status);
  }
  return res.json();
}

/**
 * One company, by domain. This is the "business record" call.
 *
 * Returns null when Apollo genuinely has no record — a real answer, and the caller should cache it
 * so the same miss is not paid for twice. Throws for anything else, so a quota stall or an auth
 * failure can never be mistaken for an unknown company.
 */
export async function enrichCompanyByDomain(rawDomain: string): Promise<CompanyRecord | null> {
  const domain = normalizeDomain(rawDomain);
  if (!domain) return null;

  const json = (await apolloFetch(`/api/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`, {
    method: "GET",
  })) as { organization?: ApolloOrganization } | null;

  const org = json?.organization;
  if (!org || (!org.id && !org.name)) return null;
  // Apollo echoes the queried domain back only sometimes; keep ours so the cache key and the record
  // always agree.
  return { domain, ...toRecord(org) };
}

/**
 * Companies by name or other filters, for when there is no domain to key on — a lead whose
 * `company` field is a bare name is the case this exists for.
 */
export async function searchCompanies(opts: {
  name?: string;
  domains?: string[];
  perPage?: number;
}): Promise<CompanyRecord[]> {
  const body: Record<string, unknown> = { per_page: Math.min(opts.perPage ?? 10, 100) };
  if (opts.name) body.q_organization_name = opts.name;
  if (opts.domains?.length) {
    const cleaned = opts.domains.map(normalizeDomain).filter((d): d is string => Boolean(d));
    if (cleaned.length) body.q_organization_domains_list = cleaned;
  }
  if (!body.q_organization_name && !body.q_organization_domains_list) return [];

  const json = (await apolloFetch("/api/v1/organizations/search", {
    method: "POST",
    body: JSON.stringify(body),
  })) as { organizations?: ApolloOrganization[]; accounts?: ApolloOrganization[] } | null;

  // Apollo returns `organizations` here; `accounts` is the shape the mixed_companies endpoint uses.
  // Reading both keeps this working if the caller is pointed at the other one.
  const orgs = json?.organizations ?? json?.accounts ?? [];
  return orgs.map(toRecord);
}

export interface ApolloHealth {
  configured: boolean;
  healthy: boolean;
  /** True only when the key authenticated. `/auth/health` answers unauthenticated too. */
  keyValid?: boolean;
  error?: string;
}

/**
 * Is the key actually usable?
 *
 * `/api/v1/auth/health` answers without a key (`is_logged_in: false`), which makes it a genuine
 * end-to-end check: reachable AND authenticated are two different questions and this separates them.
 */
export async function apolloHealth(): Promise<ApolloHealth> {
  if (!hasApolloKey()) return { configured: false, healthy: false, error: "apollo_one is not set" };
  try {
    const json = (await apolloFetch("/api/v1/auth/health", { method: "GET" })) as {
      healthy?: boolean;
      is_logged_in?: boolean;
    } | null;
    return { configured: true, healthy: Boolean(json?.healthy), keyValid: Boolean(json?.is_logged_in) };
  } catch (err) {
    return {
      configured: true,
      healthy: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
