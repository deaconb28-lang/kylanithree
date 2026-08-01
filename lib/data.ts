export type TodayLead = {
  key: string;
  initials: string;
  name: string;
  role: string;
  source: string;
  tag: string;
  quote: string;
  quoteMeta: string;
  draft: string;
  draftMeta: string;
  postLabel: string;
};

export const TODAY_QUEUE: TodayLead[] = [
  {
    key: "marisol",
    initials: "MR",
    name: "Marisol Reyes",
    role: "Operations manager, 60-person 3PL, Memphis · r/supplychain · 4h ago",
    source: "r/supplychain",
    tag: "Strong intent",
    quote:
      "We're doing dock appointments in a shared spreadsheet and two carriers showed up in the same 30-minute window twice this week. How is everyone else sequencing inbound without buying a whole WMS?",
    quoteMeta: "34 comments · she replied to four of them",
    draft:
      "Two carriers in the same window is usually a sequencing problem rather than a capacity one — we saw the same thing at a 3PL in Reno. What worked was giving carriers a booking link with hard slot limits, so the double-booking becomes impossible instead of visible after the fact. Happy to send the slot template we use, no strings; I build a tool in this space but the spreadsheet version works too.",
    draftMeta: "Comment in the thread, not a DM · question-opener variant",
    postLabel: "Post this reply",
  },
  {
    key: "dan",
    initials: "DK",
    name: "Dan Kowalczyk",
    role: "Warehouse lead, 140-person distribution centre · X · 9h ago",
    source: "X",
    tag: "Worth a look",
    quote: "our dock is a spreadsheet and it shows. four trucks stacked up before 7am today alone.",
    quoteMeta: "6 replies · he's quote-tweeted this twice this month",
    draft:
      "Four trucks before 7am is exactly the window Dockside is built for — carriers book a slot instead of just showing up, so the stacking happens on a calendar instead of in your yard. Not a pitch, just: is the spreadsheet actually tracking arrival times, or just who showed up?",
    draftMeta: "Reply to the post, not a DM · curiosity-opener variant",
    postLabel: "Reply to this post",
  },
  {
    key: "priya",
    initials: "PR",
    name: "Priya Raman",
    role: "Director of receiving, 90-person distribution centre · Ops Nerds · 11h ago",
    source: "Ops Nerds",
    tag: "Strong intent",
    quote: "how is everyone else handling 6am carrier arrivals? we keep getting three trucks at once and nobody has a system for it.",
    quoteMeta: "9 replies in #warehousing",
    draft:
      "Three at once at 6am is almost always a first-come-first-served gate with no reservation layer underneath. Dockside gives each carrier a booking link with hard slot limits, so 6am becomes three separate ten-minute windows instead of one scramble. Happy to walk you through how a 90-person DC near you set it up, no strings.",
    draftMeta: "Reply in #warehousing, not a DM · direct-answer variant",
    postLabel: "Post this reply",
  },
];

export type Community = {
  key: string;
  name: string;
  members: string;
  membersNum: number;
  fit: "Strong fit" | "Weak" | "Untested";
  reached: string;
  reachedNum: number | null;
  replied: string;
  repliedNum: number | null;
  note: string;
  rev: string;
  mapLabel1: string;
  mapLabel2: string;
};

