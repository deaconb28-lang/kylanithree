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

  // Capture a referral code off any entry URL (`/?r=1a2b3c4d`) into a cookie.
  //
  // Held in a cookie rather than carried through the URL because the path from landing to account
  // is not one hop: the visitor reads the page, runs a discover, and only then signs in through
  // Google, which bounces them off-site and back. A query parameter does not survive that; a cookie
  // does. Validated here so nothing but eight hex characters is ever written.
  //
  // The pattern and the cookie name are written out rather than imported from `lib/referrals.ts`,
  // deliberately: that module pulls in the MongoDB driver, which cannot be bundled into the proxy.
  // They mirror `isValidReferralCode` and `REFERRAL_COOKIE`; change all three together.
  const code = req.nextUrl.searchParams.get("r");
  if (code && /^[0-9a-f]{8}$/.test(code)) {
    const res = NextResponse.next();
    res.cookies.set("ky_ref", code, {
      maxAge: 30 * 86_400,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: req.nextUrl.protocol === "https:",
    });
    return res;
  }
});

export const config = {
  // /campaign is the app home now. Leaving it out of the matcher would ship the whole
  // command center unauthenticated — the guard is the matcher, not the route file.
  // `/campaign` is listed separately from `/campaign/:path*` on purpose. Whether a `:path*` pattern
  // also matches the bare parent is not worth gambling the auth guard on — an unauthenticated home
  // is the one failure here that matters.
  // "/" is matched so a referral link landing on the marketing page can set its cookie. It is not
  // protected — the isProtected check above still governs that — it just needs to be seen.
  matcher: ["/", "/app/:path*", "/campaign", "/campaign/:path*"],
};
