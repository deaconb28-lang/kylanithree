"use client";

import { useEffect, useRef, useState } from "react";
import SearchWheel from "../discover/SearchWheel";
import SiteIcon from "../SiteIcon";
import { usePrefersReducedMotion } from "../../lib/useReducedMotion";
import { DEMO_RUN, type DemoLead } from "../../lib/demoRun";
import { relativeTime } from "../../lib/relativeTime";

// Watch a real run, replayed.
//
// This replaced a four-stage "ten minutes, then every morning" click-through — a page that DESCRIBED
// the product's time cost in prose beside mocked-up panels. The thing a founder actually wants to
// know before pasting a URL is not how many minutes it takes, it is whether the people it comes back
// with are worth writing to, and no amount of copy answers that. Showing the output does.
//
// TWO RULES MAKE THIS HONEST, and both are load-bearing:
//
//  1. Every name, quote, link and community below is CAPTURED, not written — see lib/demoRun.ts.
//     The links resolve, because they are the posts. The moment any of it is hand-edited, the
//     section's claim becomes false and it should be deleted rather than fixed.
//  2. The section says, in the UI, that it is a recording of one run on someone else's URL, and how
//     many people that run actually found. A replay presented as a live search would be the same lie
//     the fabricated demo dataset was, dressed as a video.
//
// It also reuses the REAL `SearchWheel` from the product rather than a drawing of one, so what is on
// screen here is what is on screen after you paste a URL.

const STAGES = ["read", "search", "leads"] as const;
type Stage = (typeof STAGES)[number];

/** How long each stage holds before the next. Long enough to read, short enough not to wait. */
const HOLD: Record<Stage, number> = { read: 3200, search: 3400, leads: 1100 };

export default function Demo() {
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [stage, setStage] = useState<Stage>("read");
  const [shown, setShown] = useState(0);

  // Nothing plays until the section is on screen. A replay that runs while the visitor is still in
  // the hero has finished by the time they arrive, so they see a static end state and never learn
  // there was anything to watch.
  useEffect(() => {
    if (reduced || started) return;
    const el = rootRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      // Deferred rather than set here: a synchronous setState in an effect body cascades a render,
      // and this is the rare-browser path where nothing is waiting on it anyway.
      const t = setTimeout(() => setStarted(true), 0);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced, started]);

  useEffect(() => {
    if (!started || reduced) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setStage("search"), HOLD.read));
    timers.push(setTimeout(() => setStage("leads"), HOLD.read + HOLD.search));
    DEMO_RUN.leads.forEach((_, i) => {
      timers.push(setTimeout(() => setShown(i + 1), HOLD.read + HOLD.search + i * HOLD.leads));
    });
    return () => timers.forEach(clearTimeout);
  }, [started, reduced]);

  // Reduced motion gets the FINISHED state, derived rather than written into state by an effect.
  // The end of this replay is the information — the people — so gating it behind an animation
  // nobody will see would hide the content rather than calm it. Deriving also means the preference
  // flipping mid-session needs no synchronisation.
  const at: Stage = reduced ? "leads" : stage;
  const visible = reduced ? DEMO_RUN.leads.length : shown;

  const done = visible >= DEMO_RUN.leads.length;

  const replay = () => {
    setShown(0);
    setStage("read");
    setStarted(false);
    // Next tick, so the effect above tears its timers down before new ones are scheduled.
    setTimeout(() => setStarted(true), 0);
  };

  return (
    <div
      ref={rootRef}
      style={{ padding: "96px 5vw", display: "flex", flexDirection: "column", gap: 40, background: "var(--card-alt)", borderTop: "1px solid var(--border)" }}
    >
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 640 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.05, letterSpacing: "-.03em", margin: 0 }}>
            Watch one run, start to finish.
          </h2>
          <p style={{ margin: 0, fontSize: 18, lineHeight: 1.6, color: "var(--muted)" }}>
            A real search on someone else&rsquo;s URL, recorded. Every name, quote and link below is the
            post it came from &mdash; open any of them.
          </p>
        </div>
        {done && !reduced && (
          <button onClick={replay} className="ky-btn-outline" style={{ padding: "10px 18px", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>
            Play again
          </button>
        )}
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, overflow: "hidden", boxShadow: "var(--lift-3)" }}>
        {/* The URL bar. Fixed to the recorded URL rather than an input, because typing here would
            promise a live search this section is deliberately not running. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 18px", borderBottom: "1px solid var(--border)", background: "var(--card-alt)" }}>
          <span style={{ display: "flex", gap: 5 }} aria-hidden="true">
            {["#E0685A", "#E5B45C", "#7FB27A"].map((c) => (
              <span key={c} style={{ width: 9, height: 9, borderRadius: 999, background: c, opacity: 0.8 }} />
            ))}
          </span>
          <span style={{ flex: 1, fontSize: 13.5, color: "var(--muted-strong)", fontWeight: 600 }}>{DEMO_RUN.url}</span>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 999, padding: "3px 9px" }}>
            RECORDING
          </span>
        </div>

        <div style={{ padding: "26px 24px", display: "flex", flexDirection: "column", gap: 22, minHeight: 420 }}>
          <StageRail stage={at} />

          {at === "read" && <ReadStage />}
          {at === "search" && <SearchStage />}
          {at === "leads" && <LeadsStage shown={visible} />}
        </div>
      </div>

      {/* Provenance, stated rather than implied. "Six of fifteen" is here so a curated selection
          cannot be misread as everything the run returned. */}
      <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6, maxWidth: "70ch" }}>
        Recorded on {DEMO_RUN.capturedOn} against {DEMO_RUN.url} &mdash; a product nobody here has any
        connection to. The run found {DEMO_RUN.totalFound} people; {DEMO_RUN.leads.length} are shown, because
        fifteen cards is a scroll rather than a demo. Nothing has been rewritten.{" "}
        <a href="#ky-url" style={{ color: "var(--ink)", fontWeight: 600 }}>
          Run it on yours
        </a>
        .
      </p>
    </div>
  );
}

