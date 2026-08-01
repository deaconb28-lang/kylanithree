import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import mongoConnection from "./lib/mongodb";

/**
 * Names, at cold start, whatever would make Auth.js refuse to run.
 *
 * `?error=Configuration` is the least informative error this app can produce: Auth.js uses it both
 * for a config it rejected up front and, separately, for any non-client-safe error thrown during
 * the callback — a database that cannot be reached being the usual one. The code alone cannot tell
 * those apart, and neither could we, so the two are distinguished here instead of guessed at later.
 *
 * Only presence is ever logged, never a value. Vercel's function logs are not a secret store.
 */
function logAuthConfigProblems(): void {
  // The only two names Auth.js will read a secret from. Missing means it rejects every auth
  // request before a provider is even consulted, so sign-in fails without Google being involved.
  if (!process.env.AUTH_SECRET && !process.env.NEXTAUTH_SECRET) {
    console.error(
      "[auth] AUTH_SECRET is not set. Auth.js rejects every request without it and the browser is " +
        "sent to ?error=Configuration before Google is ever reached. Set AUTH_SECRET in the Vercel " +
        "project's Environment Variables for the Production environment specifically — a variable " +
        "scoped only to Preview does not exist on the production deployment.",
    );
  }
  // These have a fallback: Auth.js fills an absent clientId/clientSecret from AUTH_GOOGLE_ID and
  // AUTH_GOOGLE_SECRET, so either naming works and only having neither is a fault.
  if (!process.env.GOOGLE_CLIENT_ID && !process.env.AUTH_GOOGLE_ID) {
    console.error("[auth] Neither GOOGLE_CLIENT_ID nor AUTH_GOOGLE_ID is set — the Google provider has no client id.");
  }
  if (!process.env.GOOGLE_CLIENT_SECRET && !process.env.AUTH_GOOGLE_SECRET) {
    console.error("[auth] Neither GOOGLE_CLIENT_SECRET nor AUTH_GOOGLE_SECRET is set — the Google provider has no client secret.");
  }
  if (!process.env.MONGODB_URI) {
    console.error(
      "[auth] MONGODB_URI is not set. Sign-in reaches Google and then fails on the way back, because " +
        "the adapter has nowhere to record the account — which also surfaces as ?error=Configuration.",
    );
  }
}

logAuthConfigProblems();

export const { handlers, auth, signIn, signOut } = NextAuth({
  // A function, not a promise. The adapter calls it per operation, so a sign-in that lands after
  // a failed connection gets a fresh attempt — passing a promise captured at module load meant one
  // transient Atlas failure was replayed to every later request on that warm instance, and Auth.js
  // reports every adapter error as ?error=Configuration, so it read as a permanently broken app.
  adapter: MongoDBAdapter(mongoConnection, { databaseName: "kylani" }),
  // Vercel terminates TLS at its proxy, so the origin Auth.js should use lives in the forwarded
  // host header, not in VERCEL_URL — which is a per-DEPLOYMENT hostname
  // (kylani-8us1c5o0c-kylani.vercel.app) that changes on every push and can never be registered
  // in Google Console. Without this, the OAuth redirect_uri never matches what Google has on file
  // and sign-in fails at the callback. Set AUTH_URL to the canonical origin as well to remove any
  // remaining ambiguity.
  trustHost: true,
  // Google is the only way in. Email/password was removed: it meant maintaining a password store,
  // a reset flow and a second class of "wrong password" failure, all to reach the same Google
  // account most founders were going to use anyway — and Gmail sending needs a Google OAuth grant
  // regardless, so a password account could never actually send anything.
  //
  // JWT sessions are kept rather than switching to database sessions: the session shape, the
  // `token.id` callback below and every `requireUserId()` call site depend on it, and there is no
  // benefit to churning that.
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Deliberately basic scopes only (openid/email/profile) for now — no `gmail.send`. That
      // scope is "sensitive" in Google's OAuth verification model, which means the consent screen
      // can only be published "In production" (usable by any Google account, not just allow-listed
      // test users) after Google reviews and approves the app for it. Basic scopes need no review
      // at all, so dropping this unblocks real sign-in immediately; Gmail sending is off until the
      // scope (and the verification that comes with it) is added back deliberately. Re-add
      // `https://www.googleapis.com/auth/gmail.send` to the scope string (plus
      // access_type: "offline", prompt: "consent" for a refresh token) when that's ready.
      authorization: {
        params: {
          scope: "openid email profile",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        (session.user as typeof session.user & { id: string }).id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/signin",
    // Without this, a failure lands on Auth.js's own /api/auth/error page — an unstyled page whose
    // entire content is a code like "Configuration", which tells a founder nothing and looks like
    // the product broke in a way nobody noticed. /signin already turns every code Auth.js can send
    // into a plain sentence, so failures go back to the page they came from. It requires no
    // session itself, so this cannot produce the redirect loop Auth.js guards against.
    error: "/signin",
  },
});
