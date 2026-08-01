"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState, type ReactNode } from "react";
import { ChannelsIcon, FindingsIcon, HomeIcon, MapIcon, QueueIcon, SuppressedIcon, TodayIcon } from "../icons/NavIcons";
import KylaniLogo from "../icons/KylaniLogo";
import { clearOnboardingResult, readOnboardingResult } from "../../lib/onboardingStorage";
import { PLAN_COPY } from "../../lib/billing";

type Surface = "home" | "today" | "queue" | "map" | "findings" | "channels" | "suppressed" | "settings";

const OUTREACH_NAV: { key: Surface; href: string; label: string; Icon: typeof TodayIcon }[] = [
  { key: "today", href: "/app/today", label: "Today", Icon: TodayIcon },
  { key: "queue", href: "/app/queue", label: "Queue", Icon: QueueIcon },
  { key: "map", href: "/app/map", label: "Map", Icon: MapIcon },
  { key: "findings", href: "/app/findings", label: "Findings", Icon: FindingsIcon },
];

const CHANNELS_NAV: { key: Surface; href: string; label: string; Icon: typeof TodayIcon }[] = [
  { key: "channels", href: "/app/channels", label: "Channels", Icon: ChannelsIcon },
  { key: "suppressed", href: "/app/suppressed", label: "Suppressed", Icon: SuppressedIcon },
];

/**
 * The discover run waiting to be attached to this account, if the sign-in redirect carried one.
 *
 * Read from the URL rather than a router hook so it is available during the very first render —
 * the shell has to know NOT to let a page underneath fetch before the claim lands, for exactly the
 * reason the finalize gate exists: whichever request wins the race decides what the founder sees.
 */
function claimIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("claim");
}