/** Which of the three stages is playing. Reads as progress, not as navigation. */
function StageRail({ stage }: { stage: Stage }) {
  const labels: Record<Stage, string> = {
    read: "Reading the site",
    search: "Looking for people",
    leads: "Who it found",
  };
  const at = STAGES.indexOf(stage);
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {STAGES.map((s, i) => (
        <span
          key={s}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            fontSize: 12.5,
            fontWeight: 600,
            color: i <= at ? "var(--ink)" : "var(--faint)",
            background: i === at ? "var(--active-bg)" : "transparent",
            border: `1px solid ${i === at ? "var(--border-strong)" : "transparent"}`,
            borderRadius: 999,
            padding: "5px 12px",
            transition: "color .3s var(--ease), background .3s var(--ease)",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 999, background: i <= at ? "var(--ember)" : "var(--border-strong)" }} />
          {labels[s]}
        </span>
      ))}
    </div>
  );
}

function ReadStage() {
  return (
    <div className="ky-fade-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)" }}>WHAT THIS SELLS</span>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, lineHeight: 1.3, letterSpacing: "-.015em" }}>
          {DEMO_RUN.whatYouSell}
        </span>
        {/* The real number from the recorded run, not a round one. */}
        <span style={{ fontSize: 13, color: "var(--faint)" }}>read in {(DEMO_RUN.inferenceMs / 1000).toFixed(1)}s</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)" }}>WHAT ITS BUYERS SAY</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {DEMO_RUN.keywords.map((k) => (
            <span
              key={k}
              style={{ fontSize: 13.5, fontWeight: 500, background: "var(--card-alt)", border: "1px solid var(--border)", borderRadius: 999, padding: "6px 13px", color: "var(--muted-strong)" }}
            >
              &ldquo;{k}&rdquo;
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SearchStage() {
  return (
    <div className="ky-fade-in" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 48, flexWrap: "wrap", paddingTop: 8 }}>
      {/* The product's own wheel, not a picture of it. */}
      <SearchWheel
        centerLabel="privacy analytics"
        venues={[...DEMO_RUN.venues]}
        scanningIds={DEMO_RUN.venues.map((v) => v.id)}
        scannedIds={[]}
        hitsByVenue={DEMO_RUN.hitsByVenue}
        working
        compact
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 290 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)" }}>WHERE IT LOOKED</span>
        {DEMO_RUN.venues.map((v) => (
          <span key={v.id} style={{ fontSize: 14, color: "var(--muted-strong)", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: (DEMO_RUN.hitsByVenue[v.name] ?? 0) > 0 ? "var(--ember)" : "var(--border-strong)" }} />
            {v.name}
            {/* An empty community keeps its line. Where it looked and found nobody is information
                too — dropping those rows would overstate the reach of every run. */}
            <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--faint)" }}>
              {DEMO_RUN.hitsByVenue[v.name] ? `${DEMO_RUN.hitsByVenue[v.name]} found` : "none"}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function LeadsStage({ shown }: { shown: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)" }}>
        {shown} OF {DEMO_RUN.totalFound} FOUND
      </span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 330px), 1fr))", gap: 12 }}>
        {DEMO_RUN.leads.slice(0, shown).map((lead) => (
          <LeadCard key={lead.permalink} lead={lead} />
        ))}
      </div>
    </div>
  );
}

function LeadCard({ lead }: { lead: DemoLead }) {
  const person = "bio" in lead ? lead : undefined;
  return (
    <a
      href={lead.permalink}
      target="_blank"
      rel="noopener noreferrer"
      className="ky-fade-in"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 11,
        background: "var(--card-alt)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "16px 18px",
        textDecoration: "none",
        color: "inherit",
        minWidth: 0,
      }}
    >
      <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15.5, lineHeight: 1.35, letterSpacing: "-.01em", color: "var(--ink)" }}>
        {lead.summary}
      </span>
      <blockquote
        style={{
          margin: 0,
          fontSize: 13.5,
          lineHeight: 1.55,
          color: "var(--muted-strong)",
          borderLeft: "2px solid var(--ember)",
          paddingLeft: 12,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {lead.excerpt}
      </blockquote>
      <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12, color: "var(--muted)", minWidth: 0 }}>
        <SiteIcon url={lead.permalink} displayName={lead.displayName} handle={lead.author} size={24} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{lead.displayName}</span>
        <span>· {lead.venueName}</span>
        {"tenure" in lead && lead.tenure && <span>· {lead.tenure}</span>}
        <span>· {relativeTime(lead.postedAt)}</span>
        {person?.bio && (
          <span style={{ width: "100%", fontSize: 12, color: "var(--faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {person.bio}
          </span>
        )}
      </span>
    </a>
  );
}
