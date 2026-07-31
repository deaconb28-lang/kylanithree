"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import OnboardingChrome from "./OnboardingChrome";
import ScanningWindow from "./ScanningWindow";
import type { ProductCategory } from "../../lib/productCategories";
import type { GeneratedSeed } from "../../lib/generateCampaignSeed";
import type { ScoredLead, Venue } from "../../lib/search/types";
import type { SiteAnalysis } from "../../lib/types";
import { useNotificationPermission } from "../../lib/useNotificationPermission";

// Orchestrates the real two-phase pipeline from the client, which is what makes results stream.
// Venues resolve first and render the moment they land — communities ARE the first result, not a
// loading state for one. Extraction then runs as several parallel shards, each its own request, so
// leads appear in batches as they confirm and no single request has to fit the whole run inside
// Vercel's function ceiling.
const VENUES_PER_SHARD = 3;

type Phase = "venues" | "leads" | "done";

export default function Step5Search({
  url,
  whatYouSell,
  buyers,
  channels,
  category,
  analysis,
  onDone,
}: {
  url: string;
  whatYouSell: string;
  buyers: { name: string; desc: string }[];
  channels: Record<string, boolean>;
  category: ProductCategory;
  analysis: SiteAnalysis | null;
  onDone: (seed: GeneratedSeed) => void;
}) {
  const [seconds, setSeconds] = useState(0);
  const [phase, setPhase] = useState<Phase>("venues");
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [leads, setLeads] = useState<ScoredLead[]>([]);
  const [shardsDone, setShardsDone] = useState(0);
  const [shardTotal, setShardTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const advancedRef = useRef(false);
  const notifiedRef = useRef(false);
  const { permission: notifyPermission, request: requestNotifications } = useNotificationPermission();

  const searchPayload = useMemo(
    () => ({
      url,
      whatYouSell,
      problem: analysis?.problem,
      buyers,
      channels,
      category,
      keywords: analysis?.keywords,
      nicheKey: analysis?.nicheKey,
      problemPhrases: analysis?.problemPhrases,
      seekingPhrases: analysis?.seekingPhrases,
      negativeTerms: analysis?.negativeTerms,
      relevanceWindowDays: analysis?.relevanceWindowDays,
    }),
    [url, whatYouSell, buyers, channels, category, analysis],
  );

  useEffect(() => {
    if (notifyPermission !== "granted" || notifiedRef.current) return;
    if (phase === "done") {
      notifiedRef.current = true;
      const n = new Notification("Your leads are ready", { body: `Found ${leads.length} real lead${leads.length === 1 ? "" : "s"} — come take a look.` });
      n.onclick = () => window.focus();
    } else if (error) {
      notifiedRef.current = true;
      const n = new Notification("The search hit a snag", { body: error });
      n.onclick = () => window.focus();
    }
  }, [phase, leads.length, error, notifyPermission]);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [attempt]);

  useEffect(() => {
    let cancelled = false;

    const readJson = async (res: Response) => {
      try {
        return { ok: res.ok, data: await res.json() };
      } catch {
        throw new Error(res.ok ? "PARSE_ERROR" : `HTTP_${res.status}`);
      }
    };

    (async () => {
      try {
        const venuesRes = await fetch("/api/onboarding/resolve-venues", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(searchPayload),
        });
        const { ok: venuesOk, data: venuesData } = await readJson(venuesRes);
        if (cancelled) return;
        if (!venuesOk) {
          setError((venuesData as { error?: string }).error ?? "Couldn't work out where your buyers gather.");
          return;
        }
        const found = (venuesData as { venues: Venue[] }).venues ?? [];
        setVenues(found);
        setPhase("leads");

        const searchable = found.filter((v) => v.searchable);
        if (searchable.length === 0) {
          setPhase("done");
          return;
        }

        const shards: Venue[][] = [];
        for (let i = 0; i < searchable.length; i += VENUES_PER_SHARD) {
          shards.push(searchable.slice(i, i + VENUES_PER_SHARD));
        }
        setShardTotal(shards.length);

        // Fired together, rendered as each resolves. A shard that fails or times out costs its own
        // venues only — the rest of the run is unaffected, which is the whole point of sharding.
        await Promise.all(
          shards.map(async (shard) => {
            try {
              const res = await fetch("/api/onboarding/extract-leads", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...searchPayload, venues: shard }),
              });
              const { ok, data } = await readJson(res);
              if (cancelled || !ok) return;
              const batch = (data as { leads: ScoredLead[] }).leads ?? [];
              setLeads((prev) => {
                // Author-dedupe across shards — the same person can surface in two communities.
                const seen = new Set(prev.map((l) => l.author.toLowerCase()));
                return [...prev, ...batch.filter((l) => !seen.has(l.author.toLowerCase()))];
              });
            } catch {
              // Swallowed on purpose: a dead shard degrades the result set, it never fails the run.
            } finally {
              if (!cancelled) setShardsDone((n) => n + 1);
            }
          }),
        );

        if (!cancelled) setPhase("done");
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error && /^(PARSE_ERROR|HTTP_)/.test(err.message)
            ? "That took longer than expected and timed out. Try again — most searches finish well within a minute."
            : "Couldn't reach the server — check your connection and try again.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  useEffect(() => {
    if (phase === "done" && !advancedRef.current) {
      advancedRef.current = true;
      const t = setTimeout(() => onDone({ leads, communities: venues ?? [] }), 1600);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const retry = () => {
    setError(null);
    setVenues(null);
    setLeads([]);
    setShardsDone(0);
    setShardTotal(0);
    setPhase("venues");
    advancedRef.current = false;
    notifiedRef.current = false;
    setAttempt((a) => a + 1);
  };

  const clock = Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");

  const stages: { label: string; state: "done" | "active" | "pending" }[] = [
    {
      label: venues ? `Found ${venues.length} communities where these buyers gather` : "Finding the communities where these buyers gather",
      state: venues ? "done" : "active",
    },
    {
      label:
        shardTotal > 0
          ? `Reading real posts inside them (${shardsDone}/${shardTotal} batches)`
          : "Reading real posts inside them",
      state: phase === "done" ? "done" : phase === "leads" ? "active" : "pending",
    },
    {
      label: leads.length ? `Verified ${leads.length} real ${leads.length === 1 ? "person" : "people"} with a live problem` : "Verifying who has a live problem right now",
      state: phase === "done" ? "done" : leads.length ? "active" : "pending",
    },
  ];

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
              <span style={{ fontSize: 17, color: "var(--muted)" }}>{phase === "done" ? "search complete" : "elapsed — this is a real, live search"}</span>
            </div>
            {phase !== "done" && <ScanningWindow label={`${buyers[0]?.name || "buyers"} · live`} accent="var(--ember)" />}
          </div>

          <div style={{ background: "rgba(253,252,250,.86)", border: "1px solid var(--border)", borderRadius: 14, padding: 8, display: "flex", flexDirection: "column", gap: 2 }}>
            {stages.map((s) => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 10, background: s.state === "active" ? "#F7F3EE" : "transparent", opacity: s.state === "pending" ? 0.45 : 1 }}>
                {s.state === "done" ? (
                  <span style={{ width: 18, height: 18, borderRadius: 999, background: "var(--green)", display: "grid", placeItems: "center", color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>✓</span>
                ) : s.state === "active" ? (
                  <span style={{ width: 18, height: 18, borderRadius: 999, border: "2px solid var(--ember)", boxSizing: "border-box", animation: "kyPulse 1.4s ease-in-out infinite", flexShrink: 0 }} />
                ) : (
                  <span style={{ width: 18, height: 18, borderRadius: 999, border: "2px solid var(--border-strong)", boxSizing: "border-box", flexShrink: 0 }} />
                )}
                <span style={{ fontSize: 15.5, flex: 1, textAlign: "left", fontWeight: s.state === "active" ? 500 : 400 }}>{s.label}</span>
              </div>
            ))}
          </div>

          {leads.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 15, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)" }}>
                People found
              </span>
              {leads.slice(0, 5).map((l) => (
                <div key={l.id} className="ky-fade-in" style={{ background: "rgba(253,252,250,.86)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{l.author}</span>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>{l.venueName}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: l.intentTier === "seeking" ? "var(--green)" : "var(--muted)" }}>
                      {l.intentTier === "seeking" ? "Actively looking" : "Complaining"}
                    </span>
                  </div>
                  <span style={{ fontSize: 13.5, color: "var(--muted-strong)", lineHeight: 1.5 }}>&ldquo;{l.excerpt}&rdquo;</span>
                </div>
              ))}
            </div>
          )}

          {phase === "done" ? (
            <span style={{ fontSize: 14, color: "var(--muted)" }}>Taking you to your first drafts…</span>
          ) : notifyPermission === "granted" ? (
            <span style={{ fontSize: 14, color: "var(--green)", fontWeight: 600 }}>🔔 I&apos;ll notify you the moment it&apos;s done — feel free to switch tabs.</span>
          ) : notifyPermission === "denied" ? (
            <span style={{ fontSize: 14, color: "var(--muted)" }}>Notifications are blocked in your browser — you can leave this tab open, it&apos;ll finish on its own.</span>
          ) : notifyPermission === "unsupported" ? (
            <span style={{ fontSize: 14, color: "var(--muted)" }}>You can leave this tab open — it&apos;ll finish on its own.</span>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", border: "1px solid #F3D9BE", background: "#FFF8F1", borderRadius: 14, padding: "14px 18px" }}>
              <button onClick={requestNotifications} className="ky-btn-ember" style={{ padding: "12px 20px", fontSize: 14.5, border: "none", whiteSpace: "nowrap", animation: "kyGlow 2.2s ease-in-out infinite" }}>
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
            {venues ? (
              venues.length ? (
                venues.map((c, i) => (
                  <div key={c.id} className="ky-fade-in" style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 12, borderBottom: i < venues.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 15.5, fontWeight: 600 }}>{c.name}</span>
                      <span style={{ fontSize: 13, color: c.fit === "Strong fit" ? "var(--green)" : "var(--muted)", fontWeight: 600, whiteSpace: "nowrap" }}>{c.fit}</span>
                    </div>
                    <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{c.membersLabel}</span>
                    <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>{c.note}</span>
                  </div>
                ))
              ) : (
                <span style={{ fontSize: 14, color: "var(--muted)" }}>No communities confirmed yet — I&apos;ll keep looking once you&apos;re in.</span>
              )
            ) : (
              <span style={{ fontSize: 14, color: "var(--muted)" }}>Searching live — communities land here first.</span>
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
