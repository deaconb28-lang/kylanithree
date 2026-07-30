import { MongoClient } from "mongodb";

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function createClientPromise(): Promise<MongoClient> {
  // A rejected promise, not a thrown error — this runs at module load (imported eagerly by
  // auth.ts for the adapter), and throwing synchronously here would crash every route that
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

let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  if (!global._mongoClientPromise) {
    global._mongoClientPromise = createClientPromise();
  }
  clientPromise = global._mongoClientPromise;
} else {
  clientPromise = createClientPromise();
}

// A rejected promise with no attached handler crashes the Node process on the next tick
// (unhandled rejection) — this runs at module load, well before any request awaits it, so
// without this it would take the whole server down instead of failing one request at a time.
// This extra handler doesn't consume the rejection: every other `await clientPromise` below
// still sees it.
clientPromise.catch(() => {});

export default clientPromise;

export async function getDb() {
  const client = await clientPromise;
  return client.db("kylani");
}
