"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import OnboardingChrome from "./OnboardingChrome";
import ScanningWindow from "./ScanningWindow";
import SiteBadge, { useSitePreview } from "./SiteBadge";
import type { ProductCategory } from "../../lib/productCategories";
import type { GeneratedSeed } from "../../lib/generateCampaignSeed";
import type { ScoredLead, Venue } from "../../lib/search/types";
import type { SiteAnalysis } from "../../lib/types";
import { useNotificationPermission } from "../../lib/useNotificationPermission";
import LeadStars from "../LeadStars";
import { rankLeads } from "../../lib/search/leadScore";

// Orchestrates the real two-phase pipeline from the client, which is what makes results stream.
// Venues resolve first and render the moment they land — communities ARE the first result, not a
// loading state for one. Extraction then runs as several parallel shards, each its own request, so
// leads appear in batches as they confirm and no single request has to fit the whole run inside
// Vercel's function ceiling.
const VENUES_PER_SHARD = 3;
// What a founder is actually asking for when they say "find my buyers" — a batch worth working
// through, not a token handful. The search widens toward this across successive waves; it never
// relaxes the quality gate to reach it, so finishing under target is a normal, honest outcome.
const TARGET_LEADS = 50;
const MAX_WAVES = 4;

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
  const [wave, setWave] = useState(0);
  // Aggregated drop counts across shards, so a zero-lead run can say what actually happened
  // instead of silently handing over an empty dashboard.
  const [drops, setDrops] = useState<Record<string, number>>({});
  const [rawSeen, setRawSeen] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const advancedRef = useRef(false);
  const notifiedRef = useRef(false);
  const { permission: notifyPermission, request: requestNotifications } = useNotificationPermission();
  const preview = useSitePreview(url);

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

        // Each wave fans out across every shard in parallel, then the loop decides whether another
        // is warranted. Stopping early on a wave that adds nothing avoids burning the remaining
        // budget re-searching ground that is already exhausted.
        const collected: ScoredLead[] = [];
        const seenAuthors = new Set<string>();

        for (let wave = 0; wave < MAX_WAVES; wave++) {
          if (cancelled) return;
          if (collected.length >= TARGET_LEADS) break;
          setWave(wave + 1);

          const before = collected.length;

          await Promise.all(
            shards.map(async (shard) => {
              try {
                const res = await fetch("/api/onboarding/extract-leads", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    ...searchPayload,
                    venues: shard,
                    wave,
                    excludeAuthors: [...seenAuthors],
                  }),
                });
                const { ok, data } = await readJson(res);
                if (cancelled || !ok) return;
                const batch = (data as { leads: ScoredLead[] }).leads ?? [];
                const trace = (data as { trace?: { stages?: { stage: string; candidatesIn: number; drops?: Record<string, number> }[] } }).trace;
                if (trace?.stages) {
                  setRawSeen((n) => n + (trace.stages ?? []).filter((st) => st.stage.startsWith("extract:filter")).reduce((a, st) => a + st.candidatesIn, 0));
                  setDrops((prev) => {
                    const next = { ...prev };
                    for (const st of trace.stages ?? []) {
                      for (const [reason, count] of Object.entries(st.drops ?? {})) {
                        if (count > 0) next[reason] = (next[reason] ?? 0) + count;
                      }
                    }
                    return next;
                  });
                }
                // Author-dedupe across shards and waves — the same person can surface in several
                // communities and in more than one wave.
                const added: ScoredLead[] = [];
                for (const l of batch) {
                  const key = l.author.toLowerCase();
                  if (seenAuthors.has(key)) continue;
                  seenAuthors.add(key);
                  collected.push(l);
                  added.push(l);
                }
                if (added.length) setLeads((prev) => [...prev, ...added]);
              } catch {
                // Swallowed on purpose: a dead shard degrades the result set, it never fails the run.
              }
            }),
          );

          // A wave that produced nothing new means this lexicon and these venues are tapped out.
          if (collected.length === before) break;
        }

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
      // Linger on an empty result so the explanation is actually readable, rather than flashing it
      // for a beat and dropping them onto a bare dashboard.
      const t = setTimeout(() => onDone({ leads, communities: venues ?? [] }), leads.length === 0 ? 6500 : 1600);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const retry = () => {
    setError(null);
    setVenues(null);
    setLeads([]);
    setWave(0);
    setDrops({});
    setRawSeen(0);
    setPhase("venues");
    advancedRef.current = false;
    notifiedRef.current = false;
    setAttempt((a) => a + 1);
  };

  // Ranked by the same score the dashboard uses, so the preview is a genuine "best first" list
  // rather than whichever shard happened to answer earliest.
  const rankedLeads = useMemo(
    () => rankLeads(leads, analysis?.relevanceWindowDays ?? 60),
    [leads, analysis?.relevanceWindowDays],
  );

  const clock = Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");

  const stages: { label: string; state: "done" | "active" | "pending" }[] = [
    {
      label: venues ? `Found ${venues.length} communities where these buyers gather` : "Finding the communities where these buyers gather",
      state: venues ? "done" : "active",
    },
    {
      label:
        wave > 0
          ? `Reading real posts inside them — pass ${wave} of ${MAX_WAVES}`
          : "Reading real posts inside them",
      state: phase === "done" ? "done" : phase === "leads" ? "active" : "pending",
    },
    {
      label: leads.length
        ? `Verified ${leads.length} real ${leads.length === 1 ? "person" : "people"} — ranked best first`
        : "Verifying who has a live problem right now",
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

          {/* Kylani's own read of the site once it exists — the site's meta description is only a
              placeholder until then. */}
          <SiteBadge url={url} preview={preview} description={analysis?.siteSummary ?? null} compact />
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
              {rankedLeads.slice(0, 5).map((l) => (
                <div key={l.id} className="ky-fade-in" style={{ background: "rgba(253,252,250,.86)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 7 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{l.author}</span>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>{l.venueName}</span>
                    <span style={{ marginLeft: "auto" }}>
                      <LeadStars score={l.leadScore} />
                    </span>
                  </div>
                  <span style={{ fontSize: 13.5, color: "var(--muted-strong)", lineHeight: 1.5 }}>&ldquo;{l.excerpt}&rdquo;</span>
                </div>
              ))}
            </div>
          )}

          {phase === "done" && leads.length === 0 ? (
            <div style={{ border: "1px solid var(--border-strong)", borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8, background: "rgba(253,252,250,.86)" }}>
              <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 16 }}>
                No leads I could stand behind this time.
              </span>
              <span style={{ fontSize: 14, color: "var(--muted-strong)", lineHeight: 1.55 }}>
                {venues && venues.length === 0
                  ? "I couldn't confirm any communities for this buyer, so there was nowhere to search. Widening the buyer description usually fixes it."
                  : rawSeen === 0
                    ? `I searched ${venues?.length ?? 0} ${venues?.length === 1 ? "community" : "communities"} but the sources returned nothing in the last window. That's usually a quiet niche or a window that's too tight.`
                    : `I read ${rawSeen} recent posts across ${venues?.length ?? 0} ${venues?.length === 1 ? "community" : "communities"}, but none were someone genuinely describing this problem. I'd rather show you nothing than pad the list.`}
              </span>
              {Object.keys(drops).length > 0 && (
                <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                  Filtered out: {Object.entries(drops).filter(([, n]) => n > 0).map(([r, n]) => `${n} ${r.replace(/_/g, " ")}`).join(" · ")}
                </span>
              )}
              <span style={{ fontSize: 13.5, color: "var(--muted)" }}>You can keep going — Kylani will search again from inside the app.</span>
            </div>
          ) : phase === "done" ? (
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
