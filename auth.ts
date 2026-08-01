import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import clientPromise from "./lib/mongodb";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: MongoDBAdapter(clientPromise, { databaseName: "kylani" }),
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
  },
});
