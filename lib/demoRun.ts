// A RECORDING OF A REAL RUN. Nothing here is written by hand.
//
// Every field below was captured from `POST /api/discover` and its SSE stream against production on
// 4 August 2026, for plausible.io. The inferred sentence, the six keywords, the communities, the
// narration, the people, their quotes and their permalinks are exactly what the product returned.
// The links resolve, because they are the posts.
//
// That distinction is the whole reason this section exists in this form. The previous homepage demo
// was cut for being a scripted replay of a fictional company clicking through a flow — and the
// objection recorded at the time was that a scripted demo is a strange thing to show when the real
// thing does it in seconds. A recording of a real run answers that: it is the same evidence a
// founder gets, and the section says plainly that it is a recording rather than a live search.
//
// SIX OF FIFTEEN. The run found fifteen people; six are shown, because fifteen cards is a scroll
// rather than a demo. The count is stated in the UI so the selection is visible rather than implied.
//
// To re-record: run the flow against production, capture the SSE stream, and replace this file. Do
// not edit a quote, a name or a link by hand — the moment any of it is written rather than captured,
// this stops being a recording and the section's claim becomes false.

export const DEMO_RUN = {
  url: "plausible.io",
  capturedOn: "4 August 2026",
  /** What the fast pass inferred from the site, and how long it took. */
  whatYouSell: "A simple, privacy-friendly analytics dashboard that replaces Google Analytics.",
  inferenceMs: 8979,
  keywords: [
    "google analytics too complicated",
    "cookie banner requirement",
    "site slowed down by tracking script",
    "GDPR compliant analytics",
    "GA4 confusing dashboard",
    "analytics without cookie consent",
  ],
  /** Total the run actually returned. Shown so "six shown" is not read as "six found". */
  totalFound: 15,
  /**
   * Where the run looked, and how many of the fifteen it found in each.
   *
   * The counts are the FULL run tallied by venue, not the six cards shown below, and they sum to
   * fifteen — so the wheel's total and the "found 15 people" line are the same number rather than
   * two numbers a reader has to reconcile. An earlier version tallied only the shown six and the
   * wheel quietly said "4 found" underneath a sentence claiming fifteen.
   *
   * The three zeroes are real: Lemmy, Bluesky and Quora were scanned and returned nobody. They keep
   * their rows because where it looked and found nothing is information too — dropping them would
   * overstate the reach of every run.
   */
  venues: [
    { id: "hn:all", name: "Hacker News", platform: "Hacker News" },
    { id: "github:all", name: "GitHub", platform: "GitHub" },
    { id: "se:all", name: "Stack Exchange", platform: "Forum" },
    { id: "ghost:forum", name: "forum.ghost.org", platform: "Forum" },
    { id: "mozilla:discourse", name: "discourse.mozilla.org", platform: "Forum" },
    { id: "shopify:community", name: "community.shopify.com", platform: "Forum" },
    { id: "lemmy:all", name: "Lemmy communities", platform: "Forum" },
    { id: "bsky:all", name: "Bluesky", platform: "X" },
    { id: "quora:all", name: "Quora", platform: "Forum" },
  ],
  hitsByVenue: {
    "Hacker News": 3,
    GitHub: 3,
    "Stack Exchange": 5,
    "forum.ghost.org": 2,
    "discourse.mozilla.org": 1,
    "community.shopify.com": 1,
    "Lemmy communities": 0,
    Bluesky: 0,
    Quora: 0,
  } as Record<string, number>,
  leads: [
    {
      author: "garyhbutton",
      displayName: "garyhbutton",
      venueName: "Hacker News",
      permalink: "https://news.ycombinator.com/item?id=49103122",
      summary: "Wants a privacy-focused replacement for Google Analytics on a side project.",
      excerpt:
        "I am working on a small side project and I have used Google Analytics in the past but am looking for something a little more privacy focused, what do you use?",
      matchedFor: ["google analytics too complicated"],
      postedAt: "2026-07-29T21:09:44.000Z",
      engagement: "9 comments · 3 points",
      intent: "Asking for a tool",
    },
    {
      author: "CheckAnalytic",
      displayName: "CheckAnalytic",
      venueName: "Hacker News",
      permalink: "https://news.ycombinator.com/item?id=46411416",
      summary: "Loses a third to a half of all traffic data to cookie consent banners.",
      excerpt:
        "On many EU websites: • Analytics scripts load only after consent • 30–60% of visitors never click “Accept” • No consent = no pageviews, no events, no funnels",
      matchedFor: ["analytics without cookie consent"],
      postedAt: "2025-12-28T14:46:11.000Z",
      intent: "Describing the pain",
    },
    {
      author: "jerclarke",
      displayName: "Jer Clarke",
      bio: "Jer is an earthling web developer from Montreal. Jer works on Global Voices with WordPress.",
      venueName: "GitHub",
      permalink: "https://github.com/robflaherty/riveted/issues/40",
      summary: "Needs a replacement for a discontinued engagement tracker now that GA4's metrics fall short.",
      excerpt:
        "I know the new “Engagement” section of GA4 is a lot better than the old timing stuff in previous GA versions, but it strikes me that Riveted still offered something worthwhile in checking that people were…",
      matchedFor: ["google analytics too complicated"],
      postedAt: "2022-09-30T23:52:52.000Z",
      tenure: "16 years",
      intent: "Switching away",
    },
    {
      author: "GJC3",
      displayName: "Jarvis",
      bio: "Ghost publisher since 2022. I am an essay and fiction writer.",
      venueName: "forum.ghost.org",
      permalink: "https://forum.ghost.org/t/analytics-numbers-seem-stuck/63404",
      summary: "Their visitor numbers are stuck and disagree with what Google reports.",
      excerpt:
        "My visitor numbers seem stuck, showing the same monthly and weekly number of users for days. The numbers are quite far apart from Google’s. Any suggestions.",
      matchedFor: ["google analytics too complicated"],
      postedAt: "2026-07-22T18:14:31.808Z",
      tenure: "8 months",
      intent: "Describing the pain",
    },
    {
      author: "Y-bar",
      displayName: "Y-bar",
      venueName: "Hacker News",
      permalink: "https://news.ycombinator.com/item?id=49107901",
      summary: "Running Hotjar, Google Analytics and three more services on every site they launch.",
      excerpt: "When we launch a site it is seldom more than perhaps Hotjar, Google Analytics, and two-three other services connected.",
      matchedFor: ["google analytics too complicated"],
      postedAt: "2026-07-30T10:02:35.000Z",
      intent: "Describing the pain",
    },
    {
      author: "Julien_Mirage",
      displayName: "Julien Mirage",
      venueName: "discourse.mozilla.org",
      permalink:
        "https://discourse.mozilla.org/t/i-built-a-free-extension-that-auto-rejects-cookie-banners-based-on-your-preferences-firefox-open-to-feedback/148574",
      summary: "Built their own extension rather than keep dismissing cookie consent banners.",
      excerpt:
        "CookieConsentMate — Handle cookie consent banners automatically. Set your cookie preferences once, and never fill in a consent banner again.",
      matchedFor: ["cookie banner requirement", "analytics without cookie consent"],
      postedAt: "2026-06-04T09:39:37.076Z",
      intent: "Built a workaround",
    },
  ],
} as const;

export type DemoLead = (typeof DEMO_RUN.leads)[number];
