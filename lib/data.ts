// Landing-page content. Everything below is copy and illustration for the marketing site — none of
// it is ever shown inside a signed-in account.
//
// The Dockside demo dataset used to live here: a fabricated queue of leads, a map of invented
// communities, an activity feed, and a contact list, all of it dressed as real account data. It was
// already unreferenced by the time it was removed — the account-level seeding that used to inject
// it (`ensureSeeded`) went earlier — so this was the last copy of it in the repo.

// The gallery's brands moved to `lib/brands.ts` when the scrolling marquee became a static logo
// wall. `GalleryMark`, `GalleryProduct` and `GALLERY_PRODUCTS` went with it, along with the twelve
// app tiles they described — a shelf of identically shaped icons read as one company's app suite,
// which is what the wordmarks now avoid.

export const TESTIMONIALS = [
  {
    quote:
      "Three calls in week one, from a product nobody had heard of. I’d been staring at an empty CRM for four months.",
    name: "Maya Oyelaran",
    role: "Founder, Berth",
    color: "#E8DDD0",
  },
  {
    quote:
      "It told me I was pitching the wrong job title. That one sentence was worth more than the year of ads.",
    name: "Ivo Halstead",
    role: "Founder, Sitewatch",
    color: "#DBD3E4",
  },
  {
    quote:
      "I approve messages on the train. Eleven minutes a week, and it’s the only part of sales I don’t dread.",
    name: "Renata Vieira",
    role: "Founder, Chapterhouse",
    color: "#CFE0D8",
  },
];

export const STEPS = [
  {
    k: "Ten minutes",
    label: "Ten minutes",
    sub: "paste & correct",
    tag: "10 min · once",
    h: "Paste the URL, correct my guess.",
    b: "I read your site, propose two to four buyers, and you fix what I got wrong.",
  },
  {
    k: "The first week",
    label: "The first week",
    sub: "approve & send",
    tag: "~45 min · week 1",
    h: "40 drafts, each anchored to something real.",
    b: "You approve them. They send from your own inbox, so they arrive as you.",
  },
  {
    k: "Every morning",
    label: "Every morning",
    sub: "one card",
    tag: "60 sec · daily",
    h: "One person, one drafted reply.",
    b: "Someone described your problem yesterday. Post or skip. A minute a day.",
  },
  {
    k: "Every month",
    label: "Every month",
    sub: "findings",
    tag: "5 min · monthly",
    h: "Findings, not open rates.",
    b: "Operations managers reply six times more often than the directors you targeted.",
  },
];

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

// Illustrative placeholders for the hero's cycling input, matched to the invented brands on the
// gallery shelf so the marketing site names one cast rather than two.
export const URLS = ["berth.app", "fathom.dev", "pocketledger.io", "saltandpine.co"];

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
