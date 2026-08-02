import { People, type PersonDoc } from "./collections";

// Person enrichment — the half of the crawler that scrapes PEOPLE rather than posts.
//
// The corpus answers "what was said". This answers "who said it": a display name, a bio in their
// own words, how long the account has existed, and a link a founder can actually open. That is the
// difference between a lead that reads as a person and one that reads as a row.
//
// Every lookup here is a public, unauthenticated profile endpoint, called one person at a time with
// a small per-tick budget. Politeness is not decoration on a crawler: Stack Exchange and Discourse
// both enforce their limits by cutting access off entirely, and losing a source outright costs far
// more than enrichment arriving a few ticks later.
//
// NOTHING here is fabricated. A field the platform does not return is left absent, never guessed —
// `bio` stays undefined rather than becoming "", and `accountAgeDays` stays undefined rather than
// becoming 0, because a zero would render as "joined today" for someone who has been there a
// decade. Design principle 1 applies to crawled data exactly as it applies to the UI.

const UA = "kylani-ingest/1.0 (+https://kylani.app)";
const TIMEOUT_MS = 8_000;

/** Attempts before a person is left alone. Deleted and private profiles never start working. */
export const MAX_ENRICH_ATTEMPTS = 3;

/**
 * Stack Exchange filter id covering about_me, question_count and answer_count on top of the default
 * user fields. The default filter omits all three, and `about_me` is the whole reason to make this
 * call — without a filter the reply has no bio in it.
 *
 * This is an opaque id minted by the API itself (`/2.3/filters/create?include=…&base=default`), not
 * a string that can be reasoned out. It was created and then verified against a live user before
 * being pasted here; an invented one returns `400 Invalid filter specified` and every lookup on
 * this platform silently returns null. If it ever needs changing, mint a new one the same way.
 */
const SE_USER_FILTER = "!20aKG._8Oscv*6cpqY0av";

