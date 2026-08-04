"use client";

import { useEffect, useRef, useState } from "react";
import type { WorklogItem } from "../../lib/campaign/types";
import Starter from "./Starter";

// What Kylani did, newest first, always one click away.
//
// Every line is mono because every line is the machine's own record — the same rule the purpose
// lines and stage deltas follow. The timestamp leads, because the whole claim of this drawer is
// that the labor happened at a time, not that it happened in principle.
//
// Rationale is COLLAPSED, not absent. A drawer that explains every action inline is a wall; one
// that explains none is a list of assertions. "why?" expands one line, and only rows that involved
// a decision have one — a row that just records a fact does not get a fabricated justification.

export default function WorklogDrawer({
  open,
  onClose,
  items,
  loading,
  error,
  onRetry,
}: {
  open: boolean;
  onClose: () => void;
  items: WorklogItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes, and focus moves into the panel on open so a keyboard user is not left behind on
  // the page underneath. Both are the minimum for a slide-over that can be opened from a toolbar.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, background: "rgba(20,17,14,.28)", animation: "kyRise .18s ease both" }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Worklog"
        tabIndex={-1}
        style={{
          position: "relative",
          width: "min(100%, 420px)",
          height: "100%",
          background: "var(--card)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "var(--lift-3)",
          display: "flex",
          flexDirection: "column",
          outline: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 18px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17 }}>Worklog</span>
          <button onClick={onClose} className="ky-btn-outline" style={{ padding: "6px 12px", fontSize: 12.5, fontWeight: 600, minHeight: 0 }}>
            Close
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px 24px" }}>
          {error ? (
            <Starter
              kind="add"
              compact
              title="Couldn't load the worklog"
              body={error}
              actions={onRetry ? [{ label: "Try again", onClick: onRetry, primary: true }] : []}
            />
          ) : loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={{ height: 34, borderRadius: 8, background: "var(--card-alt)", opacity: 1 - i * 0.18 }} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <Starter
              kind="intro"
              compact
              title="Nothing logged yet"
              body="Every search, draft, send and reply lands here with a timestamp and a reason. The first entry appears as soon as Kylani does something."
              actions={[{ label: "Find buyers now", href: "/campaign?run=1", primary: true }]}
            />
          ) : (
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              {items.map((item) => (
                <Row key={item.id} item={item} />
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ item }: { item: WorklogItem }) {
  const [open, setOpen] = useState(false);
  const time = new Date(item.at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  const day = new Date(item.at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <li style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", fontFamily: "var(--font-machine)", fontSize: 12.5, lineHeight: 1.5 }}>
        <span className="ky-tnum" style={{ color: "var(--faint)", flexShrink: 0 }} title={day}>
          {time}
        </span>
        <span style={{ color: "var(--muted-strong)", flex: 1, minWidth: 0 }}>
          {item.summary}
          {item.rationale && (
            <>
              {" "}
              <button
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--ember)", cursor: "pointer", textDecoration: "underline" }}
              >
                {open ? "hide" : "why?"}
              </button>
            </>
          )}
        </span>
      </div>
      {open && item.rationale && (
        <p style={{ margin: "4px 0 2px 46px", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>{item.rationale}</p>
      )}
      {item.href && (
        <a href={item.href} style={{ marginLeft: 46, fontSize: 12, color: "var(--muted)" }}>
          open →
        </a>
      )}
    </li>
  );
}
