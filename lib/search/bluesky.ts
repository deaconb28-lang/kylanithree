import type { Candidate } from "./types";

// Bluesky via the AT Protocol. This is the closest legitimate substitute for the short-form
// public complaints that Reddit and X would otherwise supply — the same class of signal, obtained
// through a door the platform actually leaves open rather than by scraping one that is shut.
//
// It does need a session: searchPosts answers 403 unauthenticated from a datacenter IP, which was
// confirmed against production rather than assumed. A Bluesky account and an app password are free
// and take a minute, so the cost is setup friction, not money or approval.

const PDS = "https://bsky.social";

// searchPosts returns 403 unauthenticated from a datacenter IP — confirmed against production, not
// assumed. A session fixes it, and a Bluesky account plus an app password are free and take a
// minute to create, so this stays a legitimate source rather than something to work around.
// Without credentials the source reports itself unavailable instead of silently contributing zero.
type TokenCache = { jwt: string; expiresAt: number };
let tokenCache: TokenCache | null = null;
/**
 * The login in progress, shared by every caller that arrives while it is running.
 *
 * Without this, twenty standing queries becoming due in the same tick means twenty simultaneous
 * `createSession` calls against one app password. That is what happened the first time credentials
 * were set: eleven 401s in four seconds, then 429 for the rest, because nothing was caching a
 * FAILURE and every source retried the login on its own. Bluesky rate-limits failed logins hard,
 * and an account that keeps hammering it gets locked out — so the login is a single shared
 * operation, not a per-caller one.
 */
let inFlight: Promise<string | null> | null = null;
/** Set when a login has failed in a way that retrying immediately cannot fix. */
let blockedUntil = 0;
let blockedReason = "";
let warnedShape = false;

/** How long to stop trying after a login failure, by cause. */
const COOLDOWN_MS: Record<"credentials" | "ratelimit" | "transient", number> = {
  // A 401 will never fix itself by being retried — the value has to change, which means a redeploy,
  // which resets this module anyway. A long cooldown here costs nothing and protects the account.
  credentials: 30 * 60_000,
  ratelimit: 15 * 60_000,
  transient: 60_000,
};

export function hasBlueskyCredentials() {
  return Boolean(process.env.BLUESKY_IDENTIFIER && process.env.BLUESKY_APP_PASSWORD);
}

/**
 * Check the SHAPE of the credentials and say what looks wrong, without ever printing them.
 *
 * A 401 from `createSession` says only "no". These are the three ways it has actually been gotten
 * wrong, all of which are visible without knowing the secret: an identifier copied from a profile
 * page with its leading `@`, whitespace picked up by a copy-paste, and the main account password
 * used where an app password is required. Turning an opaque 401 into "your identifier starts with
 * @" is the difference between a fix and a guessing game.
 */
export function blueskyCredentialProblems(): string[] {
  const id = process.env.BLUESKY_IDENTIFIER ?? "";
  const pw = process.env.BLUESKY_APP_PASSWORD ?? "";
  const problems: string[] = [];

  if (id !== id.trim() || pw !== pw.trim()) {
    problems.push("one of the values has leading or trailing whitespace — re-paste it without the stray space or newline");
  }
  if (id.trim().startsWith("@")) {
    problems.push('BLUESKY_IDENTIFIER starts with "@" — use the bare handle, e.g. name.bsky.social');
  }
  const bareId = id.trim().replace(/^@/, "");
  // A handle is a domain, an email has an @, a DID starts with did:. Anything else is neither.
  if (bareId && !bareId.includes(".") && !bareId.includes("@") && !bareId.startsWith("did:")) {
    problems.push(`BLUESKY_IDENTIFIER does not look like a handle, email or DID (got ${bareId.length} chars, no dot)`);
  }
  // App passwords are issued as four groups of four, e.g. abcd-efgh-ijkl-mnop. The main account
  // password is accepted by createSession only when the account has no second factor, so a value
  // in any other shape is the single most likely cause of a 401 here.
  if (pw.trim() && !/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i.test(pw.trim())) {
    problems.push(
      "BLUESKY_APP_PASSWORD is not in the xxxx-xxxx-xxxx-xxxx shape Bluesky issues app passwords in — " +
        "if this is the main account password, replace it with an app password from " +
        "Settings > Privacy and Security > App Passwords",
    );
  }
  return problems;
}

/**
 * The session token, shared with the ingest crawler.
 *
 * Exported so `lib/ingest/sources/bluesky.ts` reuses this cache rather than keeping its own. Two
 * modules calling `createSession` against one app password is how an account gets rate-limited on
 * login — and the crawler runs every few minutes forever, so it would be the one to trip it.
 */
export async function blueskySessionJwt(): Promise<string | null> {
  return getSessionJwt();
}

