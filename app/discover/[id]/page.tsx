"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import KylaniLogo from "../../../components/icons/KylaniLogo";
import { relativeTime } from "../../../lib/relativeTime";
import type { DiscoverLead } from "../../../lib/discover/collections";
import { anonId as getAnonId, sinceFlowStart, trackClient } from "../../../lib/discover/clientTrack";
import SearchWheel, { type FieldVenue } from "../../../components/discover/SearchWheel";
import Avatar from "../../../components/Avatar";
import { highlightSegments } from "../../../lib/search/excerpt";

// The whole onboarding, on one screen.
//
// Results appear and keep growing; nothing here is a step. The framing is deliberately "still
// finding more" rather than "these are preliminary" — a pass-1 lead is a real person who really
// said that, and hedging it would devalue the thing that makes the first eight seconds work.

type Fast = { whatYouSell: string; keywords: string[]; nicheKey: string };

export default function DiscoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [leads, setLeads] = useState<DiscoverLead[]>([]);
  const [fast, setFast] = useState<Fast | null>(null);
  const [narration, setNarration] = useState<string[]>([]);
  const [progress, setProgress] = useState({ scanned: 0, total: 0 });
  const [venues, setVenues] = useState<FieldVenue[]>([]);
  const [scanningIds, setScanningIds] = useState<string[]>([]);
  const [scannedIds, setScannedIds] = useState<string[]>([]);
  const [done, setDone] = useState<{ total: number; partial: boolean; message?: string | null } | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const interacted = useRef(false);
  const firstLead = useRef(false);
  const anonId = useRef<string>("");

  // A card the user has touched is pinned — the merge policy keeps it at its index while everything
  // around it re-ranks, so the list can keep improving without moving what someone is reading.
  const [pinned, setPinned] = useState<Set<string>>(new Set());

  const markInteraction = useCallback(
    (fingerprint?: string) => {
      if (fingerprint) setPinned((p) => new Set(p).add(fingerprint));
      if (interacted.current) return;
      interacted.current = true;
      trackClient("first_interaction", { flow: "discover", searchId: id, ms: sinceFlowStart() });
    },
    [id],
  );

  useEffect(() => {
    anonId.current = getAnonId();
    trackClient("discover_view", { flow: "discover", searchId: id });

    const source = new EventSource(`/api/discover/${id}/stream?anonId=${encodeURIComponent(anonId.current)}`);

    source.addEventListener("inference", (e) => setFast(JSON.parse((e as MessageEvent).data).fast));
    source.addEventListener("narration", (e) => {
      const { text } = JSON.parse((e as MessageEvent).data);
      setNarration((n) => [...n.slice(-3), text]);
    });
    source.addEventListener("leads", (e) => {
      const payload = JSON.parse((e as MessageEvent).data) as { leads: DiscoverLead[]; added: string[] };
      if (payload.leads.length > 0 && !firstLead.current) {
        firstLead.current = true;
        trackClient("first_lead_shown", { flow: "discover", searchId: id, ms: sinceFlowStart() });
      }
      setLeads(payload.leads);
      setAdded(new Set(payload.added));
    });
    source.addEventListener("venues", (e) => setVenues(JSON.parse((e as MessageEvent).data).venues ?? []));
    source.addEventListener("progress", (e) => {
      // Partial by design — a mid-shard event carries only `scanningIds`, so each field is applied
      // only when the server actually sent it rather than reset to zero by the ones it did not.
      const p = JSON.parse((e as MessageEvent).data);
      if (p.communitiesTotal !== undefined || p.communitiesScanned !== undefined) {
        setProgress((prev) => ({ scanned: p.communitiesScanned ?? prev.scanned, total: p.communitiesTotal ?? prev.total }));
      }
      if (p.scanningIds) setScanningIds(p.scanningIds);
      if (p.scannedIds) setScannedIds(p.scannedIds);
    });
    source.addEventListener("complete", (e) => {
      setDone(JSON.parse((e as MessageEvent).data));
      source.close();
    });
    source.onerror = () => {
      // A dropped connection is not a dead end — whatever already rendered stays on screen.
      source.close();
      setDone((d) => d ?? { total: 0, partial: true });
    };

    return () => source.close();
  }, [id]);

  const working = done === null;

  // Every community on the map, whether the deep pass named it or a pass-1 lead came from it — a
  // node the founder can already see a person from must not be missing from the picture.
  const fieldVenues = useMemo(() => {
    const byName = new Map<string, FieldVenue>();
    for (const v of venues) byName.set(v.name, v);
    for (const l of leads) {
      if (!byName.has(l.venueName)) byName.set(l.venueName, { id: `found:${l.venueName}`, name: l.venueName, platform: l.platform });
    }
    return [...byName.values()];
  }, [venues, leads]);

  const hitsByVenue = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of leads) counts[l.venueName] = (counts[l.venueName] ?? 0) + 1;
    return counts;
  }, [leads]);

  const fieldFor = (compact: boolean) => (
    <SearchWheel
      centerLabel={fast?.nicheKey ? fast.nicheKey.replace(/-/g, " ") : "your product"}
      venues={fieldVenues}
      scanningIds={scanningIds}
      scannedIds={scannedIds}
      hitsByVenue={hitsByVenue}
      working={working}
      compact={compact}
    />
  );

  // Before the first person lands there is nothing to rank, so the search itself gets the whole
  // screen. The moment there is something real to read, it takes the stage and the map steps
  // aside — the layout follows the content rather than reserving space for a state that has passed.
  const searching = leads.length === 0;

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", padding: "24px 5vw 80px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink)" }}>
            <KylaniLogo size={26} />
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>Kylani</span>
          </Link>
          {leads.length > 0 && (
            <Link
              href={`/signin?callbackUrl=${encodeURIComponent(`/campaign/work?claim=${id}`)}`}
              onClick={() => {
                markInteraction();
                trackClient("save_clicked", { flow: "discover", searchId: id, ms: sinceFlowStart() });
              }}
              className="ky-btn-ember"
              style={{ marginLeft: "auto", padding: "10px 18px", fontSize: 14.5 }}
            >
              Save these {leads.length}
            </Link>
          )}
        </div>

        {searching ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28, textAlign: "center", padding: "clamp(8px,4vh,44px) 0 40px" }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(26px,4vw,40px)", letterSpacing: "-.035em", margin: 0, maxWidth: "18ch" }}>
              {done ? "Nobody's describing this problem right now." : "Looking for people describing this problem"}
            </h1>

            <div style={{ width: "min(100%, 480px)" }}>{fieldFor(false)}</div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, minHeight: 46 }}>
              {narration.slice(-2).map((n, i, arr) => (
                <span key={`${n}-${i}`} className="ky-fade-in" style={{ fontSize: 14, color: i === arr.length - 1 ? "var(--muted-strong)" : "var(--muted)" }}>
                  {n}
                </span>
              ))}
            </div>

            {fast && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center", maxWidth: 620 }}>
                {fast.keywords.map((k) => (
                  <span key={k} style={{ fontSize: 12.5, fontWeight: 600, background: "var(--card)", border: "1px solid var(--border)", padding: "5px 11px", borderRadius: 999 }}>
                    &ldquo;{k}&rdquo;
                  </span>
                ))}
              </div>
            )}

            {done && (
              <div style={{ border: "1px solid var(--border-strong)", borderRadius: 14, padding: "18px 22px", background: "var(--card)", maxWidth: 560 }}>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "var(--muted-strong)" }}>
                  {done.message ?? "We searched every community above and nobody there is describing it in these words."} Correcting
                  the description below re-runs the search against different ones.
                </p>
              </div>
            )}

            <div style={{ width: "min(100%, 460px)" }}>
              <InferencePanel
                fast={fast}
                searchId={id}
                anonId={anonId}
                onCorrected={() => markInteraction()}
                onApply={(next, reranked) => {
                  setFast(next);
                  setLeads(reranked);
                }}
              />
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 320px) 1fr", gap: 26 }} className="dv-grid">
            <style>{`@media (max-width: 900px) { .dv-grid { grid-template-columns: 1fr !important; } .dv-side { position: static !important; } }`}</style>

            {/* What Kylani inferred — chips beside the results, never a question in front of them. */}
            {/* Sticky above the 900px breakpoint: the map and the inference are reference material
                for the whole list, and scrolling fourteen leads used to leave both behind. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16, alignSelf: "start", position: "sticky", top: 24 }} className="dv-side">
              <InferencePanel
                fast={fast}
                searchId={id}
                anonId={anonId}
                onCorrected={() => markInteraction()}
                onApply={(next, reranked) => {
                  setFast(next);
                  setLeads(reranked);
                }}
              />
              <WorkPanel
                working={working}
                narration={narration}
                progress={progress}
                leadCount={leads.length}
                field={fieldFor(true)}
                leads={leads}
                onJump={(fp) => {
                  markInteraction(fp);
                  document.getElementById(`lead-${fp}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }} aria-live="polite">
                <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(22px,3vw,30px)", letterSpacing: "-.03em", margin: 0 }}>
                  {leads.length} {leads.length === 1 ? "person" : "people"} describing this problem
                </h1>
                {working && <span style={{ fontSize: 13.5, color: "var(--muted)" }}>still finding more</span>}
              </div>

              {leads.map((l) => (
                <div key={l.personFingerprint} id={`lead-${l.personFingerprint}`}>
                  <LeadCard lead={l} isNew={added.has(l.personFingerprint)} pinned={pinned.has(l.personFingerprint)} onInteract={() => markInteraction(l.personFingerprint)} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InferencePanel({
  fast,
  searchId,
  anonId,
  onCorrected,
  onApply,
}: {
  fast: Fast | null;
  searchId: string;
  anonId: React.RefObject<string>;
  onCorrected: () => void;
  onApply: (fast: Fast, leads: DiscoverLead[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const to = value.trim();
    if (!to || to === fast?.whatYouSell) return setEditing(false);

    setSaving(true);
    onCorrected();
    try {
      const res = await fetch(`/api/discover/${searchId}/correct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonId: anonId.current, field: "whatYouSell", from: fast?.whatYouSell ?? "", to }),
      });
      const data = await res.json();
      // The list re-ranks in place. If the run is still going the stream has already adopted the
      // same correction and will keep building on this order rather than fighting it.
      if (res.ok && data.fast) onApply(data.fast, data.leads ?? []);
    } catch {
      // Nothing to show and nothing to undo — the results on screen are still the results.
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)" }}>WHAT I THINK YOU BUILT</span>
      {!fast ? (
        <div style={{ height: 14, borderRadius: 7, background: "var(--card-alt)" }} />
      ) : editing ? (
        <>
          <textarea
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={3}
            style={{ fontSize: 14.5, lineHeight: 1.5, border: "1px solid var(--border-strong)", borderRadius: 8, padding: 8, fontFamily: "inherit", resize: "vertical" }}
          />
          <button
            onClick={() => void save()}
            disabled={saving}
            className="ky-btn-ember"
            style={{ padding: "8px 14px", fontSize: 13.5, alignSelf: "flex-start" }}
          >
            {saving ? "Searching again…" : "Use this instead"}
          </button>
        </>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>{fast.whatYouSell}</p>
          {/* Seeded here rather than from an effect on `fast`: the inference can be refined while
              this panel is open, and overwriting what someone is typing would be the rudest
              possible way to improve it. */}
          <button onClick={() => { setValue(fast.whatYouSell); setEditing(true); }} style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, fontSize: 13, color: "var(--ember)", fontWeight: 700, cursor: "pointer" }}>
            Not quite — fix it
          </button>
        </>
      )}

      {fast && (
        <>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)", marginTop: 4 }}>SEARCHING FOR</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {fast.keywords.map((k) => (
              <span key={k} style={{ fontSize: 12, fontWeight: 600, background: "var(--card-alt)", border: "1px solid var(--border)", padding: "4px 9px", borderRadius: 999 }}>
                {k}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function WorkPanel({
  working,
  narration,
  progress,
  leadCount,
  field,
  leads,
  onJump,
}: {
  working: boolean;
  narration: string[];
  progress: { scanned: number; total: number };
  leadCount: number;
  field: React.ReactNode;
  leads: DiscoverLead[];
  onJump: (fingerprint: string) => void;
}) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {working && <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--ember)", animation: "kyPulse 1.5s ease-in-out infinite" }} />}
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{working ? "Working" : "Search complete"}</span>
      </div>

      {/* The same map, at sidebar scale. It stays after the search finishes because it is also the
          answer to "where did these people come from" — that is not only a loading state. */}
      <div style={{ margin: "2px 0 4px" }}>{field}</div>
      {progress.total > 0 && (
        <>
          <div style={{ height: 5, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
            <div style={{ width: `${Math.round((progress.scanned / progress.total) * 100)}%`, height: "100%", background: "var(--ember)", transition: "width .4s ease" }} />
          </div>
          <span style={{ fontSize: 12.5, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
            {progress.scanned} of {progress.total} communities · {leadCount} found
          </span>
        </>
      )}
      {/* Who turned up, folded in from what used to be its own panel below this one. That panel
          listed the same fourteen people the cards to the right already show, so it was a whole
          third panel of duplicate information. An overlapping stack keeps the answer to "who" and
          keeps the jump-to-lead click, in one row instead of a panel. */}
      {leads.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7, margin: "2px 0 2px" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {leads.slice(0, 7).map((l, i) => (
              <button
                key={l.personFingerprint}
                onClick={() => onJump(l.personFingerprint)}
                title={l.person?.displayName?.trim() || l.author}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  // A ring in the panel's own background separates the discs where they overlap.
                  borderRadius: 999,
                  boxShadow: "0 0 0 2px var(--card)",
                  marginLeft: i === 0 ? 0 : -8,
                  lineHeight: 0,
                }}
              >
                <Avatar displayName={l.person?.displayName} handle={l.author} size={26} />
              </button>
            ))}
            {leads.length > 7 && (
              <span className="ky-tnum" style={{ marginLeft: 8, fontSize: 12, color: "var(--muted)" }}>+{leads.length - 7}</span>
            )}
          </div>
          {/* Said plainly rather than hidden. Enrichment runs on its own schedule on the worker, so
              "we have not looked these people up yet" is a normal state — and stating it beats
              showing bare handles and letting the reader assume that is all there is. */}
          {leads.filter((l) => l.person?.bio || l.person?.displayName).length < leads.length && (
            <span style={{ fontSize: 11.5, color: "var(--faint)", lineHeight: 1.45 }}>
              {leads.filter((l) => l.person?.bio || l.person?.displayName).length} of {leads.length} looked up so far
            </span>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {narration.map((n, i) => (
          <span key={`${n}-${i}`} className="ky-fade-in" style={{ fontSize: 12.5, color: i === narration.length - 1 ? "var(--muted-strong)" : "var(--muted)", lineHeight: 1.5 }}>
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * One found person.
 *
 * The summary leads. It used to sit third — under the author line, above the quote, at the same
 * weight as everything else — which meant the first thing read on every card was a username, and
 * "what is this about" had to be reconstructed from a quote fragment. A founder scanning twelve of
 * these is asking one question, and the card should answer it in its first line.
 *
 * The summary is plain text and never in quote marks. When the classifier has run it is that
 * classifier's neutral third-person restatement — no human wrote that sentence, and putting it in
 * quotes attributed it to one. The blockquote underneath is the part that is a real quote, always a
 * literal span of the real post.
 */
function LeadCard({ lead, isNew, pinned, onInteract }: { lead: DiscoverLead; isNew: boolean; pinned: boolean; onInteract: () => void }) {
  const person = lead.person;
  const name = person?.displayName?.trim();
  // Only when it differs. `displayName` falls back to the login on Hacker News, Reddit, Bluesky and
  // GitHub, so printing both rendered "noreplydev  noreplydev" on most cards.
  const handle = name && name.toLowerCase() !== lead.author.toLowerCase() ? lead.author : null;

  const segments = highlightSegments(lead.excerpt, lead.matchedFor);
  const highlighted = segments.some((seg) => seg.marked);
  // The card must still be able to say why this person is here. Normally the mark in the quote does
  // it; when the phrase cannot be located in the shown span, the words are named instead.
  const unlocated = !highlighted && lead.matchedFor.length > 0 ? lead.matchedFor.slice(0, 2) : [];

  const identity = (
    <>
      <Avatar displayName={name} handle={lead.author} size={30} />
      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{name || lead.author}</span>
    </>
  );

  return (
    <div
      onMouseEnter={onInteract}
      className={isNew ? "ky-fade-in" : undefined}
      style={{
        // No border. Fourteen outlined boxes were most of this page's noise, and a white card on
        // cream paper already reads as a card. Pinned swaps the background instead — --active-bg is
        // documented as marking a persistent selection, which is exactly what a pin is.
        background: pinned ? "var(--active-bg)" : "var(--card)",
        borderRadius: 14,
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minWidth: 0,
      }}
    >
      {lead.summary ? (
        // No "WHAT THEY NEED" label. It taught nothing after the first card and cost a band on all
        // fourteen. Clamped to three lines because it was unbounded, and a classifier restatement of
        // a long GitHub issue could run away with the card.
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 16.5,
            fontWeight: 700,
            lineHeight: 1.35,
            letterSpacing: "-.01em",
            color: "var(--ink)",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {lead.summary}
        </span>
      ) : (
        // Kept here and only here: with no summary the quote carries the card, and the label is what
        // stops the two shapes reading as the same thing.
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)" }}>WHAT THEY SAID</span>
      )}

      {/* The evidence, with the founder's own words marked inside it. That mark replaced a
          `matched "..."` chip on its own row — the same phrase restated on every card. Showing
          where the match landed says more, in no space at all. */}
      <blockquote
        style={{
          margin: 0,
          borderLeft: "2px solid var(--border-strong)",
          padding: "1px 0 1px 13px",
          fontSize: 14,
          lineHeight: 1.55,
          color: lead.summary ? "var(--muted-strong)" : "var(--ink)",
        }}
      >
        &ldquo;
        {segments.map((seg, i) =>
          seg.marked ? (
            <mark key={i} style={{ background: "var(--ember-tint)", color: "inherit", padding: "1px 2px", borderRadius: 3 }}>
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
        &rdquo;
      </blockquote>

      {/* One line for the person, replacing what used to be an identity row, a bio row and an
          actions row. The avatar and name ARE the profile link, so the separate "Profile" link is
          folded in rather than dropped. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0, fontSize: 12.5, color: "var(--muted)" }}>
        {person?.profileUrl ? (
          <a
            href={person.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onInteract}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" }}
          >
            {identity}
          </a>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>{identity}</span>
        )}
        {handle && <span>{handle}</span>}
        <span>· {lead.venueName}</span>
        {/* `describeTenure` no longer repeats the platform, so this reads "17 months" rather than
            "Hacker News · 17 months on Hacker News". */}
        {person?.tenure && <span>· {person.tenure}</span>}
        <span>· {relativeTime(lead.postedAt as unknown as string)}</span>
        {unlocated.length > 0 && <span>· matched {unlocated.map((m) => `\u201c${m}\u201d`).join(", ")}</span>}
        <a
          href={lead.permalink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onInteract}
          style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, color: "var(--ember)", whiteSpace: "nowrap" }}
        >
          Read the post →
        </a>
      </div>

      {person?.bio && (
        // Their own words from their own profile. One line rather than two — real value, but not
        // enough to always cost a full band.
        <span style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {person.bio}
        </span>
      )}
    </div>
  );
}
