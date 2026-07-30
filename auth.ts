import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import bcrypt from "bcryptjs";
import clientPromise, { getDb } from "./lib/mongodb";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: MongoDBAdapter(clientPromise, { databaseName: "kylani" }),
  // Credentials sign-in can't hydrate a database session (Auth.js persists
  // no session row for it), so the whole app runs on JWT sessions instead.
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
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined)?.trim().toLowerCase();
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        let db;
        try {
          db = await getDb();
        } catch (err) {
          // A real connectivity failure (bad/missing MONGODB_URI, Atlas Network Access blocking
          // Vercel, a paused cluster) — log the actual cause here so it's visible in Vercel's
          // function logs, then rethrow. Returning null instead would surface to the user as
          // "wrong password", which is wrong and would send them chasing the wrong problem.
          console.error("[auth/credentials] MongoDB unreachable:", err instanceof Error ? err.message : err);
          throw new Error("DatabaseUnavailable");
        }

        const user = await db.collection("users").findOne({ email });
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash as string);
        if (!valid) return null;

        return { id: user._id.toString(), email: user.email, name: user.name ?? null, image: user.image ?? null };
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
