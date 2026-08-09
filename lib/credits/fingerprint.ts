import { createHash } from "node:crypto";

// A stable identity for one person, so an account is charged for them exactly once, ever.
//
// "Charged once, lifetime" is one of the published promises, and it only holds if the same human
// hashes to the same value across runs, across sources, and across whatever the search happens to
// call them this time. Hence normalising aggressively before hashing.

function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return trimmed;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  // Gmail ignores dots and anything after a plus, so the same inbox has infinite spellings. Not
  // collapsing them would let one person be charged for repeatedly.
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `${local.split("+")[0].replace(/\./g, "")}@gmail.com`;
  }
  return `${local.split("+")[0]}@${domain}`;
}

function normalizeHandle(handle: string): string {
  return handle
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    // Reddit hands back both "u/name" and "name" depending on the endpoint; Lemmy uses "@instance".
    .replace(/^(u\/|\/u\/)/, "")
    .split("@")[0];
}

/**
 * Stable hash of a person. An email wins when we have one, because the same human reached on two
 * platforms is still one person and one charge; otherwise it is platform + handle, which is the
 * strongest identity a public post gives us.
 *
 * Returns null when there is nothing stable to key on — the caller must then treat the lead as
 * uncharged rather than inventing an identity for it.
 */
export function personFingerprint(person: {
  email?: string | null;
  platform?: string | null;
  authorHandle?: string | null;
}): string | null {
  const basis = person.email
    ? `email:${normalizeEmail(person.email)}`
    : person.authorHandle && person.platform
      ? `handle:${(person.platform || "").trim().toLowerCase()}:${normalizeHandle(person.authorHandle)}`
      : null;
  if (!basis) return null;
  return createHash("sha256").update(basis).digest("hex").slice(0, 32);
}
