import Link from "next/link";
import KylaniLogo from "../icons/KylaniLogo";

export const h2Style: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: 21,
  letterSpacing: "-.01em",
  color: "var(--ink)",
  margin: "0 0 10px",
};

export const pStyle: React.CSSProperties = {
  margin: 0,
};

export const ulStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 22,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

export function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ display: "flex", flexDirection: "column", gap: 12, scrollMarginTop: 88 }}>
      <h2 style={h2Style}>{title}</h2>
      {children}
    </section>
  );
}

export default function LegalShell({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--paper)" }}>
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 5vw", borderBottom: "1px solid var(--border)" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <KylaniLogo size={26} />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "var(--ink)" }}>Kylani</span>
        </Link>
        <Link href="/" className="ky-link" style={{ fontSize: 14.5 }}>
          ← Back to kylani.app
        </Link>
      </nav>

      <div style={{ flex: 1, padding: "56px 5vw 100px", display: "flex", justifyContent: "center" }}>
        <div style={{ maxWidth: 720, width: "100%", display: "flex", flexDirection: "column", gap: 36 }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(30px,4.5vw,44px)", letterSpacing: "-.03em", margin: 0 }}>{title}</h1>
            {updated && <p style={{ margin: "12px 0 0", fontSize: 13.5, color: "var(--muted)" }}>Last updated {updated}</p>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 30, fontSize: 15.5, lineHeight: 1.7, color: "var(--muted-strong)" }}>{children}</div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--border)", padding: "28px 5vw", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 14, color: "var(--muted)", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <KylaniLogo size={20} />
          <span>Kylani · your first sales hire</span>
        </div>
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
          <Link href="/about" className="ky-link">About</Link>
          <Link href="/privacy" className="ky-link">Privacy</Link>
          <Link href="/terms" className="ky-link">Terms</Link>
          <Link href="/contact" className="ky-link">Contact</Link>
        </div>
      </div>
    </div>
  );
}