async function getSessionJwt(): Promise<string | null> {
  if (!hasBlueskyCredentials()) return null;
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.jwt;
  // Fail fast and without a network call while cooling down. The caller still gets an error, so the
  // source is still recorded as failing rather than silently returning zero — it just stops costing
  // the account a login attempt to find that out.
  if (Date.now() < blockedUntil) throw new Error(blockedReason);
  if (inFlight) return inFlight;

  inFlight = createSession().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function createSession(): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: (process.env.BLUESKY_IDENTIFIER ?? "").trim(),
        password: (process.env.BLUESKY_APP_PASSWORD ?? "").trim(),
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    blockedUntil = Date.now() + COOLDOWN_MS.transient;
    blockedReason = `Bluesky session unreachable: ${err instanceof Error ? err.message : err}`;
    throw new Error(blockedReason);
  }

  if (!res.ok) {
    const credentialFailure = res.status === 400 || res.status === 401;
    const kind = credentialFailure ? "credentials" : res.status === 429 ? "ratelimit" : "transient";
    blockedUntil = Date.now() + COOLDOWN_MS[kind];

    if (credentialFailure) {
      const problems = blueskyCredentialProblems();
      blockedReason =
        `Bluesky rejected the credentials (${res.status}). ` +
        (problems.length > 0 ? problems.join("; ") : "the handle and app password do not match an account");
      // Once per cooldown, not once per source: twenty identical stack traces is how a specific,
      // fixable message gets lost in the log.
      if (!warnedShape) {
        warnedShape = true;
        console.error(`[bluesky] ${blockedReason}`);
      }
    } else {
      blockedReason = `Bluesky session failed: ${res.status}`;
    }
    throw new Error(blockedReason);
  }

  const json = (await res.json()) as { accessJwt?: string };
  if (!json.accessJwt) {
    blockedUntil = Date.now() + COOLDOWN_MS.transient;
    blockedReason = "Bluesky session response had no accessJwt";
    throw new Error(blockedReason);
  }
  // A good login clears whatever went wrong before it.
  blockedUntil = 0;
  blockedReason = "";
  warnedShape = false;
  // Access tokens are short-lived; refresh well inside their window rather than tracking exp.
  tokenCache = { jwt: json.accessJwt, expiresAt: Date.now() + 60 * 60 * 1000 };
  return tokenCache.jwt;
}

type BskyPost = {
  uri?: string;
  author?: { handle?: string; displayName?: string };
  record?: { text?: string; createdAt?: string };
  replyCount?: number;
  likeCount?: number;
  repostCount?: number;
};

export async function searchBluesky(opts: {
  query: string;
  windowDays: number;
  limit?: number;
  timeoutMs?: number;
  // Accepted for parity. Bluesky paginates by cursor, so deeper waves widen by phrase and by a
  // larger page size rather than by page number.
  page?: number;
}): Promise<Candidate[]> {
  const { query, windowDays, limit = 25, timeoutMs = 4000 } = opts;

  const qs = new URLSearchParams({
    q: query,
    limit: String(Math.min(Math.max(limit, 1), 100)),
    sort: "latest",
    // The API accepts an ISO date floor, so the relevance window is enforced at the source rather
    // than by fetching everything and discarding most of it.
    since: new Date(Date.now() - windowDays * 86_400_000).toISOString(),
  });

  const jwt = await getSessionJwt();
  if (!jwt) return [];

  const res = await fetch(`${PDS}/xrpc/app.bsky.feed.searchPosts?${qs}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${jwt}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Bluesky search failed: ${res.status}`);

  const json = (await res.json()) as { posts?: BskyPost[] };

  return (json.posts ?? [])
    .filter((p): p is BskyPost => Boolean(p?.uri && p.author?.handle && p.record?.text))
    .map((p) => {
      // at://did:plc:xxx/app.bsky.feed.post/RKEY — the record key is the last segment, and is what
      // the web permalink is built from.
      const rkey = (p.uri as string).split("/").pop() ?? "";
      const handle = p.author?.handle as string;
      return {
        id: `bsky:${rkey}`,
        venueId: "bsky:all",
        venueName: "Bluesky",
        platform: "X" as const,
        // Displayed as "X" because that union has no Bluesky member and short-form is the closest
        // shape — but it is NOT X, and fingerprinting it as one would merge two networks' handles.
        networkId: "bluesky",
        author: `@${handle}`,
        permalink: `https://bsky.app/profile/${handle}/post/${rkey}`,
        postedAt: new Date(p.record?.createdAt ?? Date.now()),
        title: "",
        body: (p.record?.text ?? "").slice(0, 4000),
        score: p.likeCount ?? 0,
        numComments: p.replyCount ?? 0,
      };
    });
}
