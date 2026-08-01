import { NextRequest, NextResponse } from "next/server";
import { track, type EventName, type Flow } from "@/lib/discover/analytics";

// Client-reported funnel events.
//
// Only the events that genuinely cannot be observed server-side belong here — a view, a first
// interaction, a click on the save gate. Everything with a timing the server owns (first lead,
// pass one, completion) is emitted by the stream, where the clock is trustworthy.
//
// The endpoint is public, like the rest of the discover flow, so the name is checked against an
// allowlist rather than written through. An open funnel would otherwise be one curl away from
// having any event name in it, and the whole point of this instrumentation is to be able to
// believe the numbers it produces.
export const maxDuration = 10;

// `first_lead_shown` is in here, rather than emitted by the stream that knows exactly when the lead
// was found, on purpose: it is measured in the browser in both flows so the two are on the same
// clock. The legacy flow has no stream to measure from at all, and a server clock would start when
// the run does — omitting the request and the navigation the person also waited through.
const CLIENT_EVENTS: EventName[] = ["landing_view", "discover_view", "first_lead_shown", "first_interaction", "save_clicked"];

// The legacy flow has no single run row, so these have nowhere else to come from there. Accepting
// them from the client only for that flow keeps the new funnel's numbers server-owned while still
// making the old one measurable — which is the entire reason it is still switched on.
const LEGACY_ONLY_EVENTS: EventName[] = ["url_submitted", "search_complete"];

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    anonId?: string;
    searchId?: string;
    name?: string;
    flow?: string;
    ms?: number;
  };

  const flow: Flow = body.flow === "legacy" ? "legacy" : "discover";
  const allowed = flow === "legacy" ? [...CLIENT_EVENTS, ...LEGACY_ONLY_EVENTS] : CLIENT_EVENTS;

  const name = allowed.find((e) => e === body.name);
  if (!name || !body.anonId) return NextResponse.json({ ok: false }, { status: 400 });

  // `track` swallows its own failures by design, so there is nothing here that can fail the call.
  await track({
    anonId: body.anonId,
    searchId: body.searchId,
    name,
    flow,
    ms: typeof body.ms === "number" && body.ms >= 0 ? Math.round(body.ms) : undefined,
  });

  return NextResponse.json({ ok: true });
}
