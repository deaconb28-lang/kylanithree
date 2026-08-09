"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export type SitePreview = {
  host: string;
  iconUrl: string;
  title: string;
  description: string | null;
};

// Module-level cache read through useSyncExternalStore rather than mirrored into component state:
// the preview is shared by several onboarding steps, so this fetches once per URL for the life of
// the page, keeps the server snapshot (null) matching the client's first paint, and avoids a
// setState call inside an effect body.
const cache = new Map<string, SitePreview>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSitePreview(url: string) {
  const getSnapshot = useCallback(() => cache.get(url) ?? null, [url]);
  const preview = useSyncExternalStore(subscribe, getSnapshot, () => null);

  useEffect(() => {
    if (!url || cache.has(url)) return;
    let cancelled = false;
    fetch("/api/site-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SitePreview | null) => {
        if (cancelled || !data?.host) return;
        cache.set(url, data);
        listeners.forEach((l) => l());
      })
      .catch(() => {
        // Purely decorative context — a failure here must never interrupt onboarding.
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return preview;
}

// The founder's own site, shown while Kylani works: icon, name, and one real line about it. The
// description prefers Kylani's own analysis once that exists and falls back to the site's own meta
// description before then, so the card is populated from the first second rather than popping in.
export default function SiteBadge({
  url,
  preview,
  description,
  hideDescription = false,
  compact = false,
}: {
  url: string;
  preview: SitePreview | null;
  description?: string | null;
  // For screens that already show a description of their own — the badge falls back to the host
  // line instead of repeating it.
  hideDescription?: boolean;
  compact?: boolean;
}) {
  const [iconFailed, setIconFailed] = useState(false);
  const host = preview?.host ?? url.replace(/^https?:\/\//i, "").replace(/^www\./, "").split("/")[0];
  const line = hideDescription ? null : description ?? preview?.description ?? null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: line ? "flex-start" : "center",
        gap: 12,
        maxWidth: 560,
        width: "100%",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: compact ? "10px 14px" : "14px 16px",
        textAlign: "left",
        boxShadow: "var(--lift-1)",
        minWidth: 0,
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          background: "var(--card-alt)",
          border: "1px solid var(--border)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          overflow: "hidden",
          fontSize: 15,
          fontWeight: 700,
          color: "var(--muted)",
        }}
      >
        {preview && !iconFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview.iconUrl}
            alt=""
            width={20}
            height={20}
            style={{ display: "block" }}
            onError={() => setIconFailed(true)}
          />
        ) : (
          host.charAt(0).toUpperCase()
        )}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {preview?.title || host}
        </span>
        {line ? (
          <span style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.45 }}>{line}</span>
        ) : (
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{host}</span>
        )}
      </div>
    </div>
  );
}