export default function DashboardShell({
  active,
  bottom,
  children,
}: {
  active: Surface;
  bottom?: ReactNode;
  children: ReactNode;
}) {
  const { data: session } = useSession();
  const [counts, setCounts] = useState<Record<Surface, string | null>>({
    home: null,
    today: null,
    queue: null,
    map: null,
    findings: null,
    channels: null,
    suppressed: null,
    settings: null,
  });
  const [product, setProduct] = useState<{ name: string; url: string; trialEndsAt: string | null; subscriptionPlan: "pro" | "founder" | null } | null>(null);
  // Starts false whenever onboarding data is still pending finalize, so no descendant page can
  // mount and race its own /api/leads or /api/campaign fetch against the finalize call below —
  // those routes auto-seed generic demo data the instant they see no campaign yet, which used to
  // beat the (much slower, AI-backed) finalize call and silently strand real accounts on demo data.
  const [ready, setReady] = useState(() => !readOnboardingResult() && !claimIdFromUrl());
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // These only feed sidebar badges/labels, not page content — a failure here degrades quietly
  // (badges just stay blank) rather than blocking the shell, since each page underneath already
  // loads and error-handles its own data independently.
  const loadCounts = () =>
    fetch("/api/leads")
      .then((r) => r.json())
      .then((leads: { timeSensitive: boolean; status: string }[]) => {
        const today = leads.filter((l) => l.timeSensitive && l.status === "waiting").length;
        const queue = leads.filter((l) => !l.timeSensitive && l.status === "waiting").length;
        setCounts((c) => ({ ...c, today: String(today), queue: String(queue) }));
      })
      .catch(() => {});
  const loadCampaign = () =>
    fetch("/api/campaign")
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        // 404 + needsOnboarding is the honest answer for an account that has never run onboarding.
        // It used to be impossible to get here: the API invented a demo campaign rather than admit
        // there wasn't one, which is how accounts ended up showing a fictional company's leads.
        if (!ok) {
          if (data?.needsOnboarding) setNeedsOnboarding(true);
          return;
        }
        const c = data as { productName: string; productUrl: string; trialEndsAt: string | null; subscription?: { plan: "pro" | "founder"; status: string } };
        setProduct({
          name: c.productName,
          url: c.productUrl,
          trialEndsAt: c.trialEndsAt ?? null,
          subscriptionPlan: c.subscription?.status === "active" ? c.subscription.plan : null,
        });
      })
      .catch(() => {});
  const loadSuppressedCount = () =>
    fetch("/api/suppressions")
      .then((r) => r.json())
      .then((list: unknown[]) => setCounts((c) => ({ ...c, suppressed: String(list.length) })))
      .catch(() => {});

  const attemptFinalize = (pending: NonNullable<ReturnType<typeof readOnboardingResult>>) => {
    fetch("/api/onboarding/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pending),
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          // Keep the pending payload so "Try again" can retry the exact same request —
          // clearing it here would strand the user with nothing to retry.
          setFinalizeError(data.error ?? "Couldn't build your campaign.");
          return;
        }
        setProduct({ name: data.productName, url: data.productUrl, trialEndsAt: data.trialEndsAt ?? null, subscriptionPlan: null });
        clearOnboardingResult();
        setReady(true);
        loadCounts();
        loadSuppressedCount();
      })
      .catch(() => setFinalizeError("Couldn't reach the server."))
      .finally(() => setRetrying(false));
  };

  const attemptClaim = (searchId: string) => {
    fetch(`/api/discover/${searchId}/claim`, { method: "POST" })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setFinalizeError(data.error ?? "Couldn't save that search to your account.");
          return;
        }
        // Drop the parameter once it has been used, so a reload is a plain page load rather than a
        // second claim — harmless, since the claim is idempotent, but pointless work on every visit.
        window.history.replaceState(null, "", window.location.pathname);
        setReady(true);
        loadCounts();
        loadCampaign();
        loadSuppressedCount();
      })
      .catch(() => setFinalizeError("Couldn't reach the server."))
      .finally(() => setRetrying(false));
  };

  useEffect(() => {
    const pending = readOnboardingResult();
    const claimId = claimIdFromUrl();
    if (claimId) {
      attemptClaim(claimId);
    } else if (pending) {
      attemptFinalize(pending);
    } else {
      loadCounts();
      loadCampaign();
      loadSuppressedCount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = () => {
    const claimId = claimIdFromUrl();
    if (claimId) {
      setRetrying(true);
      setFinalizeError(null);
      attemptClaim(claimId);
      return;
    }
    const pending = readOnboardingResult();
    if (!pending) return;
    setRetrying(true);
    setFinalizeError(null);
    attemptFinalize(pending);
  };

  if (finalizeError) {
    return (
      <div style={{ width: "100%", minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--card)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, maxWidth: 420, textAlign: "center", padding: "0 24px" }}>
          <KylaniLogo size={30} />
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 18 }}>
            {claimIdFromUrl() ? "Couldn't save your search." : "Couldn't build your campaign."}
          </span>
          <span style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>{finalizeError}</span>
          <button
            className="ky-btn-ember"
            disabled={retrying}
            onClick={retry}
            style={{ padding: "12px 22px", fontSize: 15, border: "none", marginTop: 8, opacity: retrying ? 0.6 : 1 }}
          >
            {retrying ? "Retrying…" : "Try again"}
          </button>
        </div>
      </div>
    );
  }

  // Signed in, but this account has never completed onboarding — so there is genuinely nothing to
  // show. Sending them to do it is the only honest option; the alternative used to be inventing a
  // campaign for them.
  if (needsOnboarding) {
    return (
      <div style={{ width: "100%", minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--card)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, maxWidth: 420, textAlign: "center", padding: "0 24px" }}>
          <KylaniLogo size={30} />
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 18 }}>Let&apos;s find your buyers.</span>
          <span style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>
            There&apos;s no campaign on this account yet. Paste your URL and Kylani will read your product, work out
            who it&apos;s for, and go looking for them.
          </span>
          <Link href="/onboarding" className="ky-btn-ember" style={{ padding: "12px 22px", fontSize: 15, border: "none", marginTop: 8 }}>
            Paste your URL
          </Link>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div style={{ width: "100%", minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--card)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, maxWidth: 360, textAlign: "center", padding: "0 24px" }}>
          <KylaniLogo size={30} />
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 18 }}>Putting your campaign together…</span>
          <span style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>
            Reading what you sold, then actually searching Reddit, forums, and job boards for real leads. This usually
            takes under a minute.
          </span>
        </div>
      </div>
    );
  }

  const daysLeft = product?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(product.trialEndsAt).getTime() - new Date().getTime()) / 86_400_000))
    : null;
  const trialPct = daysLeft !== null ? Math.max(4, Math.min(100, ((7 - daysLeft) / 7) * 100)) : 4;
  const subscriptionPlan = product?.subscriptionPlan ?? null;
  const accountLabel = subscriptionPlan ? PLAN_COPY[subscriptionPlan].name.replace("Kylani ", "") : daysLeft !== null && daysLeft > 0 ? "Trial" : "Trial ended";
  const displayName = session?.user?.name || session?.user?.email?.split("@")[0] || "there";

  const renderLink = ({ key, href, label, Icon }: (typeof OUTREACH_NAV)[number]) => {
    const isActive = key === active;
    return (
      <Link key={key} href={href} className={`ky-sidebar-link${isActive ? " active" : ""}`}>
        <Icon color={isActive ? "var(--ember)" : "#9C948A"} />
        <span style={{ flex: 1 }}>{label}</span>
        {counts[key] && counts[key] !== "0" && (
          <span
            style={{
              fontSize: 12.5,
              padding: "2px 7px",
              borderRadius: 999,
              background: isActive ? "var(--ember)" : "transparent",
              color: isActive ? "#fff" : "var(--muted)",
            }}
          >
            {counts[key]}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        background: "var(--card)",
        display: "grid",
        gridTemplateColumns: "248px 1fr",
      }}
      className="dash-grid"
    >
      <style>{`
        @media (max-width: 900px) {
          .dash-grid { grid-template-columns: 1fr !important; }
          .dash-sidebar { display: none !important; }
          .dash-mobile-tabbar { display: flex !important; }
        }
      `}</style>

      <aside
        className="dash-sidebar"
        style={{
          borderRight: "1px solid var(--border)",
          background: "var(--card-alt)",
          padding: "24px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          boxSizing: "border-box",
        }}
      >
        <Link href="/app" style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 6px" }}>
          <KylaniLogo size={26} />
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 17, color: "var(--ink)" }}>Kylani</span>
        </Link>

        <div
          style={{
            border: "1px solid var(--border)",
            background: "var(--card)",
            borderRadius: 10,
            padding: "11px 13px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 600 }}>{product?.name ?? "…"}</span>
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{product?.url ?? ""} · campaign 1</span>
        </div>

        <Link href="/app" className={`ky-sidebar-link${active === "home" ? " active" : ""}`}>
          <HomeIcon color={active === "home" ? "var(--ember)" : "#9C948A"} />
          <span style={{ flex: 1 }}>Home</span>
        </Link>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#A39C90", padding: "0 12px" }}>
            Outreach
          </span>
          <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>{OUTREACH_NAV.map(renderLink)}</nav>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#A39C90", padding: "0 12px" }}>
            Channels
          </span>
          <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>{CHANNELS_NAV.map(renderLink)}</nav>
        </div>

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {bottom}
          {subscriptionPlan ? (
            <Link href="/app/trial" style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 13px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--card)" }}>
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Plan</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--green)" }}>{PLAN_COPY[subscriptionPlan].name}</span>
            </Link>
          ) : (
            daysLeft !== null && (
              <Link href="/app/trial" style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 13px", display: "flex", flexDirection: "column", gap: 6, background: "var(--card)" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Trial</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: daysLeft > 0 ? "var(--ember)" : "var(--muted)" }}>
                    {daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : "Ended"}
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
                  <div style={{ width: `${trialPct}%`, height: "100%", background: "var(--ember)" }} />
                </div>
              </Link>
            )
          )}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "flex", alignItems: "center", gap: 10, padding: "12px 6px 0" }}>
            <div style={{ width: 28, height: 28, borderRadius: 999, background: "#E8EEFF", flexShrink: 0, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: "#4A5D8A" }}>
              {displayName[0]?.toUpperCase()}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {accountLabel} ·{" "}
                <Link href="/app/settings" style={{ color: active === "settings" ? "var(--ink)" : "var(--muted)", fontWeight: active === "settings" ? 600 : 400 }}>
                  Settings
                </Link>
              </span>
            </div>
            <span onClick={() => signOut({ callbackUrl: "/" })} style={{ fontSize: 12.5, color: "var(--muted)", cursor: "pointer", flexShrink: 0 }}>
              Sign out
            </span>
          </div>
        </div>
      </aside>

      <main style={{ minWidth: 0, paddingBottom: 70 }}>{children}</main>

      <nav
        className="dash-mobile-tabbar"
        style={{
          display: "none",
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          justifyContent: "space-between",
          padding: "10px 20px calc(10px + env(safe-area-inset-bottom))",
          background: "rgba(253,252,250,.94)",
          borderTop: "1px solid var(--border)",
          backdropFilter: "blur(8px)",
        }}
      >
        {OUTREACH_NAV.map(({ key, href, label, Icon }) => {
          const isActive = key === active;
          return (
            <Link
              key={key}
              href={href}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 5,
                flex: 1,
                textDecoration: "none",
              }}
            >
              <Icon color={isActive ? "var(--ember)" : "#B7AFA5"} size={16} />
              <span style={{ fontSize: 11.5, fontWeight: isActive ? 600 : 400, color: isActive ? "var(--ink)" : "var(--muted)" }}>
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
