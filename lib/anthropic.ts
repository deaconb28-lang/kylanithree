import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

// Lazy so a missing key surfaces as a normal thrown error inside whichever route calls this
// (catchable, JSON-able) instead of crashing the whole module at import time — the single most
// common cause of "Claude just doesn't work" on a fresh deploy is the key never being added to
// the hosting environment's variables, and that should produce a readable error, not an opaque 500.
export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it in your Vercel project's Environment Variables (or .env.local for dev).");
  }
  if (!client) client = new Anthropic();
  return client;
}
