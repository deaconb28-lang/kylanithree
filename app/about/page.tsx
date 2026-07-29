import type { Metadata } from "next";
import LegalShell, { Section, pStyle } from "../../components/legal/LegalShell";

export const metadata: Metadata = {
  title: "About — Kylani",
  description: "Why Kylani exists, and how it finds a founder's first hundred buyers.",
};

export default function AboutPage() {
  return (
    <LegalShell title="About Kylani">
      <p style={pStyle}>
        Most early-stage founders don&apos;t have a lead-gen problem. They have a <em>going-looking</em>{" "}
        problem — their buyers are already out there: complaining on Reddit, asking questions in Slack communities, posting job ads that
        describe the exact pain a new product solves. Nobody has time to go find them one at a time, and the tools built to
        speed that up — mail-merge blasts, purchased lists — read as spam, because that&apos;s what they are.
      </p>

      <Section title="What Kylani does">
        <p style={pStyle}>
          Paste your URL. Kylani reads your site and works out who&apos;s likely to buy — as a handful of ranked, correctable
          guesses, not one confident-sounding wrong answer. Then it goes looking for those people across Reddit, Slack
          communities, Discord, forums, and job postings. For each one it finds, it drafts a specific, warm message anchored
          to something that person actually said or did — never a generic template.
        </p>
        <p style={pStyle}>
          You approve, edit, or drop every draft. Nothing sends on its own. What you approve goes out from your own Gmail,
          so replies land in your real inbox, not a shared tool inbox somewhere. Over time, Kylani tells you which buyer
          guess is actually converting and which communities are worth the effort — the kind of thing you can only learn by
          actually doing this for a while, which is the whole point of having something else do it for you.
        </p>
      </Section>

      <Section title="Why it works this way">
        <p style={pStyle}>
          Warm outreach beats cold blasts because it&apos;s specific — it references something real, to someone who actually
          has the problem. That&apos;s slow to do by hand and easy to fake badly. Kylani&apos;s job is to do the slow part
          (reading, searching, drafting) without faking the specific part. If it can&apos;t find a real reason to write to
          someone, it doesn&apos;t draft them a message.
        </p>
      </Section>

      <Section title="Who's building it">
        <p style={pStyle}>
          Kylani is built and run by me, Deacon. If something&apos;s broken, confusing, or just missing, I&apos;d genuinely
          like to hear about it — <a href="mailto:deacon@kylani.app">deacon@kylani.app</a>{" "}
          reaches me directly.
        </p>
      </Section>
    </LegalShell>
  );
}
