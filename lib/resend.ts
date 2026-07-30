import { Resend } from "resend";

let client: Resend | null = null;

// Lazy singleton, same pattern as lib/anthropic.ts's getAnthropic() — throws a clear error only
// when actually called (not at module load), so it's always inside a route's own try/catch.
export function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set. Add it in your Vercel project's Environment Variables (or .env.local for dev).");
  }
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

export const FROM_EMAIL = "Deacon at Kylani <deacon@kylani.app>";
