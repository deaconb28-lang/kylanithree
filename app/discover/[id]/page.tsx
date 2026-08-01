"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import KylaniLogo from "../../../components/icons/KylaniLogo";
import { relativeTime } from "../../../lib/relativeTime";
import type { DiscoverLead } from "../../../lib/discover/collections";
import { anonId as getAnonId, sinceFlowStart, trackClient } from "../../../lib/discover/clientTrack";

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
    source.addEventListener("progress", (e) => {
      const p = JSON.parse((e as MessageEvent).data);
      setProgress({ scanned: p.communitiesScanned ?? 0, total: p.communitiesTotal ?? 0 });
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

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", padding: "24px 5vw 80px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink)" }}>
            <KylaniLogo size={26} />
            <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 18 }}>Kylani</span>
          </Link>
          {leads.length > 0 && (
            <Link
              href={`/signin?callbackUrl=${encodeURIComponent(`/app/queue?claim=${id}`)}`}
              onClick={() => {
                markInteraction();
                trackClient("save_clicked", { flow: "discover", searchId: id, ms: sinceFlowStart() });
              }}
              className="ky-btn-ember"
              style={{ marginLeft: "auto", padding: "10px 18px", fontSize: 14.5, border: "none" }}
            >
              Save these {leads.length}
            </Link>
          )}
        </div>

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
            <WorkPanel working={working} narration={narration} progress={progress} leadCount={leads.length} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(22px,3vw,30px)", letterSpacing: "-.03em", margin: 0 }}>
                {leads.length > 0 ? `${leads.length} ${leads.length === 1 ? "person" : "people"} describing this problem` : "Looking for people describing this problem"}
              </h1>
              {working && <span style={{ fontSize: 13.5, color: "var(--muted)" }}>still finding more</span>}
            </div>

            {leads.length === 0 && working && <SkeletonRows />}

            {leads.map((l) => (
              <LeadCard key={l.personFingerprint} lead={l} isNew={added.has(l.personFingerprint)} pinned={pinned.has(l.personFingerprint)} onInteract={() => markInteraction(l.personFingerprint)} />
            ))}

            {done && leads.length === 0 && (
              <div style={{ border: "1px solid var(--border-strong)", borderRadius: 14, padding: "20px 22px", background: "var(--card)" }}>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
                  {done.message ?? "Nobody in the sources we searched is describing this problem right now."} Correcting the
                  product description on the left re-runs the search against different words.
                </p>
              </div>
            )}
          </div>
        </div>
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
            style={{ padding: "8px 14px", fontSize: 13.5, border: "none", alignSelf: "flex-start", opacity: saving ? 0.6 : 1 }}
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
}: {
  working: boolean;
  narration: string[];
  progress: { scanned: number; total: number };
  leadCount: number;
}) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {working && <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--ember)", animation: "kyPulse 1.5s ease-in-out infinite" }} />}
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{working ? "Working" : "Search complete"}</span>
      </div>
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

function LeadCard({ lead, isNew, pinned, onInteract }: { lead: DiscoverLead; isNew: boolean; pinned: boolean; onInteract: () => void }) {
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
        gap: 9,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{lead.author}</span>
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{lead.venueName}</span>
        <span style={{ fontSize: 12.5, color: "var(--muted)", marginLeft: "auto" }}>{relativeTime(lead.postedAt as unknown as string)}</span>
      </div>
      <blockquote style={{ margin: 0, borderLeft: "2px solid var(--ember)", padding: "1px 0 1px 13px", fontSize: 14, lineHeight: 1.55, color: "var(--muted-strong)" }}>
        &ldquo;{lead.excerpt}&rdquo;
      </blockquote>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {lead.matchedFor.slice(0, 3).map((m) => (
          <span key={m} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", background: "var(--card-alt)", padding: "3px 8px", borderRadius: 999 }}>
            matched &ldquo;{m}&rdquo;
          </span>
        ))}
        <a href={lead.permalink} target="_blank" rel="noopener noreferrer" onClick={onInteract} style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, color: "var(--ember)" }}>
          Read the post →
        </a>
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10, opacity: 1 - i * 0.25 }}>
          <div style={{ height: 12, width: "38%", borderRadius: 6, background: "var(--card-alt)" }} />
          <div style={{ height: 10, width: "92%", borderRadius: 5, background: "var(--card-alt)" }} />
          <div style={{ height: 10, width: "74%", borderRadius: 5, background: "var(--card-alt)" }} />
        </div>
      ))}
    </>
  );
}
