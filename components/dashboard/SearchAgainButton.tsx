"use client";

import { useState } from "react";

type SearchResult = { insertedLeads: number; insertedCommunities: number };

// Runs the same real search architecture as onboarding again, against an existing campaign — for
// when the first pass came back sparse or empty. Never invents anything: a real search that finds
// nothing new says so, honestly, rather than padding the result.
export default function SearchAgainButton({ onDone }: { onDone?: (result: SearchResult) => void }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/campaign/search", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't search right now.");
        return;
      }
      setResult(data);
      onDone?.(data);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      <button
        className="ky-btn-ember"
        onClick={run}
        disabled={loading}
        style={{ padding: "12px 20px", fontSize: 14.5, border: "none", opacity: loading ? 0.6 : 1 }}
      >
        {loading ? "Searching — this can take up to a minute…" : "Search for more leads"}
      </button>
      {error && <span style={{ fontSize: 13.5, color: "var(--ember)" }}>{error}</span>}
      {result && (
        <span style={{ fontSize: 13.5, color: "var(--muted)" }}>
          {result.insertedLeads === 0 && result.insertedCommunities === 0
            ? "Nothing new and real found this time — worth trying again later."
            : `Found ${result.insertedLeads} new lead${result.insertedLeads === 1 ? "" : "s"} and ${result.insertedCommunities} new communit${result.insertedCommunities === 1 ? "y" : "ies"}.`}
        </span>
      )}
    </div>
  );
}
