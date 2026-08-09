import type { Metadata } from "next";
import LegalShell, { Section, pStyle, ulStyle } from "../../components/legal/LegalShell";

export const metadata: Metadata = {
  title: "Terms of Service — Kylani",
  description: "The terms that govern your use of Kylani.",
};

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="July 29, 2026">
      <p style={pStyle}>
        These terms cover your use of Kylani — the product that reads your site, works out who buys from you, and drafts
        outreach for your review. By creating an account or using Kylani, you agree to them.
      </p>

      <Section title="The service">
        <p style={pStyle}>
          Kylani analyzes a URL and any notes you provide to generate buyer hypotheses, find prospective leads, and draft
          outreach messages. Nothing sends automatically — every message goes out only after you approve, edit, or reject
          it. You stay in control of what leaves your inbox.
        </p>
      </Section>

      <Section title="Accounts">
        <p style={pStyle}>
          You&apos;re responsible for the accuracy of the information you provide and for keeping your account credentials
          secure. You must be authorized to represent the product or business you onboard with Kylani.
        </p>
      </Section>

      <Section title="Connecting Google and sending mail">
        <p style={pStyle}>
          If you connect Google, you authorize Kylani to send messages through your Gmail account on your instruction. You —
          not Kylani — are the sender of record for every message that goes out, and you&apos;re responsible for the content
          of anything you approve.
        </p>
      </Section>

      <Section id="sending-policy" title="Sending policy and acceptable use">
        <p style={pStyle}>Because Kylani sends from your real inbox, we hold outreach sent through it to a higher bar than a typical mail-merge tool. You agree to:</p>
        <ul style={ulStyle}>
          <li>Only send messages that are genuinely relevant to the recipient — never blind, purchased, or scraped lists.</li>
          <li>Comply with applicable anti-spam law (e.g. CAN-SPAM, CASL, UK/EU PECR) for every message you approve.</li>
          <li>Honor every unsubscribe, suppression, or &ldquo;stop contacting me&rdquo; request immediately and permanently.</li>
          <li>Never use Kylani for harassment, deceptive claims, or impersonation.</li>
        </ul>
        <p style={pStyle}>
          We may suspend an account that we reasonably believe is using Kylani to send unwanted or abusive outreach, and we
          maintain a suppression list (see the Privacy Policy) so a person who opts out stays opted out.
        </p>
      </Section>

      <Section title="Connecting Stripe">
        <p style={pStyle}>
          Connecting Stripe is optional and only used to read a summary of your own account&apos;s revenue for display inside
          Kylani. You can disconnect it at any time from Settings.
        </p>
      </Section>

      <Section title="Plans and payment">
        <p style={pStyle}>
          Your first campaign is free. Paid plans are billed in advance on a recurring basis at the price shown at signup or
          on the pricing page, until you cancel. You can cancel at any time from Settings; access continues through the end
          of the period you&apos;ve already paid for.
        </p>
      </Section>

      <Section title="Your content">
        <p style={pStyle}>
          You own what you put into Kylani and what it drafts on your behalf. We process it as described in the Privacy
          Policy to run the service — we don&apos;t claim ownership of your campaigns, leads, or messages.
        </p>
      </Section>

      <Section title="Disclaimers">
        <p style={pStyle}>
          Kylani is provided &ldquo;as is.&rdquo; Buyer hypotheses, leads, and drafts are generated to be useful starting
          points, not guarantees — you&apos;re responsible for reviewing anything before it sends. We don&apos;t warrant that
          the service will be uninterrupted or error-free.
        </p>
      </Section>

      <Section title="Limitation of liability">
        <p style={pStyle}>
          To the extent permitted by law, Kylani isn&apos;t liable for indirect, incidental, or consequential damages arising
          from your use of the service, including messages sent after your approval.
        </p>
      </Section>

      <Section title="Termination">
        <p style={pStyle}>
          You can stop using Kylani and delete your account at any time. We may suspend or terminate accounts that violate
          the sending policy above or these terms more broadly.
        </p>
      </Section>

      <Section title="Changes to these terms">
        <p style={pStyle}>
          We may update these terms as the product changes. We&apos;ll update the date at the top of this page, and for
          material changes we&apos;ll email account holders directly.
        </p>
      </Section>

      <Section title="Contact">
        <p style={pStyle}>
          Questions about these terms — <a href="mailto:deacon@kylani.app">deacon@kylani.app</a>.
        </p>
      </Section>
    </LegalShell>
  );
}
