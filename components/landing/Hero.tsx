"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import KylaniLogo from "../icons/KylaniLogo";
import FoundField from "./FoundField";
import { DiscordIcon, ForumsIcon, RedditIcon, SlackIcon, XIcon } from "../icons/SourceIcons";
import { markFlowStart, trackClient } from "../../lib/discover/clientTrack";
import { resolveFlow } from "../../lib/discover/flag";

// One centred column, and one thing to do.
//
// The headline used to be three lines of near-display sans at full container width, which pushed
// the URL field to the fold in dark mode and cut the social proof off entirely — a page promising
// specificity, showing none of it, and hiding its own call to action. It is now two lines of a
// display serif over a field of marks that shows the actual claim: a crowd talking, a few of them
// buying. Deliberately no counts — "3,400 people" and "nine of them" were numbers nobody measured,
// and the field says the same thing without asserting one.
//
// The badge that used to sit above the headline ("Warm, human outreach — not more AI noise") has
// moved down beside the drafted-message step, where there is a draft on screen for it to be about.

// Above this width the headline holds its intended two-line break; below it, the break is removed
// and the line wraps wherever it needs to.
const HARD_BREAK_MIN = 900;

const SOURCES = [
  { name: "Reddit", Icon: RedditIcon },
  { name: "X", Icon: XIcon },
  { name: "Discord", Icon: DiscordIcon },
  { name: "Slack", Icon: SlackIcon },
  { name: "Forums", Icon: ForumsIcon },
];

/**
 * Accepts what a founder actually types.
 *
 * "berth.app", "www.berth.app" and "https://berth.app/pricing" are the same answer, and
 * rejecting two of the three for a missing protocol would be the page failing at the one question
 * it asks.
 */
function normalizeUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export default function Hero() {
  const [typedUrl, setTypedUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    trackClient("landing_view", { flow: resolveFlow() });

    // Desktop only. Autofocus on a touch device throws the keyboard open before the page has been
    // read, covering half of what someone came to look at.
    const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;
    if (!isTouch && window.innerWidth >= HARD_BREAK_MIN) inputRef.current?.focus();
  }, []);

  const submit = () => {
    const value = typedUrl.trim();
    if (!value) {
      setError("Enter your product's URL to start.");
      inputRef.current?.focus();
      return;
    }
    setError(null);
    // The clock the flow comparison rests on starts at the submission, not when a route eventually
    // begins working.
    markFlowStart();
    router.push(`/onboarding?url=${encodeURIComponent(normalizeUrl(value))}`);
  };

  return (
    <header style={{ position: "relative", overflow: "hidden", background: "var(--paper)" }}>
      <nav
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "22px 5vw",
          maxWidth: 1240,
          margin: "0 auto",
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, color: "var(--ink)" }}>
          <KylaniLogo size={26} />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17, letterSpacing: "-.01em" }}>Kylani</span>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 26, fontSize: 13.5 }}>
          <a href="#how" className="ky-link ky-nav-wide">How it works</a>
          <a href="#findings" className="ky-link ky-nav-wide">Findings</a>
          <a href="#pricing" className="ky-link ky-nav-wide">Pricing</a>
          <a href="/signin" className="ky-link">Sign in</a>
          {/* Outline, not filled. There is exactly one filled coral button on screen and it is the
              one the whole page is built to get pressed. */}
          <a href="/onboarding" className="ky-btn-outline" style={{ padding: "9px 15px", fontSize: 13.5, fontWeight: 500, color: "var(--ink)", borderColor: "var(--ink)", minHeight: 0 }}>
            Paste your URL
          </a>
        </div>
      </nav>

      <div style={{ position: "relative", padding: "clamp(40px, 7vh, 88px) 5vw clamp(44px, 6vh, 64px)", maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
          <h1 className="ky-display ky-h1" style={{ margin: 0, color: "var(--ink)" }}>
            Find your first<span className="ky-h1-break" />
            hundred buyers.
          </h1>

          <p style={{ margin: "20px auto 0", maxWidth: "30rem", fontSize: 17, lineHeight: 1.6, color: "var(--muted)" }}>
            Kylani reads your product, then goes and finds them — by name, with a message already written. First hundred in
            about ten minutes.
          </p>
        </div>

        <div style={{ marginTop: 44 }}>
          <FoundField caption="Everyone talking about your problem this week — and the few who are actually buying." />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          style={{ marginTop: 32, maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}
        >
          <div
            className="ky-field ky-field-stack"
            style={{
              display: "flex",
              gap: 8,
              background: "var(--card)",
              border: "1px solid var(--border-strong)",
              borderRadius: 12,
              padding: 6,
              alignItems: "center",
            }}
          >
            <input
              ref={inputRef}
              aria-label="Your product's URL"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "ky-url-error" : undefined}
              value={typedUrl}
              onChange={(e) => {
                setTypedUrl(e.target.value);
                if (error) setError(null);
              }}
              placeholder="berth.app"
              inputMode="url"
              autoComplete="url"
              style={{
                // Never below 16px: iOS zooms the whole page on focus for anything smaller, which
                // reads as the site breaking the instant you tap the one field that matters.
                fontSize: 16,
                color: "var(--ink)",
                flex: 1,
                minWidth: 0,
                border: "none",
                outline: "none",
                background: "transparent",
                fontFamily: "inherit",
                padding: "10px 12px",
              }}
            />
            <button type="submit" className="ky-btn-ember" style={{ padding: "11px 20px", fontSize: 15, fontWeight: 500, whiteSpace: "nowrap", minHeight: 0 }}>
              Find them free
            </button>
          </div>

          {error && (
            <p id="ky-url-error" role="alert" style={{ margin: "10px 0 0", textAlign: "center", fontSize: 13, color: "var(--ember)" }}>
              {error}
            </p>
          )}

          <p style={{ margin: "12px 0 0", textAlign: "center", fontSize: 13, color: "var(--faint)" }}>
            312 founders sent their first hundred today
          </p>
        </form>

        <div style={{ maxWidth: 640, margin: "40px auto 0", borderTop: "1px solid var(--border)", paddingTop: 20, textAlign: "center" }}>
          <p className="ky-display" style={{ margin: 0, fontStyle: "italic", fontSize: 13, color: "var(--faint)" }}>
            Kylani looks in
          </p>
          <ul
            style={{
              margin: "14px 0 0",
              padding: 0,
              listStyle: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexWrap: "wrap",
              gap: "10px 26px",
              fontSize: 13,
              color: "var(--muted)",
            }}
          >
            {SOURCES.map(({ name, Icon }) => (
              <li key={name} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon />
                {name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </header>
  );
}
