"use client";

import { useState } from "react";
import { initialsFor } from "./Avatar";
import { hostOf } from "../lib/favicon";

// The icon of the site a person was found on, in place of their initials.
//
// This replaced a monogram disc. The monogram answered "who" with two letters derived from a handle
// — which the name printed immediately beside it already said, more completely. The site answers a
// question the row was not answering at all: a founder scanning fourteen leads wants to know they
// are spread across Hacker News, GitHub and three forums rather than all sitting in one thread, and
// that is visible at a glance from a column of marks in a way it never was from initials.
//
// The icon comes from `/api/favicon`, our own origin, NOT from Google's or DuckDuckGo's favicon
// service. Those would hand a third party the host of every lead a founder looks at, one request per
// card. See that route for the rest of the reasoning.
//
// Initials remain the fallback and are still the right one: a site with no resolvable icon, a host
// we cannot reach, or a lead with no permalink at all should render a person, not a broken square.

export default function SiteIcon({
  url,
  displayName,
  handle,
  size = 30,
  title,
}: {
  /** The lead's permalink — the post, which is what identifies the site. */
  url?: string | null;
  displayName?: string;
  handle: string;
  size?: number;
  title?: string;
}) {
  const host = hostOf(url);
  const [failed, setFailed] = useState(false);

  const frame: React.CSSProperties = {
    width: size,
    height: size,
    flexShrink: 0,
    // A rounded tile rather than a circle. Favicons are square and mostly full-bleed, and a circular
    // mask crops the corners off marks that are drawn to fill their box.
    borderRadius: Math.round(size * 0.28),
    background: "var(--card-alt)",
    border: "1px solid var(--border)",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    userSelect: "none",
  };

  if (!host || failed) {
    return (
      <span aria-hidden="true" style={{ ...frame, color: "var(--muted-strong)", fontSize: Math.round(size * 0.36), fontWeight: 700, letterSpacing: ".01em" }}>
        {initialsFor(displayName, handle)}
      </span>
    );
  }

  return (
    <span aria-hidden="true" title={title ?? host} style={frame}>
      {/* A plain <img>, not next/image: the hosts are arbitrary and unknown at build time, so
          remotePatterns cannot enumerate them. no-referrer because the site being fetched from has
          no business knowing which page of ours asked. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/favicon?host=${encodeURIComponent(host)}`}
        alt=""
        width={Math.round(size * 0.66)}
        height={Math.round(size * 0.66)}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={{ width: Math.round(size * 0.66), height: Math.round(size * 0.66), objectFit: "contain", display: "block" }}
      />
    </span>
  );
}
