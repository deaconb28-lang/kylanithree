import Link from "next/link";

const CARDS = [
  {
    n: "01",
    title: "I read what you built",
    body: "Pages, pricing, the changelog — plus how comparable products position themselves. Working out what problem this actually removes, not scraping keywords.",
    time: "~40 seconds →",
    href: "/onboarding",
    dark: false,
    artifact: (
      <div style={{ border: "1px solid var(--border)", borderRadius: 10, background: "var(--card-alt)", padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        {[88, 68, 78].map((w, i) => (
          <div key={i} style={{ height: 8, borderRadius: 4, background: "var(--border-strong)", width: `${w}%` }} />
        ))}
      </div>
    ),
  },
  {
    n: "02",
    title: "I work out who it's for",
    body: "2–4 buyer hypotheses, ranked by confidence. You correct me, and I search for whichever ones you keep. That correction is the real input — not a form.",
    time: "One click to fix →",
    href: "/onboarding",
    dark: false,
    artifact: (
      <div style={{ border: "1.5px solid var(--ink)", borderRadius: 10, background: "var(--card)", padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Ops manager</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ember)", background: "var(--ember-tint)", padding: "2px 7px", borderRadius: 999, whiteSpace: "nowrap" }}>Most likely</span>
      </div>
    ),
  },
  {
    n: "03",
    title: "I go and find them",
    body: "Reddit, X, forums, communities, the open web. Real people already describing the problem you solve — with a link to the post and the date they said it.",
    time: "However many are really there →",
    href: "/app/map",
    dark: false,
    artifact: (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--green)", background: "var(--green-tint)", padding: "4px 9px", borderRadius: 999 }}>r/supplychain</span>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--green)", background: "var(--green-tint)", padding: "4px 9px", borderRadius: 999 }}>Ops Nerds</span>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", background: "var(--active-bg)", padding: "4px 9px", borderRadius: 999 }}>+5 more</span>
      </div>
    ),
  },
  {
    n: "04",
    title: "I write the first draft",
    body: "Anchored to something that person actually said, in their words. You approve, edit, or skip — and it sends from your own inbox, so replies come back to you.",
    time: "Waiting on you, not the other way round →",
    href: "/app/queue",
    dark: true,
    artifact: (
      <div style={{ border: "1px solid rgba(253,252,250,.18)", borderRadius: 10, background: "rgba(253,252,250,.06)", padding: 12, fontSize: 13, lineHeight: 1.55, color: "var(--card)" }}>
        &ldquo;Eli — saw Northline is hiring a receiving clerk…&rdquo;
      </div>
    ),
  },
];

export default function ProcessSteps() {
  return (
    <div style={{ padding: "96px 5vw", display: "flex", flexDirection: "column", gap: 48, borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 700 }}>
        <h2 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.05, letterSpacing: "-.03em", margin: 0 }}>
          Paste a URL. Four things happen.
        </h2>
        <p style={{ margin: 0, fontSize: 18, lineHeight: 1.6, color: "var(--muted)" }}>
          Not four tools bolted together — one pass, where each step hands the next something real to work with.
        </p>
      </div>

      <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
        {CARDS.map((c) => (
          <div
            key={c.n}
            className="ky-card-hover"
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              gap: 18,
              background: c.dark ? "var(--ink)" : "var(--card)",
              border: `1px solid ${c.dark ? "var(--ink)" : "var(--border)"}`,
              borderRadius: 18,
              padding: "22px 20px 24px",
            }}
          >
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                background: c.dark ? "var(--ember)" : "var(--ink)",
                color: c.dark ? "#fff" : "var(--card)",
                display: "grid",
                placeItems: "center",
                fontFamily: "var(--font-outfit)",
                fontWeight: 800,
                fontSize: 16,
              }}
            >
              {c.n}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 20, letterSpacing: "-.02em", color: c.dark ? "var(--card)" : "inherit" }}>{c.title}</span>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: c.dark ? "#C9C3B9" : "var(--muted)" }}>{c.body}</p>
            </div>
            {c.artifact}
            <Link
              href={c.href}
              style={{ marginTop: "auto", fontSize: 12.5, color: c.dark ? "#FFB89C" : "var(--ember)", fontWeight: 700, textDecoration: "none" }}
            >
              {c.time}
            </Link>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, border: "1px solid var(--border)", borderRadius: 16, padding: "24px 5vw", background: "var(--card)", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 19, letterSpacing: "-.02em", maxWidth: "40ch" }}>
          One URL in. This is what typically comes out the other end.
        </span>
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: 30, letterSpacing: "-.03em" }}>104</span>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>buyers found</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: 30, letterSpacing: "-.03em" }}>41</span>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>contacted, week one</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: 30, letterSpacing: "-.03em", color: "var(--green)" }}>$18.4k</span>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>pipeline attributed</span>
          </div>
        </div>
      </div>
    </div>
  );
}
