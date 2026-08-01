import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { redditAuthMode } from "@/lib/search/reddit";
import { hasBlueskyCredentials, searchBluesky } from "@/lib/search/bluesky";
import { webSearchProvider } from "@/lib/search/websearch";

// One request that answers "which piece is actually broken?" — built because three failures at
// once (signup, Google sign-in, empty searches) are usually one or two root causes wearing
// different masks, and guessing at them from the outside is slow and wrong.
//
// Never returns a secret. Only presence, lengths, and sanitized error text. Safe to delete once
// the environment is stable; harmless to leave.
export const maxDuration = 30;
export const dynamic = "force-dynamic";

function present(name: string) {
  const v = process.env[name];
  return { set: Boolean(v && v.length > 0), length: v ? v.length : 0 };
}

export async function GET(req: NextRequest) {
  const checks: Record<string, unknown> = {};

  // --- env presence -------------------------------------------------------
  checks.env = {
    MONGODB_URI: present("MONGODB_URI"),
    AUTH_SECRET: present("AUTH_SECRET"),
    GOOGLE_CLIENT_ID: present("GOOGLE_CLIENT_ID"),
    GOOGLE_CLIENT_SECRET: present("GOOGLE_CLIENT_SECRET"),
    ANTHROPIC_API_KEY: present("ANTHROPIC_API_KEY"),
    REDDIT_CLIENT_ID: present("REDDIT_CLIENT_ID"),
    REDDIT_CLIENT_SECRET: present("REDDIT_CLIENT_SECRET"),
    RESEND_API_KEY: present("RESEND_API_KEY"),
    STACKEXCHANGE_KEY: present("STACKEXCHANGE_KEY"),
    BLUESKY_IDENTIFIER: present("BLUESKY_IDENTIFIER"),
    BLUESKY_APP_PASSWORD: present("BLUESKY_APP_PASSWORD"),
    X_BEARER_TOKEN: present("X_BEARER_TOKEN"),
    BRAVE_SEARCH_API_KEY: present("BRAVE_SEARCH_API_KEY"),
    // Auth.js derives its callback URL from these when behind a proxy; a wrong value is a very
    // common cause of an OAuth redirect_uri mismatch.
    AUTH_URL: present("AUTH_URL"),
    NEXTAUTH_URL: present("NEXTAUTH_URL"),
    VERCEL_URL: process.env.VERCEL_URL ?? null,
    NODE_ENV: process.env.NODE_ENV ?? null,
  };

  // --- mongo reachability -------------------------------------------------
  // This is the check that matters most: BOTH email signup and Google sign-in write through the
  // same client, so an unreachable Atlas presents as two unrelated-looking auth bugs.
  const t0 = Date.now();
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    const users = await db.collection("users").estimatedDocumentCount();
    checks.mongo = { ok: true, ms: Date.now() - t0, database: "kylani", userCount: users };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    checks.mongo = {
      ok: false,
      ms: Date.now() - t0,
      error: message.slice(0, 400),
      // The overwhelmingly common cause on Vercel: Atlas Network Access denies by default and
      // serverless functions call from rotating IPs, so nothing but 0.0.0.0/0 reliably works.
      likelyCause: /ServerSelection|ETIMEDOUT|ENOTFOUND|timed out/i.test(message)
        ? "Atlas Network Access is probably blocking Vercel. Allow 0.0.0.0/0 in Atlas → Network Access."
        : /auth|password|credential/i.test(message)
          ? "MONGODB_URI credentials look wrong, or the DB user lacks readWrite on `kylani`."
          : /MONGODB_URI is not set/i.test(message)
            ? "MONGODB_URI is missing from this environment in Vercel."
            : "Unrecognized — see the raw error above.",
    };
  }

  // --- google oauth wiring ------------------------------------------------
  // Auth.js only ever calls back to <origin>/api/auth/callback/google. If that exact string is
  // not in the Google Console's Authorized redirect URIs, sign-in fails at the redirect.
  // Derived from the ACTUAL request host, because that is what Auth.js uses with trustHost — an
  // env-var guess here was misleading, since VERCEL_URL is a per-deployment hostname.
  const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const configuredOrigin = process.env.AUTH_URL || process.env.NEXTAUTH_URL || null;
  const liveOrigin = configuredOrigin || (forwardedHost ? `https://${forwardedHost}` : null);
  const deploymentOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  checks.googleOAuth = {
    clientIdSet: Boolean(process.env.GOOGLE_CLIENT_ID),
    clientSecretSet: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    authSecretSet: Boolean(process.env.AUTH_SECRET),
    requestHost: forwardedHost,
    authUrlConfigured: configuredOrigin,
    redirectUriForThisRequest: liveOrigin ? `${liveOrigin}/api/auth/callback/google` : "unknown",
    warning:
      !configuredOrigin && deploymentOrigin
        ? `AUTH_URL is not set. Auth.js will follow whichever host the browser used, and a visit to the per-deployment URL (${deploymentOrigin}) produces a redirect_uri Google cannot have registered, because that hostname changes every deploy. Set AUTH_URL to your canonical origin.`
        : null,
    note: "Whichever URI is listed above must appear verbatim in Google Cloud Console → Credentials → Authorized redirect URIs.",
  };

  // --- reddit -------------------------------------------------------------
  const redditT0 = Date.now();
  let reddit: Record<string, unknown> = { mode: redditAuthMode() };
  try {
    const res = await fetch("https://www.reddit.com/subreddits/search.json?q=test&limit=1&raw_json=1", {
      headers: { "User-Agent": process.env.REDDIT_USER_AGENT || "web:app.kylani.lead-search:v1.0" },
      signal: AbortSignal.timeout(6000),
    });
    reddit = { ...reddit, reachable: res.ok, status: res.status, ms: Date.now() - redditT0 };
    if (res.status === 403 || res.status === 429) {
      reddit.likelyCause = "Reddit is blocking unauthenticated requests from this IP. Register an app and set REDDIT_CLIENT_ID/SECRET.";
    }
  } catch (err) {
    reddit = { ...reddit, reachable: false, ms: Date.now() - redditT0, error: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
  }
  checks.reddit = reddit;

  // --- hacker news (the auth-free fallback source) ------------------------
  const hnT0 = Date.now();
  try {
    const res = await fetch("https://hn.algolia.com/api/v1/search_by_date?query=test&hitsPerPage=1", {
      signal: AbortSignal.timeout(6000),
    });
    checks.hackerNews = { reachable: res.ok, status: res.status, ms: Date.now() - hnT0 };
  } catch (err) {
    checks.hackerNews = { reachable: false, ms: Date.now() - hnT0, error: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
  }

  // --- lemmy (auth-free) --------------------------------------------------
  const lemmyT0 = Date.now();
  try {
    const res = await fetch("https://lemmy.world/api/v3/search?q=test&type_=Posts&limit=1", { signal: AbortSignal.timeout(6000) });
    checks.lemmy = { reachable: res.ok, status: res.status, ms: Date.now() - lemmyT0 };
  } catch (err) {
    checks.lemmy = { reachable: false, ms: Date.now() - lemmyT0, error: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
  }

  checks.x = process.env.X_BEARER_TOKEN
    ? { enabled: true, note: "X_BEARER_TOKEN present — recent search covers roughly the last 7 days." }
    : { enabled: false, note: "No X_BEARER_TOKEN. X has no free search API; reading posts requires a paid tier, so this source stays off." };

  // --- bluesky ------------------------------------------------------------
  // When credentials exist this runs a REAL authenticated search rather than an unauthenticated
  // probe, because that is the only thing that actually proves the app password works. Sandboxed
  // development cannot reach bsky.social, so this endpoint is where the credentials get verified.
  const bskyT0 = Date.now();
  if (hasBlueskyCredentials()) {
    try {
      const posts = await searchBluesky({ query: "spreadsheet", windowDays: 30, limit: 3, timeoutMs: 9000 });
      checks.bluesky = {
        credentialed: true,
        authenticated: true,
        ms: Date.now() - bskyT0,
        samplePosts: posts.length,
        note:
          posts.length > 0
            ? "App password works and search returned real posts."
            : "App password works, but this sample query matched nothing — not an error.",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      checks.bluesky = {
        credentialed: true,
        authenticated: false,
        ms: Date.now() - bskyT0,
        error: message.slice(0, 300),
        likelyCause: /session failed: 401|Invalid identifier or password/i.test(message)
          ? "BLUESKY_IDENTIFIER or BLUESKY_APP_PASSWORD is wrong. Use the full handle (e.g. name.bsky.social) and an APP password, not the account password."
          : /session failed: 429/i.test(message)
            ? "Rate limited while creating a session. Wait and retry."
            : "See the raw error above.",
      };
    }
  } else {
    checks.bluesky = {
      credentialed: false,
      note: "Set BLUESKY_IDENTIFIER and BLUESKY_APP_PASSWORD. Unauthenticated search is blocked from datacenter IPs, so this source stays off without them.",
    };
  }

  const seT0 = Date.now();
  try {
    const res = await fetch("https://api.stackexchange.com/2.3/info?site=stackoverflow", { signal: AbortSignal.timeout(6000) });
    checks.stackExchange = { reachable: res.ok, status: res.status, ms: Date.now() - seT0, keyed: Boolean(process.env.STACKEXCHANGE_KEY) };
  } catch (err) {
    checks.stackExchange = { reachable: false, ms: Date.now() - seT0, error: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
  }

  // Quora has no API — the source finds question URLs via web search and then fetches each page
  // itself, so what matters here is whether Quora serves us a page at all. It blocks datacenter IPs
  // aggressively, and when it does this source contributes nothing rather than degrading.
  const quoraT0 = Date.now();
  try {
    const res = await fetch("https://www.quora.com/", {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" },
      signal: AbortSignal.timeout(6000),
    });
    checks.quora = {
      reachable: res.ok,
      status: res.status,
      ms: Date.now() - quoraT0,
      note: res.ok ? undefined : "Quora is blocking this IP. The source will return nothing — it never falls back to model output.",
      needsWebSearch: webSearchProvider() === "none" ? "No web-search provider, so Quora question URLs cannot be found at all." : undefined,
    };
  } catch (err) {
    checks.quora = { reachable: false, ms: Date.now() - quoraT0, error: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
  }

  // --- open-web discovery -------------------------------------------------
  const provider = webSearchProvider();
  checks.webSearch = {
    provider,
    note:
      provider === "brave"
        ? "Brave key present — direct HTTP search, fastest option."
        : provider === "anthropic"
          ? "Using the Anthropic web_search tool. No extra vendor needed; slower, but venue discovery is cached 30 days per niche."
          : "No provider. Independent forums will not be discovered — only Reddit, HN, and Lemmy are searched.",
    context: "Google Custom Search is closed to new customers and Bing Search was retired in Aug 2025, so Anthropic or Brave are the realistic choices.",
  };

  const mongoOk = (checks.mongo as { ok: boolean }).ok;
  const anySource = Boolean(
    (checks.reddit as { reachable?: boolean }).reachable ||
      (checks.hackerNews as { reachable?: boolean }).reachable ||
      (checks.lemmy as { reachable?: boolean }).reachable ||
      (checks.bluesky as { reachable?: boolean }).reachable ||
      (checks.stackExchange as { reachable?: boolean }).reachable ||
      (checks.quora as { reachable?: boolean }).reachable,
  );

  return NextResponse.json(
    {
      summary: {
        signupAndGoogleSignIn: mongoOk ? "should work" : "BROKEN — Mongo unreachable, see checks.mongo",
        leadSearch: !process.env.ANTHROPIC_API_KEY
          ? "BROKEN — ANTHROPIC_API_KEY missing"
          : anySource
            ? "sources reachable"
            : "BROKEN — no lead source reachable, see checks.reddit / checks.hackerNews",
      },
      checks,
      generatedAt: new Date().toISOString(),
    },
    { status: 200 },
  );
}
