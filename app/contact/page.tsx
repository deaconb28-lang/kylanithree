import type { Metadata } from "next";
import LegalShell, { pStyle } from "../../components/legal/LegalShell";

export const metadata: Metadata = {
  title: "Contact — Kylani",
  description: "Get in touch with the Kylani team.",
};

export default function ContactPage() {
  return (
    <LegalShell title="Contact">
      <p style={pStyle}>
        Questions, feedback, a bug you found, or a suppression request on someone&apos;s behalf — all of it goes to the same
        inbox, and a real person reads it.
      </p>

      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: "28px 30px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          boxShadow: "0 1px 2px rgba(20,18,15,.05), 0 18px 40px -22px rgba(20,18,15,.18)",
        }}
      >
        <span style={{ fontSize: 13.5, color: "var(--muted)" }}>Email</span>
        <a href="mailto:deacon@kylani.app" style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 22, color: "var(--ink)" }}>
          deacon@kylani.app
        </a>
      </div>

      <p style={pStyle}>
        Looking for the Privacy Policy or Terms of Service instead? They&apos;re linked at the bottom of every page.
      </p>
    </LegalShell>
  );
}
