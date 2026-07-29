import { NextResponse } from "next/server";
import { auth } from "@/auth";

// The dashboard is also reachable at home.kylani.app (home.localhost in dev) — any request to
// that host maps its path onto /app/* internally, so /app/today renders whether it's reached via
// kylani.app/app/today or home.kylani.app/today. Marketing/onboarding stay on the apex domain.
const DASHBOARD_HOST_PREFIX = "home.";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname, origin, hostname } = req.nextUrl;
  const onDashboardHost = hostname.startsWith(DASHBOARD_HOST_PREFIX);

  const targetPath =
    onDashboardHost && !pathname.startsWith("/app") && !pathname.startsWith("/api") && !pathname.startsWith("/signin")
      ? `/app${pathname === "/" ? "/today" : pathname}`
      : pathname;

  const isProtected = targetPath.startsWith("/app");
  if (isProtected && !isLoggedIn) {
    const url = new URL("/signin", origin);
    url.searchParams.set("callbackUrl", targetPath);
    return NextResponse.redirect(url);
  }

  if (targetPath !== pathname) {
    const url = req.nextUrl.clone();
    url.pathname = targetPath;
    return NextResponse.rewrite(url);
  }
});

export const config = {
  matcher: ["/((?!_next|favicon.ico|icon.svg|.*\\..*).*)"],
};
