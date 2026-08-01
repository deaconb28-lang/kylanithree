"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import OnboardingChrome from "./OnboardingChrome";
import { anonId, markFlowStart, sinceFlowStart } from "../../lib/discover/clientTrack";

// The only screen before results.
//
// It asks one question and then gets out of the way — the submit does no analysis, no search and no
// account: it writes a row and hands off to /discover, where the work happens in front of the
// person watching it. That is the whole architectural change. Everything that used to sit between
// this field and the first lead (reading, confirming buyers, waiting) now happens after the results
// start arriving, or beside them.
//
// The "no site yet" path exists because a founder without a landing page is exactly who this is
// for, and the old flow had no answer for them at all.

export default function StepStart({ prefilledUrl }: { prefilledUrl?: string | null }) {
  const router = useRouter();
  const [url, setUrl] = useState(prefilledUrl ?? "");
  const [sentence, setSentence] = useState("");
  const [noSite, setNoSite] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoStarted = useRef(false);

  const start = useCallback(
    async (payload: { url?: string; sentence?: string }) => {
      setStarting(true);
      setError(null);
      // Only if the landing page hasn't already started the clock — this is the same submission,
      // and restarting it here would silently discount the navigation from every measurement.
      if (sinceFlowStart() === undefined) markFlowStart();
      try {
        const res = await fetch("/api/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, anonId: anonId() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Couldn't start the search.");
        router.push(`/discover/${data.searchId}`);
      } catch (err) {
        setStarting(false);
        setError(err instanceof Error ? err.message : "Couldn't start the search. Try again in a moment.");
      }
    },
    [router],
  );

  // Arriving from the landing page's field: the URL is already answered, so asking for it again
  // would be the first thing this rebuild is supposed to stop doing.
  useEffect(() => {
    if (prefilledUrl && !autoStarted.current) {
      autoStarted.current = true;
      void start({ url: prefilledUrl });
    }
  }, [prefilledUrl, start]);

  const value = noSite ? sentence : url;
  const submit = () => {
    if (!value.trim() || starting) return;
    void start(noSite ? { sentence: sentence.trim() } : { url: url.trim() });
  };

  return (
    <OnboardingChrome>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28, maxWidth: 680, textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(32px,5vw,52px)", lineHeight: 1.02, letterSpacing: "-.035em", margin: 0 }}>
          {noSite ? (
            <>
              What are you <span style={{ color: "var(--ember)" }}>building</span>?
            </>
          ) : (
            <>
              Where does your product <span style={{ color: "var(--ember)" }}>live</span>?
            </>
          )}
        </h1>
        <p style={{ margin: 0, fontSize: 18, color: "var(--muted-strong)", lineHeight: 1.55 }}>
          {noSite
            ? "One sentence is enough. I'll start looking for people describing that problem right away."
            : "Paste the URL. Real people describing your problem start appearing in about eight seconds."}
        </p>

        <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ width: "100%", maxWidth: 620 }}>
          <div
            className="ky-field ky-field-stack"
            style={{
              display: "flex",
              gap: 10,
              background: "var(--card)",
              border: "1px solid var(--ink)",
              borderRadius: 14,
              padding: "9px 9px 9px 22px",
              alignItems: "center",
              boxShadow: "var(--lift-2)",
            }}
          >
            <input
              autoFocus
              value={value}
              onChange={(e) => (noSite ? setSentence(e.target.value) : setUrl(e.target.value))}
              placeholder={noSite ? "A scheduling tool for freight docks" : "yourproduct.com"}
              disabled={starting}
              style={{ flex: 1, minWidth: 0, fontSize: 18, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", color: "var(--ink)" }}
            />
            <button
              type="submit"
              className="ky-btn-ember"
              disabled={!value.trim() || starting}
              style={{ padding: "13px 26px", fontSize: 16, whiteSpace: "nowrap" }}
            >
              {starting ? "Starting…" : "Find my buyers"}
            </button>
          </div>
        </form>

        {error && <span style={{ fontSize: 14.5, color: "var(--ember)" }}>{error}</span>}

        <button
          onClick={() => { setNoSite((n) => !n); setError(null); }}
          style={{ background: "none", border: "none", padding: 0, fontSize: 14, color: "var(--muted)", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
        >
          {noSite ? "I do have a site" : "I don't have a site yet"}
        </button>

        <span style={{ fontSize: 14, color: "var(--muted)" }}>No account needed. Nothing sends until you approve it.</span>
      </div>
    </OnboardingChrome>
  );
}
