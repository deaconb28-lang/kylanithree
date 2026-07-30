"use client";

import { signIn } from "next-auth/react";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import KylaniLogo from "../../components/icons/KylaniLogo";

// Auth.js error "type" codes, surfaced via a `?error=` param on redirect (e.g. after a failed
// Google OAuth callback) or in signIn()'s result.error (credentials flow). Mapped to honest
// copy — the previous version showed nothing for OAuth failures and blamed "wrong password" for
// every credentials failure including a genuinely unreachable database.
function messageForErrorCode(code: string): string {
  switch (code) {
    case "CredentialsSignin":
      return "That email and password don't match.";
    case "OAuthAccountNotLinked":
      return "That Google account is already linked to a different sign-in method. Try signing in with email and password instead.";
    case "AccessDenied":
      return "Google sign-in was cancelled.";
    default:
      // CallbackRouteError, AdapterError, Configuration, or anything else — a real backend
      // problem (most often the database being unreachable), not something the user did wrong.
      return "Couldn't connect right now — this looks like a problem on our end, not your account. Try again in a bit.";
  }
}

function SignInInner() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/app";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Google sign-in redirects the whole page, so a failed OAuth callback comes back here as a
  // `?error=<code>` on the very first render rather than through the submit() handler below —
  // without reading it, that failure used to be completely silent.
  const [error, setError] = useState<string | null>(() => {
    const code = params.get("error");
    return code ? messageForErrorCode(code) : null;
  });
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Couldn't create that account.");
          setLoading(false);
          return;
        }
      }

      const result = await signIn("credentials", { email, password, redirect: false, callbackUrl });
      if (result?.error) {
        setError(messageForErrorCode(result.error));
        setLoading(false);
        return;
      }
      window.location.href = result?.url ?? callbackUrl;
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "var(--card)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: "var(--wash)",
          background:
            "radial-gradient(46% 54% at 14% 6%, #FFE8D6 0%, rgba(255,232,214,0) 62%), radial-gradient(44% 52% at 88% 12%, #F6E4F0 0%, rgba(246,228,240,0) 64%), radial-gradient(60% 64% at 56% 96%, #E8EEFF 0%, rgba(232,238,255,0) 66%)",
        }}
      />
      <div
        style={{
          position: "relative",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 20,
          padding: "44px 40px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
          maxWidth: 420,
          width: "100%",
          boxShadow: "0 1px 2px rgba(20,18,15,.06), 0 24px 60px -20px rgba(20,18,15,.18)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <KylaniLogo size={30} />
          <span style={{ fontFamily: "var(--font-outfit)", fontWeight: 700, fontSize: 20 }}>Kylani</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, textAlign: "center" }}>
          <h1 style={{ fontFamily: "var(--font-outfit)", fontWeight: 800, fontSize: 26, letterSpacing: "-.02em", margin: 0 }}>
            {mode === "signin" ? "Sign in to Kylani" : "Create your Kylani account"}
          </h1>
          <p style={{ margin: 0, fontSize: 15, color: "var(--muted)", lineHeight: 1.5 }}>
            Connect Google for Gmail sending, or use email and password to look around first.
          </p>
        </div>

        <button
          onClick={() => {
            if (googleLoading) return;
            setGoogleLoading(true);
            signIn("google", { callbackUrl });
          }}
          disabled={googleLoading}
          className="ky-btn-ember"
          style={{ width: "100%", padding: "14px 20px", fontSize: 15.5, border: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, opacity: googleLoading ? 0.6 : 1 }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#fff" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.09-1.8 2.73v2.27h2.91c1.7-1.57 2.69-3.88 2.69-6.64z" />
            <path fill="#fff" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.27c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.98v2.33A9 9 0 0 0 9 18z" />
            <path fill="#fff" d="M3.95 10.7A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.16.27-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03z" />
            <path fill="#fff" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97L3.95 7.3C4.66 5.16 6.65 3.58 9 3.58z" />
          </svg>
          {googleLoading ? "Redirecting to Google…" : "Continue with Google"}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>or</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@yourcompany.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", fontSize: 15, padding: "12px 14px", border: "1px solid var(--border-strong)", borderRadius: 10, fontFamily: "inherit" }}
          />
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", fontSize: 15, padding: "12px 14px", border: "1px solid var(--border-strong)", borderRadius: 10, fontFamily: "inherit" }}
          />
          {error && <span style={{ fontSize: 13.5, color: "var(--ember)" }}>{error}</span>}
          <button
            type="submit"
            disabled={loading}
            className="ky-btn-outline"
            style={{ width: "100%", padding: "13px 20px", fontSize: 15, fontWeight: 600, border: "1.5px solid var(--ink)", opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "One sec…" : mode === "signin" ? "Sign in with email" : "Create account"}
          </button>
        </form>

        <span style={{ fontSize: 13.5, color: "var(--muted)" }}>
          {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
          <span
            onClick={() => {
              setMode((m) => (m === "signin" ? "signup" : "signin"));
              setError(null);
            }}
            style={{ color: "var(--ember)", fontWeight: 600, cursor: "pointer" }}
          >
            {mode === "signin" ? "Create an account" : "Sign in instead"}
          </span>
        </span>

        <span style={{ fontSize: 12.5, color: "var(--muted)", textAlign: "center" }}>
          By continuing you agree to Kylani&apos;s{" "}
          <a href="/terms#sending-policy">sending policy and suppression rules</a>.
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
