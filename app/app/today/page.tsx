import { redirect } from "next/navigation";

// Today is gone. Time-sensitivity is a ranking boost inside Work, surfaced as a chip on the row,
// rather than a separate destination that hid the rest of the queue behind a second click.
export default function TodayRedirectPage() {
  redirect("/campaign/work?filter=pending");
}