export interface PersonProfile {
  displayName?: string;
  bio?: string;
  profileUrl?: string;
  accountAgeDays?: number;
  reputation?: number;
  platformPostCount?: number;
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function daysSince(epochSeconds: number): number | undefined {
  if (!Number.isFinite(epochSeconds) || epochSeconds <= 0) return undefined;
  const days = Math.floor((Date.now() - epochSeconds * 1000) / 86_400_000);
  return days >= 0 ? days : undefined;
}

/** Strips the HTML that Discourse and Stack Exchange both return in bio fields. */
function textFromHtml(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 ? text.slice(0, 600) : undefined;
}

/**
 * Hacker News, via the official Firebase API rather than the Algolia mirror — the mirror indexes
 * items, and its user records lag behind and omit `about` entirely for many accounts.
 */
async function fetchHackerNews(handle: string): Promise<PersonProfile | null> {
  const data = (await getJson(`https://hacker-news.firebaseio.com/v0/user/${encodeURIComponent(handle)}.json`)) as {
    id?: string;
    about?: string;
    karma?: number;
    created?: number;
    submitted?: unknown[];
  } | null;
  // The endpoint answers 200 with a literal `null` body for an account that does not exist, so a
  // missing `id` is the real not-found signal here, not the status code.
  if (!data?.id) return null;
  return {
    displayName: data.id,
    bio: textFromHtml(data.about),
    profileUrl: `https://news.ycombinator.com/user?id=${encodeURIComponent(data.id)}`,
    accountAgeDays: data.created ? daysSince(data.created) : undefined,
    reputation: typeof data.karma === "number" ? data.karma : undefined,
    platformPostCount: Array.isArray(data.submitted) ? data.submitted.length : undefined,
  };
}

/**
 * Stack Exchange, by numeric user id. The display name on a post is not addressable, which is why
 * the crawler now carries `authorId` — without it this platform cannot be enriched at all.
 */
async function fetchStackExchange(site: string, userId: string): Promise<PersonProfile | null> {
  const key = process.env.STACKEXCHANGE_KEY ? `&key=${encodeURIComponent(process.env.STACKEXCHANGE_KEY)}` : "";
  const url =
    `https://api.stackexchange.com/2.3/users/${encodeURIComponent(userId)}` +
    `?site=${encodeURIComponent(site)}&filter=${SE_USER_FILTER}${key}`;
  const data = (await getJson(url)) as {
    items?: {
      display_name?: string;
      about_me?: string;
      link?: string;
      creation_date?: number;
      reputation?: number;
      question_count?: number;
      answer_count?: number;
    }[];
  } | null;
  const user = data?.items?.[0];
  if (!user) return null;
  const posts =
    typeof user.question_count === "number" || typeof user.answer_count === "number"
      ? (user.question_count ?? 0) + (user.answer_count ?? 0)
      : undefined;
  return {
    displayName: user.display_name,
    bio: textFromHtml(user.about_me),
    profileUrl: user.link,
    accountAgeDays: user.creation_date ? daysSince(user.creation_date) : undefined,
    reputation: typeof user.reputation === "number" ? user.reputation : undefined,
    platformPostCount: posts,
  };
}

/** Discourse, per forum host. Usernames are unique within a host and meaningless across them. */
async function fetchDiscourse(host: string, username: string): Promise<PersonProfile | null> {
  const data = (await getJson(`https://${host}/u/${encodeURIComponent(username)}.json`)) as {
    user?: {
      username?: string;
      name?: string;
      bio_raw?: string;
      bio_excerpt?: string;
      created_at?: string;
    };
  } | null;
  const user = data?.user;
  if (!user?.username) return null;
  const created = user.created_at ? Date.parse(user.created_at) : NaN;
  return {
    // `name` is optional on Discourse and frequently blank; the username is the honest fallback.
    displayName: user.name?.trim() || user.username,
    bio: textFromHtml(user.bio_raw ?? user.bio_excerpt),
    profileUrl: `https://${host}/u/${encodeURIComponent(user.username)}`,
    accountAgeDays: Number.isFinite(created) ? daysSince(created / 1000) : undefined,
    // No platformPostCount: /u/{username}.json carries badge_count and profile_view_count but no
    // post total — it lives on /u/{username}/summary.json, a second request per person that is not
    // worth the rate limit. Left absent rather than filled with a wrong or invented number.
  };
}

/** Dispatch. Returns null when the platform is unknown or the person cannot be addressed. */
export async function fetchPersonProfile(person: PersonDoc): Promise<PersonProfile | null> {
  const scope = person.scope;
  // `handle` is qualified for the namespaced platforms ("host/username"), so the bare name is
  // whatever follows the first slash. Splitting on the LAST slash would break usernames containing
  // one; splitting on the first is correct because the scope itself never contains a slash.
  const bare = person.handle.includes("/") ? person.handle.slice(person.handle.indexOf("/") + 1) : person.handle;

  switch (person.platform) {
    case "hn":
      return fetchHackerNews(bare);
    case "stackexchange":
      // No numeric id means this row predates the crawler carrying one. It will be filled in the
      // next time this person posts; until then there is nothing to look up.
      if (!scope || !person.authorId) return null;
      return fetchStackExchange(scope, person.authorId);
    case "discourse":
      if (!scope) return null;
      return fetchDiscourse(scope, bare);
    default:
      return null;
  }
}

export interface EnrichStats {
  considered: number;
  enriched: number;
  failed: number;
  unaddressable: number;
}

/**
 * One pass over the enrichment backlog.
 *
 * Ordered by most recently seen, so the people a founder is most likely to be shown are the ones
 * who get a face first. The budget is deliberately small — this runs every tick, forever, and the
 * backlog draining slowly is a far better failure mode than a source revoking access.
 */
export async function enrichPeopleBacklog(opts: { limit?: number } = {}): Promise<EnrichStats> {
  const limit = opts.limit ?? 25;
  const people = await People();
  const stats: EnrichStats = { considered: 0, enriched: 0, failed: 0, unaddressable: 0 };

  const backlog = await people
    .find({
      enrichedAt: { $exists: false },
      // NOT {$lt: MAX}: Mongo does not match a missing field with $lt, and every person starts
      // without this field — the naive query returns an empty backlog forever. This exact bug is
      // documented in the handoff because it has already cost a session.
      $nor: [{ enrichAttempts: { $gte: MAX_ENRICH_ATTEMPTS } }],
    })
    .sort({ lastSeen: -1 })
    .limit(limit)
    .toArray();

  for (const person of backlog) {
    stats.considered += 1;
    const profile = await fetchPersonProfile(person);

    if (!profile) {
      // Count the attempt either way. A person nobody can address is not retried forever just
      // because the reason was "no id" rather than "request failed".
      const addressable = person.platform === "hn" || Boolean(person.scope);
      if (!addressable) stats.unaddressable += 1;
      else stats.failed += 1;
      await people.updateOne({ fingerprint: person.fingerprint }, { $inc: { enrichAttempts: 1 } });
      continue;
    }

    // Only fields the platform actually returned. Spreading the profile wholesale would write
    // `undefined` over a value an earlier pass had already found.
    const set: Partial<PersonDoc> = { enrichedAt: new Date() };
    if (profile.displayName) set.displayName = profile.displayName;
    if (profile.bio) set.bio = profile.bio;
    if (profile.profileUrl) set.profileUrl = profile.profileUrl;
    if (typeof profile.accountAgeDays === "number") set.accountAgeDays = profile.accountAgeDays;
    if (typeof profile.reputation === "number") set.reputation = profile.reputation;
    if (typeof profile.platformPostCount === "number") set.platformPostCount = profile.platformPostCount;

    await people.updateOne({ fingerprint: person.fingerprint }, { $set: set });
    stats.enriched += 1;
  }

  return stats;
}
