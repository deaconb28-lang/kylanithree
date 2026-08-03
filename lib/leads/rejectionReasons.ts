// The reason vocabulary, with no database in it.
//
// Split out of `rejections.ts` because the inline reason row is a client component, and importing
// the collection helpers pulled `lib/mongodb` — and therefore the whole Node `mongodb` driver, tls
// and dns included — into the browser bundle. The build fails outright rather than shipping it,
// which is the correct outcome, but the fix belongs here: constants the UI needs live in a module
// that touches nothing server-only.

export type RejectionReason =
  | "wrong_role"
  | "wrong_problem"
  | "wrong_company_size"
  | "bad_source"
  | "not_interested";

export const REJECTION_REASONS: RejectionReason[] = [
  "wrong_role",
  "wrong_problem",
  "wrong_company_size",
  "bad_source",
  "not_interested",
];

/** Sentence case, verb-free, short enough to sit in a row of five on a phone. */
export const REJECTION_REASON_LABELS: Record<RejectionReason, string> = {
  wrong_role: "Wrong role",
  wrong_problem: "Wrong problem",
  wrong_company_size: "Wrong company size",
  bad_source: "Bad source",
  not_interested: "Just not interested",
};
