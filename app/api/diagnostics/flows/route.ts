import { NextResponse } from "next/server";
import { flowReport } from "@/lib/discover/analytics";
import { toUserError } from "@/lib/apiError";

// The onboarding comparison, both flows side by side.
//
// This is the whole reason the old flow is still switched on rather than deleted: "faster" is a
// claim about two things, and without a baseline it is an assertion. Both flows emit the same event
// names on the same browser clock, so these two reports are directly comparable.
export const maxDuration = 30;

export async function GET() {
  try {
    const [discover, legacy] = await Promise.all([
      flowReport({ flow: "discover" }),
      flowReport({ flow: "legacy" }),
    ]);
    return NextResponse.json({ discover, legacy });
  } catch (err) {
    const message = toUserError("diagnostics/flows", err, "Couldn't read the onboarding numbers.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
