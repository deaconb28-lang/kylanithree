import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/apiAuth";
import { claimSearch } from "@/lib/discover/claim";
import { track } from "@/lib/discover/analytics";
import { toUserError } from "@/lib/apiError";

// Attaching an anonymous run to the account that just signed in.
//
// The one place where the whole new flow either pays off or breaks its promise: the people already
// on screen become the people in the queue, and nothing else appears alongside them.
export const maxDuration = 30;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: searchId } = await ctx.params;

  try {
    const userId = await requireUserId();
    if (userId instanceof NextResponse) return userId;

    const result = await claimSearch(userId, searchId);
    if (!result.ok) {
      const message =
        result.reason === "taken"
          ? "That search is already saved to another account."
          : result.reason === "empty"
            ? "There was nothing to save from that search."
            : "That search has expired. Start a new one.";
      return NextResponse.json({ error: message }, { status: result.reason === "taken" ? 409 : 404 });
    }

    await track({ anonId: userId, name: "signed_in", flow: "discover", searchId, props: { leads: result.leads } });
    return NextResponse.json(result);
  } catch (err) {
    const message = toUserError("discover/claim", err, "Couldn't save that search to your account.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
