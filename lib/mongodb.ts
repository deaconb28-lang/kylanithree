import { MongoClient } from "mongodb";

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function createClientPromise(): Promise<MongoClient> {
  // A rejected promise, not a thrown error — this can run at module load (auth.ts imports this
  // eagerly for the adapter), and throwing synchronously there would crash every route that
  // touches auth with an opaque, uncatchable 500. Rejecting instead means the failure only
  // surfaces when something actually awaits this (inside a route's own try/catch), producing a
  // clear "MONGODB_URI is not set" message instead of a mysterious connection timeout to
  // localhost — that was the previous, silent fallback for a missing env var.
  if (!process.env.MONGODB_URI) {
    return Promise.reject(
      new Error("MONGODB_URI is not set. Add it in your Vercel project's Environment Variables (or .env.local for dev)."),
    );
  }
  // The driver's default serverSelectionTimeoutMS is 30s — on Vercel that's longer than the
  // platform's own function timeout (10s on Hobby), so a real connectivity problem (Atlas
  // Network Access not allowing Vercel's IPs, a paused cluster, a bad URI) used to get killed by
  // the platform before the driver ever produced its own clear MongoServerSelectionError. Failing
  // fast here means that error actually reaches our catch blocks and gets logged.
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  return client.connect();
}

let moduleCache: Promise<MongoClient> | undefined;

/**
 * The connection, created once and reused — but a FAILED connection is never kept.
 *
 * This used to be a single promise built at module load. A serverless instance stays warm for
 * minutes across many requests, so one transient failure at the moment that instance happened to
 * start — an Atlas failover, a cold-start race, Network Access briefly denying — was cached as a
 * rejected promise and replayed to every later request on that instance, with no path back to a
 * working state short of the instance being recycled. Nothing else was wrong by then; the
 * connection simply never got a second attempt.
 *
 * That failure is particularly cruel through Auth.js, which reports any adapter error as
 * `?error=Configuration` — so a database that recovered seconds later still reads, to the person
 * signing in and to whoever is debugging it, as a permanently misconfigured app.
 *
 * Dropping the cache on rejection means the next caller reconnects. A connection that succeeds is
 * still made exactly once; only failure is retried.
 */
function connection(): Promise<MongoClient> {
  const cached = process.env.NODE_ENV === "development" ? global._mongoClientPromise : moduleCache;
  if (cached) return cached;

  const fresh = createClientPromise();
  if (process.env.NODE_ENV === "development") global._mongoClientPromise = fresh;
  else moduleCache = fresh;

  fresh.catch(() => {
    // Also swallows the rejection so an unhandled-rejection crash cannot take the process down
    // before a caller awaits it. Every caller still sees the rejection from their own await.
    if (process.env.NODE_ENV === "development") {
      if (global._mongoClientPromise === fresh) global._mongoClientPromise = undefined;
    } else if (moduleCache === fresh) {
      moduleCache = undefined;
    }
  });

  return fresh;
}

/**
 * Passed to MongoDBAdapter as a function rather than a promise, deliberately: the adapter calls it
 * per operation, so a sign-in after a failed connection gets a fresh attempt instead of the
 * rejection that was captured whenever this module first loaded.
 */
export default connection;

export async function getDb() {
  const client = await connection();
  return client.db("kylani");
}
