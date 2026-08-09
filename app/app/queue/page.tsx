import { redirect } from "next/navigation";

// Queue and Today were the same object — a person plus a drafted message — split by recency, which
// is not something a founder can act on. They are one list now, at /campaign/work. The filter
// carries over so a link to a filtered queue still lands on the same slice.
export default async function QueueRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; claim?: string }>;
}) {
  const { filter, claim } = await searchParams;
  const qs = new URLSearchParams();
  if (filter) qs.set("filter", filter);
  // /discover hands off to the queue with ?claim=<searchId> after sign-in; dropping it would lose
  // an anonymous run at the last step.
  if (claim) qs.set("claim", claim);
  const suffix = qs.toString();
  redirect(`/campaign/work${suffix ? `?${suffix}` : ""}`);
}
