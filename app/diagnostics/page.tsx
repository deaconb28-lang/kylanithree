"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import KylaniLogo from "../../components/icons/KylaniLogo";

// Operator page, deliberately absent from every nav. Reachable by typing the URL because the
// people who need it already know it exists, and the people who don't should never trip over it.
//
// It answers two different questions. The health check answers "is anything unreachable" —
// credentials, database, each lead source. The test run answers the harder one: it executes the
// real pipeline against a niche that definitely has public discussion, so a thin result can be
// read as either "candidates were found and dropped" or "candidates were never found", with the
// time each stage took. That timing is what identifies a stage about to be killed by the platform.

type Json = Record<string, unknown>;

const CARD: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 14,
  background: "var(--card)",
  padding: "18px 20px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

function Dot({ ok }: { ok: boolean | null }) {
  return (
    <span
      style={{
        width: 9,
        height: 9,
        borderRadius: 999,
        flexShrink: 0,
        background: ok === null ? "var(--border-strong)" : ok ? "var(--green)" : "var(--ember)",
      }}
    />
  );
}

function Row({ label, ok, detail }: { label: string; ok: boolean | null; detail?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 14, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
      <Dot ok={ok} />
      <span style={{ fontWeight: 600, minWidth: 190 }}>{label}</span>
      <span style={{ color: "var(--muted)", flex: 1, wordBreak: "break-word" }}>{detail}</span>
    </div>
  );
}

