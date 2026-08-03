import { PermanentSourceError } from "../errors";
import type { RawDocument } from "../normalize";

// GitHub issue search — open, free, full-text, and every hit carries an addressable public profile.
//
// The strongest source added since Stack Exchange, and the only one in the registry that needs no
// credential of any kind: `/search/issues` answered 200 unauthenticated from this sandbox with
// 4,688 hits for a single problem phrase. A token raises the limits but is not required, which is
// what separates this from Reddit (blocked at the edge) and Bluesky (403 without a session).
//
// THE CRAWL UNIT IS A STANDING QUERY, like Bluesky and for the same reason: there is no set of
// "places" to enumerate. GitHub has 400 million repositories and the interesting axis is not which
// repo a complaint appears in, it is the language of the complaint. Each phrase is its own registry
// row, so a phrase that produces nothing sinks in the scheduler's yield ordering on its own.
//
// WHY ISSUES ARE GOOD LEADS. An issue is someone writing down a problem in detail, with their name
// on it, in public, timestamped — the exact shape this product looks for. The bias is toward
// technical buyers, which is a real limitation and is why this supplements rather than replaces the
// forum sources.

const API = "https://api.github.com";
const UA = "kylani-ingest/1.0 (+https://kylani.app)";

/**
 * Standing queries, in GitHub's search syntax.
 *
 * `in:body` matters — searching titles alone finds bug reports, while the sentence that reveals
 * somebody wants a tool is almost always in the body. `is:issue` excludes pull requests, which are
 * proposed changes rather than stated needs; the response is filtered on `pull_request` as well,
 * because the qualifier is not always sufficient.
 *
 * Phrases, not words, for the reason the Stack Exchange keyword routing had to learn twice: a bare
 * word like "tool" or "manual" matches most of GitHub. The test before adding one is whether the
 * sentence could plausibly appear in an issue that has nothing to do with wanting a product.
 */
export const GITHUB_STANDING_QUERIES: string[] = [
  '"looking for a tool" in:body is:issue',
  '"is there a tool" in:body is:issue',
  '"is there an alternative" in:body is:issue',
  '"any recommendations for" in:body is:issue',
  '"has anyone found a good" in:body is:issue',
  '"we currently use a spreadsheet" in:body is:issue',
  '"doing this manually" in:body is:issue',
  '"we do this manually" in:body is:issue',
  '"wish there was a way" in:body is:issue',
  '"there is no easy way to" in:body is:issue',
  '"we built our own" in:body is:issue',
  '"had to write a script" in:body is:issue',
  '"this is a pain to" in:body is:issue',
  '"migrating away from" in:body is:issue',
  '"switching away from" in:body is:issue',
  '"too expensive for our team" in:body is:issue',
  '"does not scale for us" in:body is:issue',
  '"spent hours trying to" in:body is:issue',
];

/** GitHub caps search at 1000 results, so page 10 at 100 per page is the last legal page. */
const MAX_PAGE = 10;

type GhUser = { login?: string; id?: number; type?: string };

type GhIssue = {
  id?: number;
  number?: number;
  title?: string;
  body?: string | null;
  html_url?: string;
  created_at?: string;
  comments?: number;
  user?: GhUser;
  repository_url?: string;
  pull_request?: unknown;
  reactions?: { total_count?: number };
  state?: string;
};

export type GithubPage = {
  documents: RawDocument[];
  nextCursor: string | null;
  exhausted: boolean;
};

/**
 * Issue bodies are markdown written by engineers, so they arrive full of things that are not prose.
 *
 * Fenced code, stack traces, logs and HTML comments are stripped before the body is stored. This is
 * not tidying: the lexical gate and the classifier both read this text, and an issue whose body is
 * 3,000 characters of stack trace around one sentence of complaint would be judged on the stack
 * trace. The embedding would be worse still — it would encode the language of the error rather than
 * the language of the need.
 *
 * Deliberately NOT destructive beyond that. Inline backticks stay, because "we use `cron` for this"
 * is a sentence about their setup and part of what they said.
 */
