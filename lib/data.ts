// Landing-page content. Everything below is copy and illustration for the marketing site — none of
// it is ever shown inside a signed-in account.
//
// The Dockside demo dataset used to live here: a fabricated queue of leads, a map of invented
// communities, an activity feed, and a contact list, all of it dressed as real account data. It was
// already unreferenced by the time it was removed — the account-level seeding that used to inject
// it (`ensureSeeded`) went earlier — so this was the last copy of it in the repo.

// The customer-logo gallery is gone entirely, along with `GalleryMark`, `GalleryProduct` and
// `GALLERY_PRODUCTS`. It went through three forms — twelve wordmark PNGs, twelve drawn app tiles,
// then twenty-five drawn wordmarks — and the objection that finally landed applies to all three:
// a wall of logos is a customer list, and every name on this one was invented.

// The disc beside each quote is a placeholder for a face nobody has a photo of. Tokens rather than
// pastels since the palette went monochrome — three invented hues were the last colour on the
// landing page, and a stand-in avatar is the weakest possible reason to break a design system.
export const TESTIMONIALS = [
  {
    quote:
      "Three calls in week one, from a product nobody had heard of. I’d been staring at an empty CRM for four months.",
    name: "Maya Oyelaran",
    role: "Founder, Berth",
    color: "var(--card-alt)",
  },
  {
    quote:
      "It told me I was pitching the wrong job title. That one sentence was worth more than the year of ads.",
    name: "Ivo Halstead",
    role: "Founder, Sitewatch",
    color: "var(--active-bg)",
  },
  {
    quote:
      "I approve messages on the train. Eleven minutes a week, and it’s the only part of sales I don’t dread.",
    name: "Renata Vieira",
    role: "Founder, Chapterhouse",
    color: "var(--border)",
  },
];

// STEPS is gone with the four-stage "ten minutes, then every morning" section it drove. That page
// described the product's time cost in prose beside mocked-up panels; the question a founder has
// before pasting a URL is whether the people it comes back with are worth writing to, and only the
// output answers that. Replaced by components/landing/Demo.tsx, which replays a captured real run.

export const FAQS = [
  {
    q: "Does Kylani send Reddit DMs?",
    a: "Never. Reddit output is participation guidance — which threads to answer, in your own account. Getting you banned would end this product.",
  },
  {
    q: "Where do the emails come from?",
    a: "Your own Gmail. Your domain, your reputation, hard daily caps, unsubscribe on every message.",
  },
  {
    q: "Is this a lead database?",
    a: "No. Business contacts from public channels, verified, deduplicated, and screened against suppression before a message is written.",
  },
  {
    q: "What happens when someone replies?",
    a: "Kylani stops. It classifies the reply, drafts an answer, sets a return timer on “not right now”, and hands the conversation to you.",
  },
  {
    q: "No customers, no audience. Too early?",
    a: "That's exactly the moment. You need a working product and a URL. The rest is what Kylani is for.",
  },
];

// The hero's URL input no longer names an example company. Its placeholder is "your url here" —
// an instruction rather than a specimen. The old rotating list of invented domains (and the
// `useUrlCycle` hook that rotated it) went with the customer-logo gallery they were matched to:
// both were the marketing site quietly naming companies that do not exist.

export type ChannelKey = "gmail" | "reddit" | "slack" | "discord" | "forums" | "x" | "other";

export const CHANNELS: {
  key: ChannelKey;
  name: string;
  color: string;
  glyph: string;
  desc: string;
  matched: boolean;
  required?: boolean;
}[] = [
  // The Gmail line asserts no address. It used to read "maya@dockside.app", which presented a
  // fabricated stranger's inbox to every founder as their own connected account.
  { key: "gmail", name: "Gmail", color: "linear-gradient(135deg, #EA4335, #FBBC04)", glyph: "", desc: "Sends only what you approve, up to 30 a day", matched: true, required: true },
  { key: "reddit", name: "Reddit", color: "#FF4500", glyph: "r", desc: "Participation only — no DMs, ever, you'd get banned", matched: true },
  { key: "slack", name: "Slack communities", color: "#4A154B", glyph: "S", desc: "Your best channel so far — links only when someone asks for one", matched: true },
  { key: "discord", name: "Discord", color: "#5865F2", glyph: "D", desc: "I find the servers; intro drafted for #intros, DMs only after they reply first", matched: true },
  { key: "forums", name: "Forums & newsletters", color: "#14120F", glyph: "F", desc: "Slow — about two weeks to a reply. No community matched yet.", matched: false },
  { key: "x", name: "X (Twitter)", color: "#14120F", glyph: "X", desc: "Reply where buyers are already complaining. No community matched yet.", matched: false },
  { key: "other", name: "Other places", color: "#6B655D", glyph: "+", desc: "LinkedIn, niche blogs, anywhere else. No community matched yet.", matched: false },
];
