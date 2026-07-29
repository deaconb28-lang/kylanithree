import type { ReactNode } from "react";
import KylaniLogo from "../icons/KylaniLogo";

export default function OnboardingChrome({
  children,
  wash = true,
  align = "center",
}: {
  children: ReactNode;
  wash?: boolean;
  align?: "center" | "stretch";
}) {
  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "var(--card)", overflow: "hidden" }}>
      {wash && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: "var(--wash)",
            background:
              "radial-gradient(46% 54% at 14% 6%, #FFE8D6 0%, rgba(255,232,214,0) 62%), radial-gradient(44% 52% at 88% 12%, #F6E4F0 0%, rgba(246,228,240,0) 64%), radial-gradient(60% 64% at 56% 96%, #E8EEFF 0%, rgba(232,238,255,0) 66%)",
          }}
        />
      )}
      <div style={{ position: "absolute", top: 26, left: 32, display: "flex", alignItems: "center", gap: 8 }}>
        <KylaniLogo size={26} />
        <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 17 }}>Kylani</span>
      </div>
      <div
        style={{
          position: "relative",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: align === "center" ? "center" : "stretch",
          justifyContent: "center",
          gap: 30,
          padding: "110px 24px 60px",
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </div>
  );
}
