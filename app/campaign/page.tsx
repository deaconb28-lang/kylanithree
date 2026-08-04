"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import SearchAgainButton from "../../components/dashboard/SearchAgainButton";
import SegmentCard, { type Segment } from "../../components/dashboard/SegmentCard";
import { buyerConfidence } from "../../lib/buyers/confidence";
import Funnel from "../../components/campaign/Funnel";
import Stage from "../../components/campaign/Stage";
import { relativeTime } from "../../lib/relativeTime";
import type { CommunityDoc, FindingDoc, HypothesisDoc, LeadDoc } from "../../lib/collections";

// The campaign command center.
//
// It answers three questions, in this order: is the machine running, what does it believe about my
// buyer, what does it need from me. Everything else is a destination you enter from here.
//
// Structurally it is a pipeline narrative rather than a dashboard — the same shape the product
// actually performs, with a real artifact at each step instead of a count of one. "4 buyers" tells
// a founder nothing; "operations manager at a 20-100 person 3PL, 41 contacted, both replies came
// from here" tells them everything. What it replaced was a six-step setup checklist that stayed on
// screen after it was finished, a grid of six metric tiles, and three unrelated panels.
//
// Two rules hold the visual together. Exactly ONE element carries the coral accent — the funnel
// stage that needs the person, or the primary button when nothing does; coral previously appeared
// on the sidebar, a tile, a badge and a CTA simultaneously, which meant it signalled nothing. And
// the serif is for the campaign name, funnel counts and section headings only; everything
// functional is sans.

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
        // Derived from the leads themselves rather than read off the hypothesis. `dropped` is the
        // status a rejection writes, so it is the rejection count for this buyer; `sent` and
        // `replied` are structurally zero until the Gmail scope is verified, and the formula is
        // built to say "nothing is proven" rather than to divide by them.
        confidence: buyerConfidence(
          {
            leadsShown: mine.length,
            rejections: mine.filter((l) => l.status === "dropped").length,
            contacted: mine.filter((l) => l.status === "sent" || l.status === "replied").length,
            replied: mine.filter((l) => l.status === "replied").length,
            booked: mine.filter((l) => l.feedback === "landed").length,
          },
          { retired: h.status === "paused" },
        ),
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

  // Ranked, the way Explee ranks its fit table — strongest evidence first rather than whatever
  // order the hypotheses happened to be written in. Confidence leads where there is a score, and
  // leads found breaks the tie, which today is almost always the operative term: nothing can be
  // sent, so most hypotheses honestly have no score at all.
  const rankedSegments = useMemo(
    () =>
      [...segments].sort((a, b) => {
        const byScore = (b.confidence.score ?? -1) - (a.confidence.score ?? -1);
        return byScore !== 0 ? byScore : b.leadCount - a.leadCount;
      }),
    [segments],
  );

  if (loadError) {
    return (
      <DashboardShell active="campaign">
        <div style={{ padding: "36px 5vw", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14 }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>Couldn&apos;t load Home.</span>
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
      <DashboardShell active="campaign">
        <div style={{ padding: "36px 5vw", color: "var(--muted)" }}>Loading…</div>
      </DashboardShell>
    );
  }

  const waiting = leads.filter((l) => l.status === "waiting");
  const approved = leads.filter((l) => l.status === "approved" || l.status === "sent");
  const replied = leads.filter((l) => l.status === "replied");

  // Ranked by people actually found there, not by member count — a huge community that yielded
  // nobody is not a good place to spend time, whatever its size says.
  const topCommunities = communities
    .map((c) => ({ ...c, leadCount: leads.filter((l) => l.source === c.name).length }))
    .sort((a, b) => b.leadCount - a.leadCount)
    .slice(0, 6);

  const topWaiting = [...waiting].sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, 3);

  // The five stages of one pipeline. Sent and Replied point at Work filtered by status rather than
  // at a Threads screen, because sending is blocked on Google's OAuth verification and a link to an
  // empty room is worse than a link to a real filter.
  const stages = [
    { key: "communities", label: "Communities", value: communities.length, href: "#communities" },
    { key: "found", label: "People found", value: leads.length, href: "/campaign/work" },
    { key: "approve", label: "To approve", value: waiting.length, href: "/campaign/work?filter=unread" },
    { key: "sent", label: "Sent", value: approved.length, href: "/campaign/work?filter=all" },
    { key: "replied", label: "Replied", value: replied.length, href: "/campaign/work?filter=all" },
  ];

  // One accent, and it goes to whatever needs a human. A reply outranks a new lead; if neither is
  // waiting the accent leaves the funnel entirely and the primary button carries it alone.
  const accentKey = replied.length > 0 ? "replied" : waiting.length > 0 ? "approve" : null;

  // The status line is the only place that says what Kylani is doing right now.
  const status =
    waiting.length > 0
      ? { dot: "var(--ember)", text: `${waiting.length} waiting for you` }
      : leads.length > 0
        ? { dot: "var(--green)", text: "up to date — nothing waiting" }
        : { dot: "var(--muted)", text: "no people found yet" };

  return (
    <DashboardShell active="campaign">
      <div
        style={{
          padding: "clamp(20px, 4vw, 34px) clamp(16px, 5vw, 40px) 72px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 22,
          maxWidth: 1080,
          margin: "0 auto",
        }}
      >
        <header style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--muted)" }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: status.dot, flexShrink: 0 }} />
              {status.text}
            </span>
            <Link
              href="/app/settings"
              aria-label="Campaign settings"
              style={{ marginLeft: "auto", fontSize: 13, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              Settings
            </Link>
          </div>

          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "clamp(26px, 5vw, 38px)",
              lineHeight: 1.05,
              letterSpacing: "-.03em",
              margin: 0,
            }}
          >
            {campaign.productName}
          </h1>
          <span style={{ fontSize: 13.5, color: "var(--muted)", wordBreak: "break-word" }}>{campaign.productUrl}</span>
        </header>

        <Funnel stages={stages} accentKey={accentKey} />

        {/* Exactly one primary button on this screen. */}
        {waiting.length > 0 ? (
          <Link
            href="/campaign/work?filter=unread"
            className="ky-btn-ember ky-primary-cta"
            style={{ padding: "15px 24px", fontSize: 15.5, fontWeight: 600, border: "none" }}
          >
            Work the queue · {waiting.length} waiting
          </Link>
        ) : (
          <div style={{ display: "flex" }}>
            <SearchAgainButton />
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
          <Stage
            n={1}
            title="What Kylani read"
            aside={
              <Link href="/app/settings" style={{ fontSize: 13, color: "var(--muted)" }}>
                Correct this
              </Link>
            }
          >
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "var(--muted-strong)", maxWidth: "64ch" }}>
              {campaign.whatYouSell || "Nothing read yet — run a search and Kylani will describe your product back to you."}
            </p>
          </Stage>

          <Stage
            n={2}
            title="Who buys this"
            aside={
              segments.length > 0 ? (
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  {segments.length} {segments.length === 1 ? "theory" : "theories"}
                </span>
              ) : null
            }
          >
            {segments.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 14 }}>
                {rankedSegments.map((s) => (
                  <SegmentCard key={s.key} segment={s} />
                ))}
              </div>
            ) : (
              <EmptyNote>Run a search and Kylani will propose two to four buyers, then go looking for real people matching each one.</EmptyNote>
            )}
          </Stage>

          <Stage
            n={3}
            title="Who it found"
            aside={
              leads.length > 0 ? (
                <Link href="/campaign/work" style={{ fontSize: 13, fontWeight: 600, color: "var(--ember)" }}>
                  See all {leads.length} →
                </Link>
              ) : null
            }
          >
            {topWaiting.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {topWaiting.map((l) => (
                  <Link
                    key={l._id}
                    href="/campaign/work"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 14,
                      padding: "14px 16px",
                      textDecoration: "none",
                      color: "inherit",
                      minWidth: 0,
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14.5, fontWeight: 700 }}>{l.name}</span>
                      {l.role && <span style={{ fontSize: 13, color: "var(--muted)" }}>{l.role}</span>}
                      {l.company && <span style={{ fontSize: 13, color: "var(--muted)" }}>· {l.company}</span>}
                    </span>
                    {l.excerpt && (
                      <span style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--muted-strong)" }}>{l.excerpt}</span>
                    )}
                    {l.source && <span style={{ fontSize: 12, color: "var(--faint)" }}>{l.source}</span>}
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyNote>Nothing waiting. Kylani is still searching — new people land here.</EmptyNote>
            )}
          </Stage>

          <Stage
            n={4}
            title="Where they are"
            aside={<span id="communities" style={{ fontSize: 13, color: "var(--muted)" }}>{communities.length} searched</span>}
          >
            {topCommunities.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {topCommunities.map((c, i) => (
                  <div
                    key={c._id}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 12,
                      padding: "11px 2px",
                      borderTop: i === 0 ? "none" : "1px solid var(--border)",
                      minWidth: 0,
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.name}
                    </span>
                    <span className="ky-tnum" style={{ marginLeft: "auto", fontSize: 13, color: c.leadCount > 0 ? "var(--ink)" : "var(--faint)", flexShrink: 0 }}>
                      {c.leadCount > 0 ? `${c.leadCount} ${c.leadCount === 1 ? "person" : "people"}` : "none yet"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyNote>No communities resolved yet.</EmptyNote>
            )}
          </Stage>

          {findings.length > 0 && (
            <Stage n={5} title="What Kylani learned">
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {findings.slice(0, 4).map((f) => (
                  <div key={f._id} style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{f.headline}</span>
                    <span style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--muted)" }}>{f.body}</span>
                    <span style={{ fontSize: 12, color: "var(--faint)" }}>{relativeTime(f.createdAt as unknown as string)}</span>
                  </div>
                ))}
              </div>
            </Stage>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

/** A quiet, verb-led note for a section with nothing in it yet. Never an apology. */
function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--muted)", maxWidth: "58ch" }}>{children}</p>
  );
}