export const COMMUNITIES: Record<string, Community> = {
  opsnerds: {
    key: "opsnerds",
    name: "Ops Nerds · Slack",
    members: "1.2k members",
    membersNum: 1200,
    fit: "Strong fit",
    reached: "14 reached",
    reachedNum: 14,
    replied: "5 replied",
    repliedNum: 5,
    note: "Answer questions in #warehousing. Links get ignored; a spreadsheet attachment does not.",
    rev: "$18,400 pipeline",
    mapLabel1: "Ops Nerds",
    mapLabel2: "Slack",
  },
  supplychain: {
    key: "supplychain",
    name: "r/supplychain",
    members: "41k members",
    membersNum: 41000,
    fit: "Strong fit",
    reached: "9 threads",
    reachedNum: 9,
    replied: "4 replied",
    repliedNum: 4,
    note: "Participation only, never DMs. Comments on other people’s threads outperform your own posts 3:1.",
    rev: "$12,900 pipeline",
    mapLabel1: "r/supplychain",
    mapLabel2: "",
  },
  werc: {
    key: "werc",
    name: "WERC forums",
    members: "6.8k members",
    membersNum: 6800,
    fit: "Strong fit",
    reached: "11 reached",
    reachedNum: 11,
    replied: "2 replied",
    repliedNum: 2,
    note: "Slow — two weeks to a reply — but every person here is exactly your buyer.",
    rev: "$9,900 pipeline",
    mapLabel1: "WERC",
    mapLabel2: "forums",
  },
  freightx: {
    key: "freightx",
    name: "Freight ops · X",
    members: "3.4k members",
    membersNum: 3400,
    fit: "Weak",
    reached: "19 reached",
    reachedNum: 19,
    replied: "0 replied",
    repliedNum: 0,
    note: "Loud and mostly brokers. I have stopped spending your sends here.",
    rev: "no pipeline",
    mapLabel1: "Freight ops",
    mapLabel2: "X",
  },
  logistics: {
    key: "logistics",
    name: "r/logistics",
    members: "188k members",
    membersNum: 188000,
    fit: "Weak",
    reached: "participation",
    reachedNum: 40,
    replied: "1 replied",
    repliedNum: 1,
    note: "Mostly drivers. Good for reading language, poor for finding buyers.",
    rev: "no pipeline",
    mapLabel1: "r/logistics",
    mapLabel2: "",
  },
  caviar: {
    key: "caviar",
    name: "Freight Caviar · newsletter",
    members: "22k readers",
    membersNum: 22000,
    fit: "Untested",
    reached: "—",
    reachedNum: null,
    replied: "—",
    repliedNum: null,
    note: "Sponsorship rather than outreach. $600 a send. Your call, not mine.",
    rev: "untested",
    mapLabel1: "Freight Caviar",
    mapLabel2: "untested",
  },
  discord: {
    key: "discord",
    name: "3PL Builders · Discord",
    members: "740 members",
    membersNum: 740,
    fit: "Strong fit",
    reached: "6 reached",
    reachedNum: 6,
    replied: "2 replied",
    repliedNum: 2,
    note: "Small, technical, founder-friendly. Introduce yourself in #intros first.",
    rev: "$6,000 pipeline",
    mapLabel1: "3PL Builders",
    mapLabel2: "Discord",
  },
};

export const MAP_ORDER = [
  "caviar",
  "logistics",
  "freightx",
  "werc",
  "discord",
  "opsnerds",
  "supplychain",
];

export type FeedRow = { tag: string; text: string; meta: string };

export const FEED: FeedRow[] = [
  { tag: "r/", text: "r/supplychain matched — 41k members, nine relevant threads", meta: "0:38" },
  { tag: "in", text: "Marisol Reyes · ops manager, 60-person 3PL in Memphis", meta: "1:12" },
  { tag: "x", text: "“Freight ops” X community matched — 3.4k members", meta: "1:54" },
  { tag: "in", text: "Dan Kowalczyk · warehouse lead, 140 people", meta: "2:20" },
  { tag: "!", text: "Signal: “our dock is a spreadsheet and it shows” — 4h ago", meta: "2:47" },
  { tag: "sl", text: "Ops Nerds Slack matched — #warehousing active daily", meta: "3:31" },
  { tag: "in", text: "Priya Raman · director of receiving, 90-person DC", meta: "4:02" },
  { tag: "!", text: "Signal: asking how others sequence 6am appointments", meta: "4:48" },
];

export type GalleryProduct = {
  name: string;
  category: string;
  image: string;
  alt: string;
  mrr: string;
};

export const GALLERY_PRODUCTS: GalleryProduct[] = [
  { name: "Fathom", category: "Analytics SaaS", image: "/gallery/fathom.png", alt: "Fathom logo in bold navy sans-serif", mrr: "$6,200 MRR" },
  { name: "Berth", category: "Scheduling tool", image: "/gallery/berth.png", alt: "Berth logo in bold teal condensed sans-serif", mrr: "$4,800 MRR" },
  { name: "Rill", category: "Developer CLI", image: "/gallery/rill.png", alt: "rill logo in bold monospace with a green dot", mrr: "$3,100 MRR" },
  { name: "Pocket Ledger", category: "Finance app", image: "/gallery/pocket-ledger.png", alt: "Pocket Ledger logo in bold green sans-serif", mrr: "$9,400 MRR" },
  { name: "Kiln & Co.", category: "Ceramics studio", image: "/gallery/kiln-co.png", alt: "Kiln & Co. logo in terracotta serif", mrr: "$2,300 MRR" },
  { name: "Northbound Coffee", category: "Roasted coffee", image: "/gallery/northbound-coffee.png", alt: "Northbound Coffee logo in brown serif with tracked caps", mrr: "$3,900 MRR" },
  { name: "Fieldwork Apparel", category: "Indie apparel", image: "/gallery/fieldwork-apparel.png", alt: "Fieldwork Apparel logo in bold olive condensed caps", mrr: "$5,100 MRR" },
  { name: "loop", category: "Hardware gadget", image: "/gallery/loop-charger.png", alt: "loop logo in bold blue sans-serif with a ring mark", mrr: "$7,600 MRR" },
  { name: "Greywing Studio", category: "Design studio", image: "/gallery/greywing-studio.png", alt: "Greywing studio logo in charcoal serif", mrr: "$4,400 MRR" },
  { name: "Salt & Pine", category: "Brand consultancy", image: "/gallery/salt-pine.png", alt: "Salt & Pine logo in navy bold with an orange ampersand", mrr: "$11,200 MRR" },
  { name: "Halyard", category: "Creative agency", image: "/gallery/halyard-agency.png", alt: "Halyard logo in bold crimson condensed caps", mrr: "$8,300 MRR" },
  { name: "Fenwick Partners", category: "Advisory firm", image: "/gallery/fenwick-partners.png", alt: "Fenwick Partners logo in navy serif with tracked caps", mrr: "$6,900 MRR" },
];

