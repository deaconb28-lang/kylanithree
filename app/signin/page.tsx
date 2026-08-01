"use client";

import { signIn } from "next-auth/react";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import KylaniLogo from "../../components/icons/KylaniLogo";

// Google is the only way in. Email/password was removed along with its register route: it meant
// maintaining a password store and a reset flow to reach the same Google account most founders
// were going to use anyway — and since Kylani sends from the founder's own Gmail, a password
// account could never actually send anything without granting Google access separately.
//
// Auth.js error "type" codes arrive as a `?error=` param on the redirect back from a failed OAuth
// callback. Without reading it that failure is completely silent, which is how it used to behave.
function messageForErrorCode(code: string): string {
  switch (code) {
    case "AccessDenied":
      return "Google sign-in was cancelled — nothing was shared.";
    case "OAuthAccountNotLinked":
      return "That email is already registered under a different sign-in method. Email deacon@kylani.app and we'll move it across.";
    case "Configuration":
      return "Google sign-in isn't configured correctly on our side. We've been notified — try again shortly.";
    default:
      // CallbackRouteError, AdapterError, or anything else — a real backend problem (most often
      // the database being unreachable), not something the person did wrong.
      return "Couldn't connect right now — this looks like a problem on our end, not your account. Try again in a bit.";
  }
}

function SignInInner() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/app";

  const [error, setError] = useState<string | null>(() => {
    const code = params.get("error");
    return code ? messageForErrorCode(code) : null;
  });
  const [loading, setLoading] = useState(false);

  const continueWithGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn("google", { callbackUrl });
    } catch {
      setError("Couldn't reach Google. Check your connection and try again.");
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--paper)", padding: "40px 5vw", position: "relative", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: "-160px -80px auto -80px",
          height: 640,
          opacity: "var(--wash)",
          background:
            "radial-gradient(52% 58% at 18% 4%, #FFE8D6 0%, rgba(255,232,214,0) 62%), radial-gradient(48% 54% at 84% 6%, #E8EEFF 0%, rgba(232,238,255,0) 64%)",
        }}
      />

      <div style={{ position: "relative", width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 24 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, alignSelf: "center", color: "var(--ink)" }}>
          <KylaniLogo size={30} />
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 20, letterSpacing: "-.01em" }}>Kylani</span>
        </Link>

        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 18,
            padding: "32px 30px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
            boxShadow: "var(--lift-3)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 7, textAlign: "center" }}>
            <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: 25, letterSpacing: "-.03em", margin: 0 }}>
              Sign in to Kylani
            </h1>
            <p style={{ margin: 0, fontSize: 14.5, color: "var(--muted)", lineHeight: 1.55 }}>
              Kylani sends from your own inbox, so replies come back to you — which is why it signs you in with Google.
            </p>
          </div>

          {error && (
            <div style={{ background: "var(--ember-tint)", border: "1px solid var(--attention-border)", borderRadius: 11, padding: "12px 14px", fontSize: 13.5, color: "var(--ink)", lineHeight: 1.5 }}>
              {error}
            </div>
          )}

          <button
            onClick={continueWithGoogle}
            disabled={loading}
            className="ky-btn-outline"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 11,
              padding: "14px 18px",
              fontSize: 15.5,
              fontWeight: 600,
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.6 : 1,
              width: "100%",
            }}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
              <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {loading ? "Opening Google…" : "Continue with Google"}
          </button>

          <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55, textAlign: "center" }}>
            We ask for your name and email only. Nothing is posted or sent on your behalf without you approving it
            first.
          </p>
        </div>

        <span style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", lineHeight: 1.6 }}>
          Haven&apos;t set up your product yet? <Link href="/onboarding" style={{ fontWeight: 600 }}>Start here</Link> — you
          only sign in once Kylani has something to show you.
        </span>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInInner />
    </Suspense>
  );
}
