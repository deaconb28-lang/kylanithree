// The dashboard is served both at kylani.app/app/* (works everywhere, including local dev and
// preview deployments) and at the home.kylani.app subdomain in production (see proxy.ts for the
// rewrite that makes both resolve to the same pages). Links from the marketing site into the
// dashboard use this so production visitors land on the clean home.kylani.app URL, while local
// dev and preview deployments — which don't have that domain — keep using the /app/* path.
const DASHBOARD_SUBDOMAIN_HOSTS: Record<string, string> = {
  "kylani.app": "home.kylani.app",
  "www.kylani.app": "home.kylani.app",
};

export function dashboardPath(path: string): string {
  if (typeof window === "undefined") return path;
  const { hostname, protocol } = window.location;
  const dashboardHost = DASHBOARD_SUBDOMAIN_HOSTS[hostname];
  if (!dashboardHost) return path;
  const withoutAppPrefix = path.startsWith("/app") ? path.slice(4) || "/today" : path;
  return `${protocol}//${dashboardHost}${withoutAppPrefix}`;
}
