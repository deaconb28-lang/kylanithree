"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import type { SuppressionDoc, SuppressionReason } from "../../../lib/collections";
import { SUPPRESSION_REASON_LABELS } from "../../../lib/suppression";

type Suppression = SuppressionDoc & { _id: string };

function initialsFor(name: string) {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

const REASON_COLORS: Record<SuppressionReason, { color: string; background: string }> = {
  unsubscribed: { color: "var(--muted)", background: "var(--border)" },
  existing_customer: { color: "var(--green)", background: "var(--green-tint)" },
  bounced: { color: "#A8431C", background: "#FBE4CE" },
};

export default function SuppressedPage() {
  const [suppressions, setSuppressions] = useState<Suppression[] | null>(null);
  const [filter, setFilter] = useState<"all" | SuppressionReason>("all");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/suppressions")
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) {
          setLoadError(data.error ?? "Couldn't load Suppressed.");
          return;
        }
        setSuppressions(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't reach the server.");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const counts = useMemo(() => {
    const c: Record<SuppressionReason, number> = { unsubscribed: 0, bounced: 0, existing_customer: 0 };
    for (const s of suppressions ?? []) c[s.reason]++;
    return c;
  }, [suppressions]);

  const filtered = useMemo(() => {
    if (!suppressions) return [];
    if (filter === "all") return suppressions;
    return suppressions.filter((s) => s.reason === filter);
  }, [suppressions, filter]);

  if (loadError) {
    return (
      <DashboardShell active="suppressed">
        <div style={{ padding: "36px 5vw", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14 }}>
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 18 }}>Couldn&apos;t load Suppressed.</span>
          <span style={{ fontSize: 14.5, color: "var(--muted)" }}>{loadError}</span>
          <button className="ky-btn-ember" onClick={() => { setLoadError(null); setAttempt((a) => a + 1); }} style={{ padding: "11px 20px", fontSize: 14.5, border: "none" }}>
            Try again
          </button>
        </div>
      </DashboardShell>
    );
  }

  if (!suppressions) {
    return (
      <DashboardShell active="suppressed">
        <div style={{ padding: "36px 5vw", color: "var(--muted)" }}>Loading…</div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell active="suppressed">
      <div style={{ padding: "36px 5vw", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 20, maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(24px,3.2vw,32px)", letterSpacing: "-.03em", margin: 0 }}>
              {suppressions.length === 0 ? "Nobody suppressed yet." : `${suppressions.length} people, never contacted.`}
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.5, maxWidth: 640 }}>
              Checked before anything sends, not after. Someone unsubscribing, a bounce you flag yourself, or a contact
              you mark as an existing customer all land here automatically.
            </p>
          </div>
          {suppressions.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {([
                { key: "all", label: `All ${suppressions.length}` },
                ...(Object.keys(counts) as SuppressionReason[])
                  .filter((r) => counts[r] > 0)
                  .map((r) => ({ key: r, label: `${SUPPRESSION_REASON_LABELS[r]} ${counts[r]}` })),
              ] as { key: "all" | SuppressionReason; label: string }[]).map((f) => (
                <span
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  style={{
                    cursor: "pointer",
                    background: filter === f.key ? "var(--ink)" : "transparent",
                    color: filter === f.key ? "var(--card)" : "var(--muted-strong)",
                    border: filter === f.key ? "none" : "1px solid var(--border)",
                    padding: "7px 13px",
                    borderRadius: 999,
                    fontSize: 13,
                  }}
                >
                  {f.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {suppressions.length === 0 ? (
          <div style={{ border: "1px dashed var(--border-strong)", borderRadius: 16, padding: "28px 24px", background: "var(--card-alt)", display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 20 }}>Nothing caught here yet.</span>
            <p style={{ margin: 0, fontSize: 15, color: "var(--muted)", lineHeight: 1.6, maxWidth: 640 }}>
              Every sent email includes a real unsubscribe link, and you can manually suppress a contact from Queue.
              Anyone caught either way shows up here and Kylani won&apos;t write to them again for this campaign.
            </p>
          </div>
        ) : (
          <div style={{ border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", background: "var(--card)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 24px", borderBottom: "1px solid var(--border)", background: "var(--card-alt)", fontSize: 12, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "#A39C90" }}>
              <span style={{ width: 30, flexShrink: 0 }} />
              <span style={{ width: 200, flexShrink: 0 }}>Contact</span>
              <span style={{ width: 150, flexShrink: 0 }}>Reason</span>
              <span style={{ flex: 1 }}>Where we would have reached them</span>
              <span style={{ flexShrink: 0 }}>Since</span>
            </div>
            {filtered.map((s, i) => {
              const style = REASON_COLORS[s.reason];
              return (
                <div key={s._id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 24px", borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none", flexWrap: "wrap" }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--card-alt)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, color: "var(--muted)", flexShrink: 0 }}>
                    {initialsFor(s.name)}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 1, width: 200, flexShrink: 0 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 600 }}>{s.name}</span>
                    <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{s.role}</span>
                  </div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: style.color, background: style.background, padding: "4px 10px", borderRadius: 999, width: 150, textAlign: "center", flexShrink: 0 }}>
                    {SUPPRESSION_REASON_LABELS[s.reason]}
                  </span>
                  <span style={{ fontSize: 13.5, color: "var(--muted)", flex: 1, minWidth: 160 }}>{s.where}</span>
                  <span style={{ fontSize: 13, color: "var(--muted)", flexShrink: 0 }}>
                    {new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
