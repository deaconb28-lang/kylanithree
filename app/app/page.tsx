import { redirect } from "next/navigation";

// The app used to open here, on an inbox. It now opens on the campaign command center, so this
// path exists only to carry bookmarks and in-flight links across. Server-side redirect rather than
// a client one: no flash of the old shell, and no render of a page that is about to be replaced.
export default function AppIndexPage() {
  redirect("/campaign");
}
