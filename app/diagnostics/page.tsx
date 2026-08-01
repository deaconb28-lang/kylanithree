"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import KylaniLogo from "../../components/icons/KylaniLogo";
import { DROPS, PHASES, STAGES, diagnose, docFor, type Phase } from "../../lib/search/explain";
import type { DropReason, StageMetric } from "../../lib/search/types";

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
        // The route budgets itself to 45s and answers, so anything past 55s here means it failed to
        // honour its own deadline rather than simply being slow.
        signal: AbortSignal.timeout(55_000),
      });
      setRun(await res.json());
    } catch (e) {
      setRun({
        ok: false,
        // A killed function sends no response at all, so this branch is itself a finding.
        error:
          e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")
            ? "The server never answered, even though this route is supposed to give up at 45s and return a partial trace. Something is blocking past its own deadline — check the Vercel function logs for this request."
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
    ["Quora", (checks.quora ?? {}) as Json],
  ];
  const runTrace = (run?.trace ?? {}) as { stages?: StageMetric[] };
  const stages = useMemo(() => runTrace.stages ?? [], [runTrace.stages]);
  // An empty stage list is itself a diagnosis — it means the function died before recording
  // anything, which is what a platform kill looks like from here.
  const verdict = useMemo(() => (run ? diagnose(stages, Number(run.leadsFound ?? 0)) : null), [run, stages]);

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
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 16 }}>How the search actually works</span>
          <span style={{ fontSize: 13, color: "var(--muted)", marginTop: -6, lineHeight: 1.55 }}>
            Every stage below reports candidates in, candidates out, and time spent. Run the test underneath and these
            same stages fill in with real numbers — a stage with candidates in and zero out is where leads are lost.
          </span>

          {(["resolve", "extract"] as Phase[]).map((phase) => (
            <div key={phase} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
              <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 14.5 }}>{PHASES[phase].title}</span>
              <span style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, marginTop: -6 }}>{PHASES[phase].blurb}</span>
              {STAGES.filter((s) => s.phase === phase).map((s) => {
                const live = stages.filter((st) => s.match.test(st.stage));
                const lost = live.length > 0 && live.some((st) => st.candidatesIn > 0 && st.candidatesOut === 0);
                return (
                  <details
                    key={s.title}
                    style={{
                      border: `1px solid ${lost ? "var(--ember)" : "var(--border)"}`,
                      borderRadius: 10,
                      padding: "9px 12px",
                      background: lost ? "#FFF8F1" : "transparent",
                    }}
                  >
                    <summary style={{ cursor: "pointer", fontSize: 13.5, display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                      <strong>{s.title}</strong>
                      {live.map((st, i) => (
                        <span key={i} style={{ fontSize: 12.5, color: "var(--muted)", fontFamily: "ui-monospace, monospace" }}>
                          {st.candidatesIn}→
                          <span style={{ color: st.candidatesIn > 0 && st.candidatesOut === 0 ? "var(--ember)" : "inherit", fontWeight: 700 }}>{st.candidatesOut}</span>
                          {" · "}
                          {st.ms}ms
                        </span>
                      ))}
                    </summary>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, fontSize: 13, lineHeight: 1.55, color: "var(--muted-strong)" }}>
                      <span>{s.what}</span>
                      <span>
                        <strong style={{ color: "var(--ink)" }}>Needs:</strong> {s.needs}
                      </span>
                      <span>
                        <strong style={{ color: "var(--ink)" }}>Zero out means:</strong> {s.zeroMeans}
                      </span>
                      {live.map((st, i) =>
                        st.note ? (
                          <span key={i} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "var(--muted)" }}>
                            {st.stage}: {st.note}
                          </span>
                        ) : null,
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          ))}
        </div>

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
                <span>
                  <strong>{String(run.totalMs ?? "—")}ms</strong> total
                  {run.budgetMs ? <span style={{ color: "var(--muted)" }}> of {Number(run.budgetMs) / 1000}s budget</span> : null}
                </span>
                <span><strong>{String(run.venuesResolved ?? 0)}</strong> venues ({String(run.venuesSearchable ?? 0)} searchable)</span>
                <span><strong>{String(run.leadsFound ?? 0)}</strong> leads</span>
                {run.cachedVenues ? <span style={{ color: "var(--muted)" }}>venues from cache</span> : null}
              </div>

              {Boolean(run.hitBudget) && (
                <span style={{ fontSize: 13.5, color: "var(--ember)", lineHeight: 1.5 }}>
                  The run used its entire budget and returned early. It still answered — that is the point — but stages
                  after the cut-off never ran. The stage table shows how far it got.
                </span>
              )}
              {Boolean(run.skipped) && <span style={{ fontSize: 13.5, color: "var(--muted-strong)", lineHeight: 1.5 }}>{String(run.skipped)}</span>}
              {Boolean(run.error) && <span style={{ fontSize: 13.5, color: "var(--ember)", lineHeight: 1.5 }}>{String(run.error)}{run.detail ? ` — ${String(run.detail)}` : ""}</span>}

              {verdict && (
                <div
                  style={{
                    border: `1px solid ${verdict.status === "ok" ? "var(--green)" : verdict.status === "broken" ? "var(--ember)" : "var(--border-strong)"}`,
                    background: verdict.status === "ok" ? "var(--green-tint)" : verdict.status === "broken" ? "#FFF8F1" : "var(--card-alt)",
                    borderRadius: 12,
                    padding: "14px 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 7,
                  }}
                >
                  <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 15 }}>{verdict.headline}</span>
                  <span style={{ fontSize: 13.5, color: "var(--muted-strong)", lineHeight: 1.55 }}>{verdict.detail}</span>
                  {verdict.stage && (
                    <span style={{ fontSize: 12.5, color: "var(--muted)", fontFamily: "ui-monospace, monospace" }}>
                      failing stage: {verdict.stage}
                      {docFor(verdict.stage) ? ` — ${docFor(verdict.stage)!.title}` : ""}
                    </span>
                  )}
                  {verdict.fixes.length > 0 && (
                    <ul style={{ margin: "2px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                      {verdict.fixes.map((f) => (
                        <li key={f} style={{ fontSize: 13, color: "var(--muted-strong)", lineHeight: 1.5 }}>
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {stages.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                        <th style={{ padding: "6px 8px" }}>Stage</th>
                        <th style={{ padding: "6px 8px" }}>In</th>
                        <th style={{ padding: "6px 8px" }}>Out</th>
                        <th style={{ padding: "6px 8px" }}>Time</th>
                        <th style={{ padding: "6px 8px" }}>Why the difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stages.map((st, i) => {
                        const lost = st.candidatesIn > 0 && st.candidatesOut === 0;
                        const doc = docFor(st.stage);
                        const drops = Object.entries(st.drops ?? {}).filter(([, n]) => (n ?? 0) > 0) as [DropReason, number][];
                        return (
                          <tr key={i} style={{ borderTop: "1px solid var(--border)", background: lost ? "#FFF8F1" : undefined }}>
                            <td style={{ padding: "6px 8px" }}>
                              <div style={{ fontWeight: 600 }}>{doc?.title ?? st.stage}</div>
                              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 11.5, color: "var(--muted)" }}>{st.stage}</div>
                            </td>
                            <td style={{ padding: "6px 8px" }}>{st.candidatesIn}</td>
                            <td style={{ padding: "6px 8px", fontWeight: lost ? 700 : 400, color: lost ? "var(--ember)" : undefined }}>{st.candidatesOut}</td>
                            <td style={{ padding: "6px 8px", color: st.ms > 10_000 ? "var(--ember)" : "var(--muted)" }}>{st.ms}ms</td>
                            <td style={{ padding: "6px 8px", color: "var(--muted)" }}>
                              {drops.length > 0 && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                  {drops.map(([reason, n]) => (
                                    <span key={reason}>
                                      <strong style={{ color: "var(--ink)" }}>
                                        {n} {DROPS[reason]?.label ?? reason}
                                      </strong>
                                      {DROPS[reason] ? ` — ${DROPS[reason].meaning}` : ""}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {st.note && <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 11.5, marginTop: drops.length ? 4 : 0 }}>{st.note}</div>}
                              {drops.length === 0 && !st.note && lost && doc && <span>{doc.zeroMeans}</span>}
                            </td>
                          </tr>
                        );
                      })}
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
          A stage showing candidates in but zero out is where leads are being lost. Every route now budgets itself below
          the platform&apos;s 60s function ceiling and returns whatever it has when that budget runs out — so a slow run
          reports a partial trace rather than dying as a 504 with nothing in it. If you ever see a bare connection
          failure here again, that is a genuine bug, not a slow niche.
        </span>
      </div>
    </div>
  );
}
