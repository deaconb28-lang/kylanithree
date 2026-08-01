"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import SearchAgainButton from "../../components/dashboard/SearchAgainButton";
import StepRail, { type Step } from "../../components/dashboard/StepRail";
import SegmentCard, { type Segment } from "../../components/dashboard/SegmentCard";
import { relativeTime } from "../../lib/relativeTime";
import type { CommunityDoc, FindingDoc, HypothesisDoc, LeadDoc } from "../../lib/collections";

// Home, rebuilt around the pipeline instead of around an inbox.
//
// The old version opened with "today's move" and stacked six unrelated cards — a next action, a
// queue preview, community stats, findings, revenue — which meant the first question it answered
// was "what should I do in the next 30 seconds" and it never answered "what has Kylani actually
// found for me". That is backwards for a page you visit once a day.
//
// Now it reads in the same order the product works: where the run got to (the rail), who Kylani
// thinks buys this and what those people actually said (the segment cards), then what is waiting.
// One idea per block, no cross-referencing.

type Lead = LeadDoc & { _id: string };
type Community = CommunityDoc & { _id: string };
type Finding = FindingDoc & { _id: string };
type Hypothesis = HypothesisDoc & { _id: string };
type Campaign = {
  productName: string;
  productUrl: string;
  whatYouSell?: string;
  problem?: string;
  stats: { contactedTotal: number; buyersTotal: number; repliedTotal: number; callsBooked: number; communitiesTotal: number };
};

const scoreOf = (l: Lead) => (typeof l.scoreTotal === "number" ? l.scoreTotal : (l.stars ?? 0) * 20);