export const TESTIMONIALS = [
  {
    quote:
      "Three calls in week one, from a product nobody had heard of. I’d been staring at an empty CRM for four months.",
    name: "Maya Oyelaran",
    role: "Founder, Dockside",
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

export const URLS = ["dockside.app", "fathom.dev", "pocketledger.io", "saltandpine.co"];

export const QUEUE_LEADS = [
  { name: "Eli Brandt", role: "Ops manager", company: "Northline Freight, 74 people", detail: "hiring a second receiving clerk", dropped: false },
  { name: "Tasha Bell", role: "Ops manager", company: "Crossdock Co, 120 people", detail: "wrote about detention fees", dropped: false },
  { name: "Ray Oduya", role: "Warehouse mgr", company: "Halcyon Fulfilment, 210 people", detail: "posted a photo of the yard queue", dropped: false },
  { name: "Nina Alvarez", role: "Ops manager", company: "Bayline 3PL, 45 people", detail: "asked about carrier no-shows", dropped: false },
  { name: "Grant Whitley", role: "Ops manager", company: "Foothill Logistics, 88 people", detail: "opened a second dock in June", dropped: false },
  { name: "Susan Meier", role: "Warehouse mgr", company: "", detail: "Dropped — nothing specific enough to say to her yet", dropped: true },
];

export type Contact = {
  name: string;
  role: string;
  company: string;
  channel: string;
  status: "Replied" | "Sent" | "Suppressed";
};

export const CONTACTS: Contact[] = [
  { name: "Marisol Reyes", role: "Ops manager", company: "60-person 3PL, Memphis", channel: "r/supplychain", status: "Replied" },
  { name: "Eli Brandt", role: "Ops manager", company: "Northline Freight, 74 people", channel: "Email", status: "Sent" },
  { name: "Tasha Bell", role: "Ops manager", company: "Crossdock Co, 120 people", channel: "Email", status: "Sent" },
  { name: "Dan Kowalczyk", role: "Warehouse lead", company: "140-person DC", channel: "X", status: "Replied" },
  { name: "Priya Raman", role: "Director of receiving", company: "90-person DC", channel: "Ops Nerds · Slack", status: "Sent" },
  { name: "Ray Oduya", role: "Warehouse mgr", company: "Halcyon Fulfilment, 210 people", channel: "Email", status: "Sent" },
  { name: "Nina Alvarez", role: "Ops manager", company: "Bayline 3PL, 45 people", channel: "Email", status: "Sent" },
  { name: "Grant Whitley", role: "Ops manager", company: "Foothill Logistics, 88 people", channel: "Email", status: "Sent" },
  { name: "Susan Meier", role: "Warehouse mgr", company: "—", channel: "Email", status: "Suppressed" },
];

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
  { key: "gmail", name: "Gmail", color: "linear-gradient(135deg, #EA4335, #FBBC04)", glyph: "", desc: "maya@dockside.app · sends only what you approve, 30 a day", matched: true, required: true },
  { key: "reddit", name: "Reddit", color: "#FF4500", glyph: "r", desc: "Participation only — no DMs, ever, you'd get banned", matched: true },
  { key: "slack", name: "Slack communities", color: "#4A154B", glyph: "S", desc: "Your best channel so far — links only when someone asks for one", matched: true },
  { key: "discord", name: "Discord", color: "#5865F2", glyph: "D", desc: "I find the servers; intro drafted for #intros, DMs only after they reply first", matched: true },
  { key: "forums", name: "Forums & newsletters", color: "#14120F", glyph: "F", desc: "Slow — about two weeks to a reply. No community matched yet.", matched: false },
  { key: "x", name: "X (Twitter)", color: "#14120F", glyph: "X", desc: "Reply where buyers are already complaining. No community matched yet.", matched: false },
  { key: "other", name: "Other places", color: "#6B655D", glyph: "+", desc: "LinkedIn, niche blogs, anywhere else. No community matched yet.", matched: false },
];
