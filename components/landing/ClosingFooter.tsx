import KylaniLogo from "../icons/KylaniLogo";

export default function ClosingFooter() {
  return (
    <div style={{ position: "relative", overflow: "hidden", borderTop: "1px solid var(--border)" }}>
      <div
        style={{
          position: "absolute",
          inset: "-200px -60px -60px -60px",
          opacity: "var(--wash)",
          background:
            "radial-gradient(50% 70% at 20% 100%, #FFE8D6 0%, rgba(255,232,214,0) 60%), radial-gradient(50% 70% at 78% 90%, #E8EEFF 0%, rgba(232,238,255,0) 62%)",
        }}
      />
      <div style={{ position: "relative", padding: "104px 5vw 40px", display: "flex", flexDirection: "column", gap: 28, alignItems: "center", textAlign: "center" }}>
        <h2 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: "clamp(30px,5vw,54px)", lineHeight: 1.02, letterSpacing: "-.035em", margin: 0, maxWidth: "22ch" }}>
          Your product is ready. This is the part that&apos;s left.
        </h2>
        <p style={{ margin: 0, fontSize: 18, color: "var(--muted-strong)", maxWidth: "50ch", lineHeight: 1.6 }}>
          Ten minutes from now you&apos;ll have a hundred names and a reason for each. Nobody is going to ask why it took you this
          long.
        </p>
        <a
          href="/onboarding"
          style={{
            display: "flex",
            gap: 10,
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "8px 8px 8px 20px",
            alignItems: "center",
            width: "min(100%, 520px)",
            boxShadow: "0 1px 2px rgba(20,18,15,.05), 0 14px 30px -16px rgba(20,18,15,.18)",
          }}
        >
          <span style={{ fontSize: 17, color: "var(--muted)", flex: 1, textAlign: "left" }}>yourproduct.com</span>
          <span className="ky-btn-ember" style={{ padding: "13px 24px", fontSize: 16, whiteSpace: "nowrap" }}>
            Read my product
          </span>
        </a>
      </div>
      <div style={{ position: "relative", padding: "40px 5vw 44px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 14, color: "var(--muted)", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <KylaniLogo size={22} />
          <span>Kylani · your first sales hire</span>
        </div>
        <div style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
          <span>Privacy</span>
          <span>Sending policy</span>
          <span>Suppression requests</span>
          <span>hello@kylani.com</span>
        </div>
      </div>
    </div>
  );
}
