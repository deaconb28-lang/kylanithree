import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { redditAuthMode } from "@/lib/search/reddit";

// One request that answers "which piece is actually broken?" — built because three failures at
// once (signup, Google sign-in, empty searches) are usually one or two root causes wearing
// different masks, and guessing at them from the outside is slow and wrong.
//
// Never returns a secret. Only presence, lengths, and sanitized error text. Safe to delete once
// the environment is stable; harmless to leave.
export const maxDuration = 20;
export const dynamic = "force-dynamic";

function present(name: string) {
  const v = process.env[name];
  return { set: Boolean(v && v.length > 0), length: v ? v.length : 0 };
}

export async function GET() {
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
  const origin = process.env.AUTH_URL || process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  checks.googleOAuth = {
    clientIdSet: Boolean(process.env.GOOGLE_CLIENT_ID),
    clientSecretSet: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    authSecretSet: Boolean(process.env.AUTH_SECRET),
    expectedRedirectUri: origin ? `${origin}/api/auth/callback/google` : "unknown — set AUTH_URL to your canonical https origin",
    note: "This exact URI must appear in Google Cloud Console → Credentials → Authorized redirect URIs.",
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

  const mongoOk = (checks.mongo as { ok: boolean }).ok;
  const anySource = Boolean((checks.reddit as { reachable?: boolean }).reachable || (checks.hackerNews as { reachable?: boolean }).reachable);

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
