import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const path = req.nextUrl.pathname;
  const isProtected = path.startsWith("/app") || path.startsWith("/campaign");

  if (isProtected && !isLoggedIn) {
    const url = new URL("/signin", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(url);
  }
});

export const config = {
  // /campaign is the app home now. Leaving it out of the matcher would ship the whole
  // command center unauthenticated — the guard is the matcher, not the route file.
  // `/campaign` is listed separately from `/campaign/:path*` on purpose. Whether a `:path*` pattern
  // also matches the bare parent is not worth gambling the auth guard on — an unauthenticated home
  // is the one failure here that matters.
  matcher: ["/app/:path*", "/campaign", "/campaign/:path*"],
};
