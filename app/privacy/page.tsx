import type { Metadata } from "next";
import LegalShell, { Section, pStyle, ulStyle } from "../../components/legal/LegalShell";

export const metadata: Metadata = {
  title: "Privacy Policy — Kylani",
  description: "How Kylani collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="July 29, 2026">
      <p style={pStyle}>
        This policy explains what Kylani collects when you use the product, why, and what control you have over it. Kylani
        is built to find and write to your buyers on your behalf — that only works if you trust what happens to your data
        along the way, so we&apos;ve tried to keep this in plain language rather than boilerplate.
      </p>

      <Section title="Information we collect">
        <p style={pStyle}>We collect the following categories of information:</p>
        <ul style={ulStyle}>
          <li>
            <strong>Account information.</strong>{" "}
            Your email address, and either a hashed password (if you sign up with
            email) or your basic Google profile (name, email, avatar) if you sign in with Google.
          </li>
          <li>
            <strong>Onboarding answers.</strong>{" "}
            The URL you paste, any notes you add about your product, the buyer
            hypotheses you confirm or correct, and the channels you choose to search.
          </li>
          <li>
            <strong>Campaign data.</strong>{" "}
            The leads, communities, hypotheses, drafts, and findings Kylani generates or you
            edit while using the product.
          </li>
          <li>
            <strong>Connected account tokens.</strong>{" "}
            If you connect Google, an OAuth token scoped to sending mail on your
            behalf. If you connect Stripe, an OAuth token scoped to reading your account&apos;s revenue summary. We never see
            or store your Google or Stripe password.
          </li>
          <li>
            <strong>Usage data.</strong>{" "}
            Basic, anonymized product analytics (via Vercel Analytics) to understand which
            pages are used — no cross-site tracking, no ad identifiers.
          </li>
        </ul>
      </Section>

      <Section title="How we use it">
        <ul style={ulStyle}>
          <li>To generate buyer hypotheses, leads, and draft outreach messages for your campaign.</li>
          <li>To send messages you&apos;ve explicitly approved, from your own connected Gmail account.</li>
          <li>To show you real revenue and reply data once you connect Stripe or start sending.</li>
          <li>To keep your account secure and your campaign data private to you.</li>
          <li>To improve Kylani&apos;s product — never to sell your data, and never to train third-party models on it.</li>
        </ul>
      </Section>

      <Section title="AI processing">
        <p style={pStyle}>
          Kylani sends the URL, notes, and page content you provide to Anthropic&apos;s Claude API to analyze your product and
          draft outreach copy. That content is transmitted to Anthropic solely to generate your results and is handled under
          Anthropic&apos;s own API data-handling terms — it is not used to train Anthropic&apos;s models.
        </p>
      </Section>

      <Section title="Sending email on your behalf">
        <p style={pStyle}>
          If you connect Google, Kylani requests a Gmail &ldquo;send&rdquo; scope so approved messages go out from your own
          inbox, not a shared tool inbox. Kylani never sends anything you haven&apos;t explicitly approved, and never reads
          your existing mail — the scope we request only allows sending.
        </p>
      </Section>

      <Section title="Revenue data">
        <p style={pStyle}>
          If you connect Stripe, Kylani reads a summary of your account&apos;s revenue via Stripe Connect (OAuth) to show real
          numbers on your Map page. We don&apos;t store your Stripe API keys, and disconnecting Stripe at any time immediately
          stops this access.
        </p>
      </Section>

      <Section title="Where your data lives">
        <p style={pStyle}>
          Campaign data is stored in MongoDB Atlas. The application itself runs on Vercel. Both providers are
          industry-standard infrastructure vendors bound by their own security and data-processing commitments; neither has
          any independent right to use your data.
        </p>
      </Section>

      <Section title="Data retention and deletion" id="suppression">
        <p style={pStyle}>
          We keep your account and campaign data for as long as your account is active. You can ask us to delete your
          account and all associated data — leads, drafts, findings, and connected-account tokens — at any time by emailing{" "}
          <a href="mailto:deacon@kylani.app">deacon@kylani.app</a>. If someone Kylani has contacted asks to be suppressed
          from future outreach, we honor that request immediately and keep a record of the suppression so it isn&apos;t
          contacted again through Kylani.
        </p>
      </Section>

      <Section title="Your rights">
        <p style={pStyle}>
          You can access, export, correct, or delete your data at any time. Disconnecting Stripe from Settings revokes
          that access immediately — Google can&apos;t be disconnected from within Kylani since sending depends on it, but
          you can revoke its access anytime from your Google Account&apos;s connected-apps settings. To exercise any of
          these rights, email{" "}
          <a href="mailto:deacon@kylani.app">deacon@kylani.app</a>.
        </p>
      </Section>

      <Section title="Children's privacy">
        <p style={pStyle}>Kylani is a business tool and isn&apos;t directed at, or knowingly used by, children under 16.</p>
      </Section>

      <Section title="Changes to this policy">
        <p style={pStyle}>
          If this policy changes in a way that affects how your data is handled, we&apos;ll update the date at the top of this
          page and, for material changes, email account holders directly.
        </p>
      </Section>

      <Section title="Contact">
        <p style={pStyle}>
          Questions about this policy or your data — <a href="mailto:deacon@kylani.app">deacon@kylani.app</a>.
        </p>
      </Section>
    </LegalShell>
  );
}