export function issueBodyToText(body: string | null | undefined): string {
  if (!body) return "";
  return body
    // Fenced code blocks, including the ```suggestion blocks GitHub inserts.
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    // <!-- issue template instructions --> — present in most bodies and written by the maintainer,
    // not the author. Leaving them in would attribute a template's words to a person.
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Indented code blocks: four leading spaces or a tab, which markdown treats as code.
    .replace(/^(?: {4}|\t).*$/gm, " ")
    // Collapsed <details> sections are almost always logs.
    .replace(/<details[\s\S]*?<\/details>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** `https://api.github.com/repos/owner/name` → `owner/name`, for the venue label. */
export function repoFromUrl(repositoryUrl: string | undefined): string | undefined {
  if (!repositoryUrl) return undefined;
  const m = /\/repos\/([^/]+\/[^/]+)$/.exec(repositoryUrl);
  return m ? m[1] : undefined;
}

/**
 * Why a `GITHUB_TOKEN` that is set might still not be usable, or null when it looks fine.
 *
 * A WRONG token is worse than no token here, and that is not hypothetical — it is how this function
 * came to exist. The sandbox that built this source has a 14-character `GITHUB_TOKEN` in its
 * environment; sending it turned a request that answers 200 unauthenticated into a hard 401. An
 * absent token costs throughput (10 search requests a minute instead of 30). A bad one costs the
 * entire source, and the error says "401" rather than "your token is wrong".
 *
 * Absent is therefore NOT a problem — unauthenticated access genuinely works, which is the whole
 * reason GitHub was chosen over Reddit — so this returns null for a missing token and complains
 * only about one that is present and malformed.
 */
export function githubTokenProblem(): string | null {
  const raw = process.env.GITHUB_TOKEN;
  if (!raw) return null;
  const token = raw.trim();
  if (!token) return null;
  // ghp_/gho_/ghu_/ghs_/ghr_ prefixed tokens, fine-grained github_pat_ tokens, or a legacy 40-char
  // hex PAT. Anything else is not a GitHub credential.
  const looksReal = /^(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|[0-9a-f]{40})$/.test(token);
  if (!looksReal) {
    return `GITHUB_TOKEN is set but is not shaped like a GitHub token (${token.length} chars). Ignoring it — unauthenticated search still works, at 10 requests a minute rather than 30.`;
  }
  return null;
}

/** The token, or null when there isn't a usable one. Never returns a value known to be malformed. */
export function githubToken(): string | null {
  if (githubTokenProblem()) return null;
  return process.env.GITHUB_TOKEN?.trim() || null;
}

let warnedBadToken = false;
let warnedRejectedToken = false;

export function githubAuthHeaders(useToken = true): Record<string, string> {
  const token = useToken ? githubToken() : null;
  const problem = githubTokenProblem();
  if (problem && !warnedBadToken) {
    warnedBadToken = true;
    console.error(`[github] ${problem}`);
  }
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": UA,
    // Pinning the API version stops a future default change altering the response shape underneath
    // the parser without any error to notice it by.
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * One page of one standing query.
 *
 * Sorted newest-first so the crawler tracks fresh issues rather than re-reading the same
 * highest-scoring ones forever, and paginated by page number because that is what the search API
 * offers — there is no opaque cursor here.
 */
export async function crawlGithub(opts: {
  query: string;
  cursor?: string | null;
  perPage?: number;
  timeoutMs?: number;
}): Promise<GithubPage> {
  const { query, cursor, perPage = 50, timeoutMs = 15_000 } = opts;
  const page = cursor ? Number(cursor) : 1;
  if (!Number.isFinite(page) || page < 1) return { documents: [], nextCursor: null, exhausted: true };
  // Past the cap GitHub returns 422 rather than an empty page, which the backoff would read as a
  // sick source. Stopping here restarts the query from page 1 on the next poll, which is what keeps
  // it tracking the live feed.
  if (page > MAX_PAGE) return { documents: [], nextCursor: null, exhausted: true };

  const qs = new URLSearchParams({
    q: query,
    sort: "created",
    order: "desc",
    per_page: String(Math.min(Math.max(perPage, 1), 100)),
    page: String(page),
  });

  let res = await fetch(`${API}/search/issues?${qs}`, {
    headers: githubAuthHeaders(),
    signal: AbortSignal.timeout(timeoutMs),
  });

  // A well-formed token that GitHub rejects — revoked, expired, or scoped wrong. Unauthenticated
  // search still works, so retry once without it rather than losing the source to a stale
  // credential. Loud, not silent: the fallback is announced, because a source quietly running at a
  // third of its rate limit is exactly the kind of thing nobody notices for months.
  if (res.status === 401) {
    if (!warnedRejectedToken) {
      warnedRejectedToken = true;
      console.error("[github] GITHUB_TOKEN was rejected (401) — falling back to unauthenticated search at 10 req/min. Replace or unset it.");
    }
    res = await fetch(`${API}/search/issues?${qs}`, {
      headers: githubAuthHeaders(false),
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  // 422 means the query itself is malformed — a phrase GitHub cannot parse will never parse, so the
  // row retires rather than failing forever. Distinct from the rate limit below, which is temporary.
  if (res.status === 422) {
    throw new PermanentSourceError(`GitHub rejected the query ${query} (422) — it will not parse on retry`);
  }
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    const resetAt = Number(res.headers.get("x-ratelimit-reset")) * 1000;
    const waitS = Number.isFinite(resetAt) ? Math.max(0, Math.round((resetAt - Date.now()) / 1000)) : null;
    throw new Error(
      `GitHub rate limit hit (${res.status}, remaining=${remaining ?? "?"}` +
        (waitS !== null ? `, resets in ${waitS}s` : "") +
        `)${process.env.GITHUB_TOKEN ? "" : " — set GITHUB_TOKEN to raise search from 10 to 30 req/min"}`,
    );
  }
  if (!res.ok) throw new Error(`GitHub search failed: ${res.status}`);

  const json = (await res.json()) as { items?: GhIssue[]; total_count?: number };
  const items = json.items ?? [];
  if (items.length === 0) return { documents: [], nextCursor: null, exhausted: true };

  const documents: RawDocument[] = [];
  for (const issue of items) {
    const login = issue.user?.login;
    if (!issue.id || !login || !issue.html_url) continue;
    // A pull request is a proposed change, not a stated need. `is:issue` usually excludes them but
    // the field is the authoritative signal.
    if (issue.pull_request) continue;
    // Bots file a great many issues and buy nothing. GitHub labels them on the account, so there is
    // no need to guess from the name — though the `[bot]` suffix is checked too, because some
    // automation runs under ordinary user accounts.
    if (issue.user?.type === "Bot" || login.endsWith("[bot]")) continue;

    const body = issueBodyToText(issue.body);
    if (!body) continue;

    documents.push({
      platform: "github",
      // The issue's global numeric id, not owner/repo#number — stable across repository renames and
      // transfers, both of which are common and would otherwise re-store the same issue.
      externalId: String(issue.id),
      url: issue.html_url,
      // GitHub logins are globally unique across one flat namespace, so there is nothing to qualify
      // them with — unlike Discourse and Lemmy.
      authorRef: login,
      authorScope: "all",
      // The numeric id, so enrichment survives the person renaming their account.
      authorId: issue.user?.id ? String(issue.user.id) : undefined,
      title: issue.title,
      body,
      postedAt: new Date(issue.created_at ?? Date.now()),
      engagement: { score: issue.reactions?.total_count ?? 0, comments: issue.comments ?? 0 },
    });
  }

  return { documents, nextCursor: String(page + 1), exhausted: false };
}