export default function HomePage() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [communities, setCommunities] = useState<Community[] | null>(null);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [hypotheses, setHypotheses] = useState<Hypothesis[] | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadJson = (url: string) => fetch(url).then((r) => r.json().then((data) => ({ ok: r.ok, data })));

    Promise.all([
      loadJson("/api/leads"),
      loadJson("/api/communities"),
      loadJson("/api/findings"),
      loadJson("/api/campaign"),
      loadJson("/api/hypotheses"),
    ])
      .then(([leadsRes, communitiesRes, findingsRes, campaignRes, hypothesesRes]) => {
        if (cancelled) return;
        const failed = [leadsRes, communitiesRes, findingsRes, campaignRes, hypothesesRes].find((r) => !r.ok);
        if (failed) {
          setLoadError(failed.data?.error ?? "Couldn't load Home.");
          return;
        }
        setLeads(leadsRes.data);
        setCommunities(communitiesRes.data);
        setFindings(findingsRes.data.findings);
        setCampaign(campaignRes.data);
        setHypotheses(hypothesesRes.data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't reach the server.");
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Built from real rows only — a segment with no leads says so rather than being hidden, because
  // "this buyer guess produced nobody" is a finding in itself.
  const segments = useMemo<Segment[]>(() => {
    if (!leads || !hypotheses) return [];
    const total = leads.length || 1;
    return hypotheses.map((h) => {
      const mine = leads.filter((l) => l.hypothesisKey === h.key);
      const best = [...mine].sort((a, b) => scoreOf(b) - scoreOf(a))[0] ?? null;
      const venues = [...new Set(mine.map((l) => l.source).filter(Boolean))];
      return {
        key: h.key,
        name: h.name,
        meta: h.meta,
        status: h.status,
        leadCount: mine.length,
        share: mine.length / total,
        waiting: mine.filter((l) => l.status === "waiting").length,
        quote: best?.excerpt ?? best?.quote ?? null,
        quoteAuthor: best ? `${best.name}${best.source ? ` · ${best.source}` : ""}` : null,
        quoteHref: best?.permalink ?? best?.sourceUrl ?? null,
        venues,
      };
    });
  }, [leads, hypotheses]);

  if (loadError) {
    return (
      <DashboardShell active="home">
        <div style={{ padding: "36px 5vw", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14 }}>
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 18 }}>Couldn&apos;t load Home.</span>
          <span style={{ fontSize: 14.5, color: "var(--muted)" }}>{loadError}</span>
          <button className="ky-btn-ember" onClick={() => { setLoadError(null); setAttempt((a) => a + 1); }} style={{ padding: "11px 20px", fontSize: 14.5, border: "none" }}>
            Try again
          </button>
        </div>
      </DashboardShell>
    );
  }

  if (!leads || !communities || !findings || !campaign || !hypotheses) {
    return (
      <DashboardShell active="home">
        <div style={{ padding: "36px 5vw", color: "var(--muted)" }}>Loading…</div>
      </DashboardShell>
    );
  }

  const waiting = leads.filter((l) => l.status === "waiting");
  const drafted = leads.filter((l) => l.draft);
  const latestFinding = findings[0] ?? null;
  // Null rather than 0% until something has actually been sent — a 0% reply rate on zero sends is
  // a fabricated stat, not a bad result.
  const replyRate =
    campaign.stats.contactedTotal > 0 ? Math.round((campaign.stats.repliedTotal / campaign.stats.contactedTotal) * 100) : null;

  // Each stage is done only if it actually produced something. The first stage that hasn't is the
  // one you're on — which is also the honest answer when a search came back thin.
  const doneFlags = [
    Boolean(campaign.whatYouSell),
    hypotheses.length > 0,
    communities.length > 0,
    leads.length > 0,
    drafted.length > 0,
    findings.length > 0,
  ];
  const activeIndex = doneFlags.findIndex((d) => !d);
  const STEP_META: { label: string; href?: string; detail: string }[] = [
    { label: "Read your product", href: "/app/settings", detail: campaign.productUrl },
    { label: "Name your buyers", href: "/app/map", detail: `${hypotheses.length} ${hypotheses.length === 1 ? "buyer" : "buyers"}` },
    { label: "Find their communities", href: "/app/map", detail: `${communities.length} found` },
    { label: "Find real people", href: "/app/queue", detail: `${leads.length} found` },
    { label: "Write the first draft", href: "/app/queue", detail: `${drafted.length} drafted` },
    { label: "Learn what works", href: "/app/findings", detail: `${findings.length} ${findings.length === 1 ? "finding" : "findings"}` },
  ];
  const steps: Step[] = STEP_META.map((m, i) => ({
    n: i + 1,
    label: m.label,
    href: m.href,
    detail: doneFlags[i] ? m.detail : undefined,
    state: doneFlags[i] ? "done" : i === activeIndex ? "active" : "pending",
  }));

  const topWaiting = [...waiting].sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, 3);
  // Ranked by people actually found there, not by member count — a huge community that yielded
  // nobody is not a good place to spend time, whatever its size says.
  const topCommunities = communities
    .map((c) => ({ ...c, leadCount: leads.filter((l) => l.source === c.name).length }))
    .sort((a, b) => b.leadCount - a.leadCount)
    .slice(0, 5);

  return (
    <DashboardShell active="home">
      <div style={{ padding: "32px 5vw 60px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 26, maxWidth: 1220, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>{campaign.productUrl}</span>
            <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(24px,3vw,32px)", lineHeight: 1.08, letterSpacing: "-.03em", margin: 0 }}>
              {campaign.productName}
            </h1>
            {campaign.whatYouSell && (
              <span style={{ fontSize: 14.5, color: "var(--muted)", lineHeight: 1.5, maxWidth: "62ch" }}>{campaign.whatYouSell}</span>
            )}
          </div>
          <SearchAgainButton />
        </div>

        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "14px 18px" }}>
          <StepRail steps={steps} />
        </div>

        {/* The numbers that answer "how is this actually going" without opening another page.
            Every one is counted from real rows — a zero shows as a zero. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          {(
            [
              { label: "People found", value: leads.length, href: "/app/queue" },
              { label: "Waiting on you", value: waiting.length, href: "/app/queue", accent: waiting.length > 0 },
              { label: "Communities", value: communities.length, href: "/app/map" },
              { label: "Approved", value: leads.filter((l) => l.status === "approved" || l.status === "sent").length, href: "/app/queue" },
              { label: "Replied", value: leads.filter((l) => l.status === "replied").length, href: "/app/queue" },
              { label: "Reply rate", value: replyRate === null ? "—" : `${replyRate}%`, href: "/app/findings" },
            ] as { label: string; value: number | string; href: string; accent?: boolean }[]
          ).map((s) => (
            <Link
              key={s.label}
              href={s.href}
              style={{
                background: "var(--card)",
                border: `1px solid ${s.accent ? "var(--ember)" : "var(--border)"}`,
                borderRadius: 14,
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 2,
                textDecoration: "none",
                color: "inherit",
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-outfit)",
                  fontWeight: 800,
                  fontSize: 26,
                  letterSpacing: "-.03em",
                  fontVariantNumeric: "tabular-nums",
                  color: s.accent ? "var(--ember)" : "var(--ink)",
                }}
              >
                {s.value}
              </span>
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{s.label}</span>
            </Link>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <h2 style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 19, letterSpacing: "-.02em", margin: 0 }}>
              Who Kylani thinks buys this
            </h2>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              {leads.length} {leads.length === 1 ? "person" : "people"} across {communities.length}{" "}
              {communities.length === 1 ? "community" : "communities"}
            </span>
          </div>

          {segments.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
              {segments.map((s) => (
                <SegmentCard key={s.key} segment={s} />
              ))}
            </div>
          ) : (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "26px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 16 }}>No buyers named yet.</span>
              <span style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>
                Run a search and Kylani will propose two to four buyer hypotheses, then go looking for real people
                matching each one.
              </span>
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 16 }} className="home-lower">
          <style>{`
            @media (max-width: 1100px) { .home-lower { grid-template-columns: 1fr 1fr !important; } }
            @media (max-width: 760px) { .home-lower { grid-template-columns: 1fr !important; } }
          `}</style>

          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 16, letterSpacing: "-.02em" }}>Waiting on you</span>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>{waiting.length} to review</span>
            </div>
            {topWaiting.length > 0 ? (
              <>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {topWaiting.map((l, i) => (
                    <Link
                      key={l._id}
                      href="/app/queue"
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 10,
                        padding: "11px 0",
                        borderTop: i === 0 ? "none" : "1px solid var(--border)",
                        textDecoration: "none",
                        color: "inherit",
                        minWidth: 0,
                      }}
                    >
                      <span style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: "nowrap" }}>{l.name}</span>
                      <span style={{ fontSize: 13, color: "var(--muted)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {l.excerpt ?? l.detail}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {l.postedAt ? relativeTime(l.postedAt as unknown as string) : l.source}
                      </span>
                    </Link>
                  ))}
                </div>
                <Link href="/app/queue" className="ky-btn-ember" style={{ padding: "10px 18px", fontSize: 14, border: "none", alignSelf: "flex-start" }}>
                  Open the queue
                </Link>
              </>
            ) : (
              <span style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>
                {leads.length === 0
                  ? "Nothing found yet. Run a search and anything real will land here."
                  : "Everything found so far has been reviewed. Search again when you want more."}
              </span>
            )}
          </div>

          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 16, letterSpacing: "-.02em" }}>Where they are</span>
              <Link href="/app/map" style={{ fontSize: 13, color: "var(--ember)", fontWeight: 700, textDecoration: "none" }}>
                Map →
              </Link>
            </div>
            {topCommunities.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {topCommunities.map((c, i) => (
                  <div key={c._id} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "9px 0", borderTop: i === 0 ? "none" : "1px solid var(--border)", minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    <span style={{ fontSize: 12.5, color: "var(--muted)", whiteSpace: "nowrap" }}>{c.leadCount} found</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: c.fit === "Strong fit" ? "var(--green)" : "var(--muted)", whiteSpace: "nowrap" }}>{c.fit}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>No communities confirmed yet.</span>
            )}
          </div>

          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 16, letterSpacing: "-.02em" }}>What Kylani has learnt</span>
            {latestFinding ? (
              <>
                <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".08em", color: "var(--ember)" }}>{latestFinding.tag.toUpperCase()}</span>
                <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 16.5, lineHeight: 1.3, letterSpacing: "-.02em" }}>{latestFinding.headline}</span>
                <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>{latestFinding.body}</span>
                <Link href="/app/findings" style={{ fontSize: 13, fontWeight: 700, color: "var(--ember)", textDecoration: "none", marginTop: "auto" }}>
                  All findings →
                </Link>
              </>
            ) : (
              <span style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>
                Nothing yet — findings come from real replies, so this fills in once messages have gone out and people
                have answered. Kylani won&apos;t guess at them.
              </span>
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