export default function DiagnosticsPage() {
  const [health, setHealth] = useState<Json | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [run, setRun] = useState<Json | null>(null);
  const [running, setRunning] = useState(false);

  // Bumping this re-runs the health effect; the fetch lives inside the effect (same pattern as the
  // dashboard pages) so no state is set synchronously on mount.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((r) => r.json())
      .then((data: Json) => {
        if (cancelled) return;
        setHealth(data);
        setHealthError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setHealthError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const testSearch = async () => {
    setRunning(true);
    setRun(null);
    try {
      const res = await fetch("/api/diagnostics/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(70_000),
      });
      setRun(await res.json());
    } catch (e) {
      setRun({
        ok: false,
        // A killed function sends no response at all, so this branch is itself a finding.
        error:
          e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")
            ? "The request was cut off before the server answered — the function is exceeding its time limit. Check that Fluid Compute is enabled on the Vercel project."
            : String(e),
      });
    } finally {
      setRunning(false);
    }
  };

  const checks = (health?.checks ?? {}) as Json;
  const env = (checks.env ?? {}) as Record<string, { set?: boolean } | string | null>;
  const mongo = (checks.mongo ?? {}) as Json;
  const google = (checks.googleOAuth ?? {}) as Json;
  const sources: [string, Json][] = [
    ["Reddit", (checks.reddit ?? {}) as Json],
    ["Hacker News", (checks.hackerNews ?? {}) as Json],
    ["Lemmy", (checks.lemmy ?? {}) as Json],
    ["Bluesky", (checks.bluesky ?? {}) as Json],
    ["Stack Exchange", (checks.stackExchange ?? {}) as Json],
  ];
  const runTrace = (run?.trace ?? {}) as { stages?: { stage: string; candidatesIn: number; candidatesOut: number; ms: number; drops?: Record<string, number>; note?: string }[] };

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", padding: "28px 5vw 80px" }}>
      <div style={{ maxWidth: 940, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink)" }}>
            <KylaniLogo size={24} />
            <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 17 }}>Kylani</span>
          </Link>
          <span style={{ fontSize: 12.5, color: "var(--muted)", border: "1px solid var(--border)", padding: "3px 9px", borderRadius: 999 }}>diagnostics</span>
          <button onClick={() => setReloadKey((k) => k + 1)} className="ky-btn-outline" style={{ marginLeft: "auto", padding: "8px 14px", fontSize: 13.5 }}>
            Refresh
          </button>
        </div>

        <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: 28, letterSpacing: "-.03em", margin: 0 }}>
          What&apos;s working, and what isn&apos;t
        </h1>

        {healthError && (
          <div style={{ ...CARD, borderColor: "var(--ember)" }}>
            <span style={{ fontWeight: 700 }}>Couldn&apos;t load the health check</span>
            <span style={{ fontSize: 14, color: "var(--muted)" }}>{healthError}</span>
          </div>
        )}

        {health && (
          <>
            <div style={CARD}>
              <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 16 }}>Summary</span>
              {Object.entries((health.summary ?? {}) as Record<string, string>).map(([k, v]) => (
                <Row key={k} label={k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())} ok={!/BROKEN/.test(v)} detail={v} />
              ))}
            </div>

            <div style={CARD}>
              <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 16 }}>Lead sources</span>
              <span style={{ fontSize: 13, color: "var(--muted)", marginTop: -6 }}>
                The search only needs one of these. Reddit being blocked is expected and not a fault.
              </span>
              {sources.map(([name, s]) => (
                <Row
                  key={name}
                  label={name}
                  ok={typeof s.reachable === "boolean" ? (s.reachable as boolean) : typeof s.authenticated === "boolean" ? (s.authenticated as boolean) : null}
                  detail={[s.status ? `HTTP ${s.status}` : null, s.ms ? `${s.ms}ms` : null, (s.note ?? s.likelyCause ?? s.error) as string | undefined]
                    .filter(Boolean)
                    .join(" · ")}
                />
              ))}
              <Row label="Open-web discovery" ok={((checks.webSearch ?? {}) as Json).provider !== "none"} detail={String(((checks.webSearch ?? {}) as Json).provider ?? "")} />
            </div>

            <div style={CARD}>
              <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 16 }}>Accounts and database</span>
              <Row label="MongoDB" ok={Boolean(mongo.ok)} detail={[mongo.ms ? `${mongo.ms}ms` : null, mongo.userCount !== undefined ? `${mongo.userCount} users` : null, (mongo.likelyCause ?? mongo.error) as string | undefined].filter(Boolean).join(" · ")} />
              <Row label="Google sign-in callback" ok={!google.warning} detail={(google.redirectUriForThisRequest as string) ?? ""} />
              {Boolean(google.warning) && <span style={{ fontSize: 13, color: "var(--ember)", lineHeight: 1.5 }}>{google.warning as string}</span>}
            </div>

            <div style={CARD}>
              <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 16 }}>Environment</span>
              <span style={{ fontSize: 13, color: "var(--muted)", marginTop: -6 }}>Presence only — no value is ever read back here.</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {Object.entries(env).map(([k, v]) => {
                  const isSet = typeof v === "object" && v !== null ? Boolean((v as { set?: boolean }).set) : Boolean(v);
                  return (
                    <span
                      key={k}
                      style={{
                        fontSize: 12,
                        fontFamily: "ui-monospace, monospace",
                        padding: "4px 9px",
                        borderRadius: 999,
                        border: "1px solid var(--border)",
                        color: isSet ? "var(--green)" : "var(--muted)",
                        background: isSet ? "var(--green-tint)" : "transparent",
                      }}
                    >
                      {isSet ? "✓" : "○"} {k}
                    </span>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <div style={CARD}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 16 }}>Live search test</span>
            <button onClick={testSearch} disabled={running} className="ky-btn-ember" style={{ marginLeft: "auto", padding: "10px 18px", fontSize: 14, border: "none", opacity: running ? 0.6 : 1 }}>
              {running ? "Running…" : "Run a real search"}
            </button>
          </div>
          <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>
            Runs the actual pipeline against a niche that definitely has public discussion, and reports every stage. If this
            returns leads but a real onboarding does not, the problem is that niche&apos;s vocabulary — not the search.
          </span>

          {run && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 14 }}>
                <span><strong>{String(run.totalMs ?? "—")}ms</strong> total</span>
                <span><strong>{String(run.venuesResolved ?? 0)}</strong> venues ({String(run.venuesSearchable ?? 0)} searchable)</span>
                <span><strong>{String(run.leadsFound ?? 0)}</strong> leads</span>
                {run.cachedVenues ? <span style={{ color: "var(--muted)" }}>venues from cache</span> : null}
              </div>
              {Boolean(run.error) && <span style={{ fontSize: 13.5, color: "var(--ember)", lineHeight: 1.5 }}>{String(run.error)}{run.detail ? ` — ${String(run.detail)}` : ""}</span>}

              {runTrace.stages && runTrace.stages.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                        <th style={{ padding: "6px 8px" }}>Stage</th>
                        <th style={{ padding: "6px 8px" }}>In</th>
                        <th style={{ padding: "6px 8px" }}>Out</th>
                        <th style={{ padding: "6px 8px" }}>Time</th>
                        <th style={{ padding: "6px 8px" }}>Dropped / note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runTrace.stages.map((st, i) => (
                        <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={{ padding: "6px 8px", fontFamily: "ui-monospace, monospace" }}>{st.stage}</td>
                          <td style={{ padding: "6px 8px" }}>{st.candidatesIn}</td>
                          <td style={{ padding: "6px 8px", fontWeight: st.candidatesIn > 0 && st.candidatesOut === 0 ? 700 : 400, color: st.candidatesIn > 0 && st.candidatesOut === 0 ? "var(--ember)" : undefined }}>
                            {st.candidatesOut}
                          </td>
                          <td style={{ padding: "6px 8px", color: st.ms > 10_000 ? "var(--ember)" : "var(--muted)" }}>{st.ms}ms</td>
                          <td style={{ padding: "6px 8px", color: "var(--muted)" }}>
                            {Object.entries(st.drops ?? {}).filter(([, n]) => n > 0).map(([r, n]) => `${n} ${r.replace(/_/g, " ")}`).join(", ")}
                            {st.note ? ` ${st.note}` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {Array.isArray(run.venueNames) && (run.venueNames as string[]).length > 0 && (
                <span style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
                  <strong style={{ color: "var(--ink)" }}>Venues:</strong> {(run.venueNames as string[]).join(" · ")}
                </span>
              )}

              {Array.isArray(run.sampleLeads) &&
                (run.sampleLeads as { author: string; venue: string; intent: string; permalink: string; excerpt: string }[]).map((l) => (
                  <div key={l.permalink} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 13.5 }}>
                      <strong>{l.author}</strong> · {l.venue} · {l.intent}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>&ldquo;{l.excerpt}&rdquo;</span>
                    <a href={l.permalink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5 }}>
                      {l.permalink}
                    </a>
                  </div>
                ))}
            </div>
          )}
        </div>

        <span style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>
          A stage showing candidates in but zero out is where leads are being lost. A stage over 10s is at risk of being
          killed by the platform — if several are red, confirm Fluid Compute is enabled on the Vercel project, since
          without it functions are capped far below the configured limit.
        </span>
      </div>
    </div>
  );
}
