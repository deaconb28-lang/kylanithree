"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import OnboardingChrome from "./OnboardingChrome";
import ScanningWindow from "./ScanningWindow";
import type { ProductCategory } from "../../lib/productCategories";
import type { GeneratedSeed } from "../../lib/generateCampaignSeed";
import { useNotificationPermission } from "../../lib/useNotificationPermission";

// Two real phases now (see lib/generateCampaignSeed.ts + the search-communities/search-people
// routes): communities first, people second, each its own request so it fits comfortably inside
// Vercel's 60s ceiling instead of racing one long combined call against it. The first stage
// completes on a real event (the communities fetch resolving) rather than a guess; the remaining
// three are time-paced within phase 2 the same way the old single-call version paced all four,
// since the people search itself doesn't stream finer-grained progress back.
const STAGES = [
  "Matching communities where these buyers actually hang out",
  "Searching Reddit, forums, and job boards for real signal",
  "Cross-checking specific threads and listings it found",
  "Writing first-draft replies anchored to what they said",
];
const SECONDS_PER_STAGE = 7;

type Phase = "communities" | "people" | "done";

export default function Step5Search({
  url,
  whatYouSell,
  buyers,
  channels,
  category,
  keywords,
  onDone,
}: {
  url: string;
  whatYouSell: string;
  buyers: { name: string; desc: string }[];
  channels: Record<string, boolean>;
  category: ProductCategory;
  keywords: string[];
  onDone: (seed: GeneratedSeed) => void;
}) {
  const [seconds, setSeconds] = useState(0);
  const secondsRef = useRef(0);
  const [phase, setPhase] = useState<Phase>("communities");
  const [phase2StartSecond, setPhase2StartSecond] = useState<number | null>(null);
  const [communities, setCommunities] = useState<GeneratedSeed["communities"] | null>(null);
  const [leads, setLeads] = useState<GeneratedSeed["leads"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const advancedRef = useRef(false);
  const notifiedRef = useRef(false);
  const { permission: notifyPermission, request: requestNotifications } = useNotificationPermission();

  const seed: GeneratedSeed | null = useMemo(() => (communities && leads ? { communities, leads } : null), [communities, leads]);

  // Fires once, whichever happens first — lets someone actually leave the tab instead of
  // babysitting the timer. Only real if permission is actually "granted"; otherwise this is a
  // no-op and the on-screen copy says so instead of pretending it'll ping them.
  useEffect(() => {
    if (notifyPermission !== "granted" || notifiedRef.current) return;
    if (seed) {
      notifiedRef.current = true;
      const n = new Notification("Your leads are ready", { body: `Found ${seed.leads.length} real lead${seed.leads.length === 1 ? "" : "s"} — come take a look.` });
      n.onclick = () => window.focus();
    } else if (error) {
      notifiedRef.current = true;
      const n = new Notification("The search hit a snag", { body: error });
      n.onclick = () => window.focus();
    }
  }, [seed, error, notifyPermission]);

  // Real elapsed time — one tick per real second, no compression.
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const next = Math.floor((Date.now() - start) / 1000);
      secondsRef.current = next;
      setSeconds(next);
    }, 1000);
    return () => clearInterval(id);
  }, [attempt]);

  useEffect(() => {
    let cancelled = false;

    const parseJson = async (res: Response) => {
      try {
        return { ok: res.ok, data: await res.json() };
      } catch {
        throw new Error(res.ok ? "PARSE_ERROR" : `HTTP_${res.status}`);
      }
    };
    const timeoutMessage = (err: unknown) =>
      err instanceof Error && /^(PARSE_ERROR|HTTP_)/.test(err.message)
        ? "That took longer than expected and timed out. Try again — most searches finish well within a minute."
        : "Couldn't reach the server — check your connection and try again.";

    (async () => {
      try {
        const communitiesRes = await fetch("/api/onboarding/search-communities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, whatYouSell, buyers, channels, category, keywords }),
        });
        const { ok: communitiesOk, data: communitiesData } = await parseJson(communitiesRes);
        if (cancelled) return;
        if (!communitiesOk) {
          setError((communitiesData as { error?: string }).error ?? "Couldn't search for real communities right now.");
          return;
        }
        const foundCommunities = (communitiesData as { communities: GeneratedSeed["communities"] }).communities;
        setCommunities(foundCommunities);
        setPhase("people");
        setPhase2StartSecond(secondsRef.current);

        const peopleRes = await fetch("/api/onboarding/search-people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, whatYouSell, buyers, channels, category, keywords, communities: foundCommunities }),
        });
        const { ok: peopleOk, data: peopleData } = await parseJson(peopleRes);
        if (cancelled) return;
        if (!peopleOk) {
          setError((peopleData as { error?: string }).error ?? "Couldn't search for real leads right now.");
          return;
        }
        setLeads((peopleData as { leads: GeneratedSeed["leads"] }).leads);
        setPhase("done");
      } catch (err) {
        if (cancelled) return;
        setError(timeoutMessage(err));
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  useEffect(() => {
    if (seed && !advancedRef.current) {
      advancedRef.current = true;
      const t = setTimeout(() => onDone(seed), 1400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const retry = () => {
    setError(null);
    setCommunities(null);
    setLeads(null);
    setPhase("communities");
    setPhase2StartSecond(null);
    advancedRef.current = false;
    notifiedRef.current = false;
    setAttempt((a) => a + 1);
  };

  const clock = Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");

  // Stage 0 completes on the real communities-fetch resolving (phase !== "communities"), not a
  // guess. Stages 1-3 are time-paced from the moment phase 2 actually started, same rationale as
  // the old single-call version — the people search doesn't stream finer-grained progress back.
  const phase2Elapsed = phase2StartSecond === null ? 0 : seconds - phase2StartSecond;
  const stageIndex = seed
    ? STAGES.length
    : phase === "communities"
      ? 0
      : Math.min(STAGES.length - 1, 1 + Math.floor(phase2Elapsed / SECONDS_PER_STAGE));

  if (error) {
    return (
      <OnboardingChrome>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, maxWidth: 560, textAlign: "center" }}>
          <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(24px,3.4vw,36px)", lineHeight: 1.1, letterSpacing: "-.03em", margin: 0 }}>
            Couldn&apos;t search for real leads.
          </h1>
          <p style={{ margin: 0, fontSize: 15.5, color: "var(--muted-strong)", lineHeight: 1.6 }}>{error}</p>
          <button className="ky-btn-ember" onClick={retry} style={{ padding: "13px 24px", fontSize: 15.5, border: "none" }}>
            Try again
          </button>
        </div>
      </OnboardingChrome>
    );
  }

  return (
    <OnboardingChrome align="stretch">
      <div style={{ width: "100%", maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr minmax(280px,420px)", gap: 44 }} className="step5-grid">
        <style>{`@media (max-width: 860px) { .step5-grid { grid-template-columns: 1fr !important; } }`}</style>

        <div style={{ display: "flex", flexDirection: "column", gap: 26, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 15, color: "var(--muted)" }}>
            <span style={{ width: 9, height: 9, borderRadius: 999, background: "var(--ember)", animation: "kyPulse 1.6s ease-in-out infinite" }} />
            Searching for real {(buyers[0]?.name || "buyers").toLowerCase()} right now
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 18, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(48px,7vw,92px)", lineHeight: 0.9, letterSpacing: "-.045em", fontVariantNumeric: "tabular-nums" }}>
                {clock}
              </span>
              <span style={{ fontSize: 17, color: "var(--muted)" }}>{seed ? "search complete" : "elapsed — this is a real, live web search"}</span>
            </div>
            {!seed && <ScanningWindow label={`${buyers[0]?.name || "buyers"} · live`} accent="var(--ember)" />}
          </div>
          <div style={{ background: "rgba(253,252,250,.86)", border: "1px solid var(--border)", borderRadius: 14, padding: 8, display: "flex", flexDirection: "column", gap: 2 }}>
            {STAGES.map((stage, i) => {
              const complete = i < stageIndex || !!seed;
              const current = i === stageIndex && !seed;
              return (
                <div key={stage} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 10, background: current ? "#F7F3EE" : "transparent", opacity: i > stageIndex && !seed ? 0.45 : 1 }}>
                  {complete ? (
                    <span style={{ width: 18, height: 18, borderRadius: 999, background: "var(--green)", display: "grid", placeItems: "center", color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>✓</span>
                  ) : current ? (
                    <span style={{ width: 18, height: 18, borderRadius: 999, border: "2px solid var(--ember)", boxSizing: "border-box", animation: "kyPulse 1.4s ease-in-out infinite", flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 18, height: 18, borderRadius: 999, border: "2px solid var(--border-strong)", boxSizing: "border-box", flexShrink: 0 }} />
                  )}
                  <span style={{ fontSize: 15.5, flex: 1, textAlign: "left", fontWeight: current ? 500 : 400 }}>{stage}</span>
                </div>
              );
            })}
          </div>
          {seed && (
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {[
                { v: seed.leads.length, l: "real leads found" },
                { v: seed.communities.length, l: "communities confirmed" },
              ].map((s) => (
                <div key={s.l} style={{ flex: "1 1 140px", background: "rgba(253,252,250,.86)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
                  <div style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: 42, letterSpacing: "-.035em", fontVariantNumeric: "tabular-nums" }}>{s.v}</div>
                  <div style={{ fontSize: 14, color: "var(--muted)" }}>{s.l}</div>
                </div>
              ))}
            </div>
          )}
          {seed ? (
            <span style={{ fontSize: 14, color: "var(--muted)" }}>Taking you to your first drafts…</span>
          ) : notifyPermission === "granted" ? (
            <span style={{ fontSize: 14, color: "var(--green)", fontWeight: 600 }}>
              🔔 I&apos;ll notify you the moment it&apos;s done — feel free to switch tabs.
            </span>
          ) : notifyPermission === "denied" ? (
            <span style={{ fontSize: 14, color: "var(--muted)" }}>
              Notifications are blocked in your browser — you can leave this tab open, it&apos;ll finish on its own.
            </span>
          ) : notifyPermission === "unsupported" ? (
            <span style={{ fontSize: 14, color: "var(--muted)" }}>You can leave this tab open — it&apos;ll finish on its own.</span>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
                border: "1px solid #F3D9BE",
                background: "#FFF8F1",
                borderRadius: 14,
                padding: "14px 18px",
              }}
            >
              <button
                onClick={requestNotifications}
                className="ky-btn-ember"
                style={{ padding: "12px 20px", fontSize: 14.5, border: "none", whiteSpace: "nowrap", animation: "kyGlow 2.2s ease-in-out infinite" }}
              >
                🔔 Notify me the second it&apos;s ready
              </button>
              <span style={{ fontSize: 13.5, color: "var(--muted-strong)", lineHeight: 1.4 }}>
                Go grab a coffee — I&apos;ll ping you the instant real leads are in, no need to babysit this screen.
              </span>
            </div>
          )}
        </div>

        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 1px 2px rgba(20,18,15,.05), 0 22px 46px -24px rgba(20,18,15,.18)", height: "fit-content", minWidth: 0 }}>
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 15, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)" }}>
            Communities found
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {communities ? (
              communities.length ? (
                communities.map((c, i) => (
                  <div key={c.name} className="ky-fade-in" style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 12, borderBottom: i < communities.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 15.5, fontWeight: 600 }}>{c.name}</span>
                      <span style={{ fontSize: 13, color: c.fit === "Strong fit" ? "var(--green)" : "var(--muted)", fontWeight: 600, whiteSpace: "nowrap" }}>{c.fit}</span>
                    </div>
                    <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>{c.note}</span>
                  </div>
                ))
              ) : (
                <span style={{ fontSize: 14, color: "var(--muted)" }}>No communities confirmed yet — I&apos;ll keep looking once you&apos;re in.</span>
              )
            ) : (
              <span style={{ fontSize: 14, color: "var(--muted)" }}>Searching live — results land here once the search finishes.</span>
            )}
          </div>
          <div style={{ marginTop: "auto", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            Reddit is participation only — I&apos;ll tell you which threads to answer. No DMs, ever.
          </div>
        </div>
      </div>
    </OnboardingChrome>
  );
}
