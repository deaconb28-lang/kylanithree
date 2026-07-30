import { createHmac } from "crypto";

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set.");
  return s;
}

function sign(leadId: string) {
  return createHmac("sha256", secret()).update(leadId).digest("hex").slice(0, 32);
}

export function signUnsubscribeToken(leadId: string): string {
  return `${leadId}.${sign(leadId)}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const [leadId, sig] = token.split(".");
  if (!leadId || !sig) return null;
  return sig === sign(leadId) ? leadId : null;
}
