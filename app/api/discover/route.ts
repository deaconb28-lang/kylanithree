import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Searches, ensureDiscoverIndexes } from "@/lib/discover/collections";
import { ensureNicheMapIndexes } from "@/lib/discover/nicheMap";
import { track } from "@/lib/discover/analytics";
import { toUserError } from "@/lib/apiError";

// Start a discover run. Writes a row, returns an id. Nothing else.
//
// Target under 300ms, and the way that is achieved is by doing NO work here — no fetch, no model
// call, no search. Principle 1 of the architecture: nothing is crawled inside a request. All of the
// actual work happens on the stream, which is a long-lived response rather than a request the user
// is waiting on with a spinner.
//
// Deliberately unauthenticated. The entire point of the rebuild is that value arrives before an
// account does, so a search belongs to a browser-held id until someone chooses to save it.
export const maxDuration = 15;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      url?: string;
      sentence?: string;
      anonId?: string;
    };

    const url = body.url?.trim();
    const sentence = body.sentence?.trim();
    if (!url && !sentence) {
      return NextResponse.json({ error: "Paste a URL, or describe what you're building in a sentence." }, { status: 400 });
    }

    // Cheap and idempotent; both no-op once the indexes exist. Doing it here rather than at module
    // load keeps a cold start from paying for it on every route.
    await Promise.all([ensureDiscoverIndexes(), ensureNicheMapIndexes()]).catch(() => {});

    const searchId = randomUUID();
    const anonId = body.anonId || randomUUID();
    const searches = await Searches();

    await searches.insertOne({
      searchId,
      productUrl: url,
      productSentence: sentence,
      status: "queued",
      leads: [],
      narration: [],
      communitiesScanned: 0,
      communitiesTotal: 0,
      startedAt: new Date(),
    });

    await track({ anonId, name: "url_submitted", flow: "discover", searchId, props: { hasUrl: Boolean(url) } });

    return NextResponse.json({ searchId, anonId }, { status: 202 });
  } catch (err) {
    const message = toUserError("discover", err, "Couldn't start the search. Try again in a moment.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
