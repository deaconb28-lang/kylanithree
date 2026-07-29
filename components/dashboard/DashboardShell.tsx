"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState, type ReactNode } from "react";
import { FindingsIcon, MapIcon, QueueIcon, TodayIcon } from "../icons/NavIcons";
import KylaniLogo from "../icons/KylaniLogo";
import { clearOnboardingResult, readOnboardingResult } from "../../lib/onboardingStorage";

type Surface = "today" | "queue" | "map" | "findings" | "settings";

const NAV: { key: Surface; href: string; label: string; Icon: typeof TodayIcon }[] = [
  { key: "today", href: "/app/today", label: "Today", Icon: TodayIcon },
  { key: "queue", href: "/app/queue", label: "Queue", Icon: QueueIcon },
  { key: "map", href: "/app/map", label: "Map", Icon: MapIcon },
  { key: "findings", href: "/app/findings", label: "Findings", Icon: FindingsIcon },
];

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
    today: null,
    queue: null,
    map: null,
    findings: null,
    settings: null,
  });
  const [product, setProduct] = useState<{ name: string; url: string } | null>(null);
  // Starts false whenever onboarding data is still pending finalize, so no descendant page can
  // mount and race its own /api/leads or /api/campaign fetch against the finalize call below —
  // those routes auto-seed generic demo data the instant they see no campaign yet, which used to
  // beat the (much slower, AI-backed) finalize call and silently strand real accounts on demo data.
  const [ready, setReady] = useState(() => !readOnboardingResult());
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const loadCounts = () =>
    fetch("/api/leads")
      .then((r) => r.json())
      .then((leads: { timeSensitive: boolean; status: string }[]) => {
        const today = leads.filter((l) => l.timeSensitive && l.status === "waiting").length;
        const queue = leads.filter((l) => !l.timeSensitive && l.status === "waiting").length;
        setCounts((c) => ({ ...c, today: String(today), queue: String(queue) }));
      });
  const loadCampaign = () =>
    fetch("/api/campaign")
      .then((r) => r.json())
      .then((c: { productName: string; productUrl: string }) => setProduct({ name: c.productName, url: c.productUrl }));

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
        setProduct({ name: data.productName, url: data.productUrl });
        clearOnboardingResult();
        setReady(true);
        loadCounts();
      })
      .catch(() => setFinalizeError("Couldn't reach the server."))
      .finally(() => setRetrying(false));
  };

  useEffect(() => {
    const pending = readOnboardingResult();
    if (pending) {
      attemptFinalize(pending);
    } else {
      loadCounts();
      loadCampaign();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = () => {
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
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 18 }}>Couldn&apos;t build your campaign.</span>
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

  if (!ready) {
    return (
      <div style={{ width: "100%", minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--card)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, maxWidth: 360, textAlign: "center", padding: "0 24px" }}>
          <KylaniLogo size={30} />
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 18 }}>Putting your campaign together…</span>
          <span style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>
            Reading what you sold and who you sell to, then drafting the first leads. This takes up to 30 seconds.
          </span>
        </div>
      </div>
    );
  }
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
          gap: 26,
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 6px" }}>
          <KylaniLogo size={26} />
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 17 }}>Kylani</span>
        </div>

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

        <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {NAV.map(({ key, href, label, Icon }) => {
            const isActive = key === active;
            return (
              <Link
                key={key}
                href={href}
                className={`ky-sidebar-link${isActive ? " active" : ""}`}
              >
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
          })}
        </nav>

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {bottom}
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--muted)", padding: "0 6px", whiteSpace: "nowrap", overflow: "hidden" }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--green)", flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {session?.user?.email ?? "connecting…"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 6px" }}>
            <Link
              href="/app/settings"
              style={{ fontSize: 13.5, color: active === "settings" ? "var(--ink)" : "var(--muted)", fontWeight: active === "settings" ? 600 : 400, cursor: "pointer" }}
            >
              Settings
            </Link>
            <span onClick={() => signOut({ callbackUrl: "/" })} style={{ fontSize: 13.5, color: "var(--muted)", cursor: "pointer" }}>
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
        {NAV.map(({ key, href, label, Icon }) => {
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
