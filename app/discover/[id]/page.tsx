"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import KylaniLogo from "../../../components/icons/KylaniLogo";
import { relativeTime } from "../../../lib/relativeTime";
import type { DiscoverLead } from "../../../lib/discover/collections";
import { anonId as getAnonId, sinceFlowStart, trackClient } from "../../../lib/discover/clientTrack";
import SearchWheel, { type FieldVenue } from "../../../components/discover/SearchWheel";
import Avatar from "../../../components/Avatar";

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
            <style>{`@media (max-width: 900px) { .dv-grid { grid-template-columns: 1fr !important; } }`}</style>

            {/* What Kylani inferred — chips beside the results, never a question in front of them. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
              <WorkPanel working={working} narration={narration} progress={progress} leadCount={leads.length} field={fieldFor(true)} />
              <PeoplePanel
                leads={leads}
                onJump={(fp) => {
                  markInteraction(fp);
                  document.getElementById(`lead-${fp}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
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
}: {
  working: boolean;
  narration: string[];
  progress: { scanned: number; total: number };
  leadCount: number;
  field: React.ReactNode;
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
  return (
    <div
      onMouseEnter={onInteract}
      className={isNew ? "ky-fade-in" : undefined}
      style={{
        background: "var(--card)",
        border: `1px solid ${pinned ? "var(--border-strong)" : "var(--border)"}`,
        borderRadius: 14,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minWidth: 0,
      }}
    >
      {lead.summary ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)" }}>WHAT THEY NEED</span>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 17.5, fontWeight: 700, lineHeight: 1.32, letterSpacing: "-.01em", color: "var(--ink)" }}>
            {lead.summary}
          </span>
        </div>
      ) : (
        // No summary is a real state — a lead can reach the screen before anything has restated it.
        // The quote steps up to carry the card rather than a placeholder sentence being written for
        // it, and the label says which kind of text this is so the two cards do not read as one.
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)" }}>WHAT THEY SAID</span>
      )}

      <blockquote
        style={{
          margin: 0,
          borderLeft: "2px solid var(--ember)",
          padding: "1px 0 1px 13px",
          fontSize: lead.summary ? 13.5 : 15,
          lineHeight: 1.55,
          color: lead.summary ? "var(--muted-strong)" : "var(--ink)",
        }}
      >
        &ldquo;{lead.excerpt}&rdquo;
      </blockquote>

      {/* Who this is. `person` is present only when the crawler's enrichment pass has actually met
          them, so a card with nothing known says the handle and the venue and stops — it never
          renders an empty profile block implying they have no bio. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
        <Avatar displayName={name} handle={lead.author} size={32} />
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{name || lead.author}</span>
          {name && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{lead.author}</span>}
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>· {lead.venueName}</span>
          {person?.tenure && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>· {person.tenure}</span>}
          <span style={{ fontSize: 12.5, color: "var(--muted)", marginLeft: "auto" }}>{relativeTime(lead.postedAt as unknown as string)}</span>
        </div>
        {person?.bio && (
          // Their own words from their own profile, so it is safe to show as a description of them.
          <span style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {person.bio}
          </span>
        )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {lead.matchedFor.slice(0, 3).map((m) => (
          <span key={m} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", background: "var(--card-alt)", padding: "3px 8px", borderRadius: 999 }}>
            matched &ldquo;{m}&rdquo;
          </span>
        ))}
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 12 }}>
          {person?.profileUrl && (
            <a href={person.profileUrl} target="_blank" rel="noopener noreferrer" onClick={onInteract} style={{ fontSize: 12.5, fontWeight: 600, color: "var(--muted-strong)" }}>
              Profile
            </a>
          )}
          <a href={lead.permalink} target="_blank" rel="noopener noreferrer" onClick={onInteract} style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ember)" }}>
            Read the post →
          </a>
        </span>
      </div>
    </div>
  );
}

/**
 * The people found, beside the communities searched.
 *
 * The sidebar has always answered "where did we look" and never "who turned up" — which is odd for
 * a product whose whole promise is individuals rather than lists. Communities are the map; this is
 * the result. It only ever renders people already on screen in the list below, so it is a second
 * view of the same truth rather than a second claim.
 */
function PeoplePanel({ leads, onJump }: { leads: DiscoverLead[]; onJump: (fingerprint: string) => void }) {
  if (leads.length === 0) return null;
  const enriched = leads.filter((l) => l.person?.bio || l.person?.displayName).length;

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)" }}>WHO TURNED UP</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 9, maxHeight: 300, overflowY: "auto" }}>
        {leads.slice(0, 12).map((l) => (
          <button
            key={l.personFingerprint}
            onClick={() => onJump(l.personFingerprint)}
            style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}
          >
            <Avatar displayName={l.person?.displayName} handle={l.author} size={30} />
            <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {l.person?.displayName?.trim() || l.author}
              </span>
              <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {l.person?.bio || l.venueName}
              </span>
            </span>
          </button>
        ))}
      </div>
      {/* Said plainly rather than hidden. Enrichment runs on its own schedule on the worker, so
          "we have not looked these people up yet" is a normal state — and stating it is better than
          a sidebar that silently shows handles and lets the reader assume that is all there is. */}
      {enriched < leads.length && (
        <span style={{ fontSize: 11.5, color: "var(--faint)", lineHeight: 1.45 }}>
          {enriched} of {leads.length} looked up so far — the rest are still queued.
        </span>
      )}
    </div>
  );
}
