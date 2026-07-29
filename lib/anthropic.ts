import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

// The SDK sends this key as a raw HTTP header, which the fetch spec restricts to byte values
// 0-255 — a stray bullet, smart quote, or other character picked up when the key was copied into
// an environment variable UI throws deep inside the HTTP client as an opaque
// "Cannot convert argument to a ByteString..." error. Catching it here up front turns that into a
// message that actually says what's wrong and how to fix it.
function assertHeaderSafe(name: string, value: string) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code > 255) {
      throw new Error(
        `${name} contains a character that isn't valid in an HTTP header (found code point ${code} at position ${i}). ` +
          "This usually means a stray bullet, smart quote, or other special character got copied in by accident — " +
          "re-copy the key from the Anthropic console and re-paste it into your environment variables.",
      );
    }
  }
}

// Lazy so a missing key surfaces as a normal thrown error inside whichever route calls this
// (catchable, JSON-able) instead of crashing the whole module at import time — the single most
// common cause of "Claude just doesn't work" on a fresh deploy is the key never being added to
// the hosting environment's variables, and that should produce a readable error, not an opaque 500.
export function getAnthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it in your Vercel project's Environment Variables (or .env.local for dev).");
  }
  assertHeaderSafe("ANTHROPIC_API_KEY", apiKey);
  if (!client) client = new Anthropic({ apiKey });
  return client;
}
