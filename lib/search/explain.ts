import type { DropReason, StageMetric } from "./types";

// The pipeline, explained — and the rules for reading a trace of it.
//
// This is the single source of truth behind /diagnostics. The page documents the architecture from
// STAGES and diagnoses a run from diagnose(), so the explanation of what a stage does and the
// verdict about why it produced nothing can never drift apart. Adding a stage to the pipeline means
// adding it here, and the page picks it up for free.

export type Phase = "resolve" | "extract";

export type StageDoc = {
  /** Matches the stage key emitted by Trace — waves make the extract keys dynamic (`:w0`, `:w1`). */
  match: RegExp;
  phase: Phase;
  title: string;
  /** What this stage actually does. */
  what: string;
  /** What has to be true for it to produce anything. */
  needs: string;
  /** What it means when candidates go in and nothing comes out. */
  zeroMeans: string;
};

export const PHASES: Record<Phase, { title: string; blurb: string }> = {
  resolve: {
    title: "Phase 1 — Find the communities",
    blurb:
      "Works out WHERE this kind of buyer gathers. Cacheable and shared across every founder in the same niche, because the answer to 'where do warehouse managers talk' does not depend on who is asking. Small, high-signal communities are preferred over large general ones.",
  },
  extract: {
    title: "Phase 2 — Find the people inside them",
    blurb:
      "Searches inside those communities for individuals describing the problem right now. Runs once per wave: each wave moves to the next phrases and the next page of results, widening the net without ever relaxing the quality bar.",
  },
};

export const STAGES: StageDoc[] = [
  {
    match: /^venues:cache$/,
    phase: "resolve",
    title: "Cache lookup",
    what: "Checks whether this niche's communities were already resolved for someone else, keyed on the niche rather than the company.",
    needs: "MongoDB reachable. A miss is normal and costs nothing — the run just resolves from scratch.",
    zeroMeans: "Cache miss, or Mongo is unreachable. Not a fault on its own; the note says which.",
  },
  {
    match: /^venues:discover$/,
    phase: "resolve",
    title: "Subreddit discovery",
    what: "Searches Reddit's own directory for subreddits matching the buyer's vocabulary.",
    needs: "Reddit API credentials (REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET). Reddit blocks unauthenticated requests from datacenter IPs.",
    zeroMeans: "Reddit is refusing us. Expected without credentials — the run falls back to the always-available sources and open-web discovery, so this alone should not empty the result.",
  },
  {
    match: /^venues:reddit-unavailable$/,
    phase: "resolve",
    title: "Reddit fallback notice",
    what: "Records that Reddit produced nothing so the rest of the run is read in that light.",
    needs: "Nothing — this is a marker, not a step.",
    zeroMeans: "Always zero. Its presence tells you Reddit contributed no communities.",
  },
  {
    match: /^venues:web$/,
    phase: "resolve",
    title: "Open-web discovery",
    what: "Asks Claude, with web search on, to find real forums and Discourse instances where this buyer actually posts.",
    needs: "ANTHROPIC_API_KEY. Bounded at 12s — it returns nothing rather than overrunning the function.",
    zeroMeans: "Either no API key, the 12s budget was hit, or the model genuinely found no forum it could name with a real URL.",
  },
  {
    match: /^venues:annotate$/,
    phase: "resolve",
    title: "Rank and annotate",
    what: "One short model pass that prunes weak communities and writes the fit note and member count shown on screen.",
    needs: "ANTHROPIC_API_KEY. Bounded at 12s; on timeout the venues survive unannotated rather than being lost.",
    zeroMeans: "The model rejected every candidate community, or the call failed outright. Check the note.",
  },
  {
    match: /^reddit:auth$/,
    phase: "resolve",
    title: "Reddit auth mode",
    what: "Reports whether the run was authenticated to Reddit or anonymous.",
    needs: "Nothing — a marker.",
    zeroMeans: "Always zero. Read the note, not the count.",
  },
  {
    match: /^extract:fanout/,
    phase: "extract",
    title: "Search every community in parallel",
    what: "Fires one query per community per phrase, all at once, deduplicated by post. Each source gets 4s, the whole fan-out gets 7s.",
    needs: "At least one reachable source. Sources that time out or error are counted and skipped, never fatal.",
    zeroMeans: "The sources answered but had nothing matching in the relevance window. Usually the niche's phrases are too specific, or the window is too tight — not a broken search.",
  },
  {
    match: /^extract:filter/,
    phase: "extract",
    title: "Cheap filter",
    what: "Removes what is definitionally not a lead — bots, marketing accounts, aggregators, posts too old or too short, and repeat authors — then ranks the survivors by recency, engagement and topical overlap.",
    needs: "Nothing external. Pure local scoring, always fast.",
    zeroMeans: "Real posts were found but every one was junk by definition. The drop breakdown says exactly which rule fired.",
  },
  {
    match: /^extract:score/,
    phase: "extract",
    title: "Model scoring",
    what: "The expensive pass. Reads the best candidates and decides who is genuinely expressing the problem, assigns an intent tier, and pulls a verbatim excerpt.",
    needs: "ANTHROPIC_API_KEY. This is the only stage that can invent nothing — an excerpt that is not literally in the post is rejected.",
    zeroMeans: "Either the model judged none of them to be real buyers (an honest result), or the call itself failed — the note distinguishes them.",
  },
];

export function docFor(stage: string): StageDoc | undefined {
  return STAGES.find((s) => s.match.test(stage));
}

export const DROPS: Record<DropReason, { label: string; meaning: string }> = {
  stale: { label: "Too old", meaning: "Posted outside this niche's relevance window. Widen the window if the niche moves slowly." },
  too_short: { label: "Too short", meaning: "Under 45 characters — not enough for anyone to tell what the person actually wants." },
  self_promo: { label: "Self-promotion", meaning: "The poster is selling, not buying. Matched the niche's own negative terms." },
  bot: { label: "Bot", meaning: "Automated account. Not a person." },
  aggregator: { label: "Aggregator", meaning: "A digest, roundup or link dump rather than someone speaking for themselves." },
  keyword_only: { label: "Keyword only", meaning: "Matched the words but not the meaning. This gate is no longer applied — the model pass judges meaning instead." },
  dupe_author: { label: "Already seen", meaning: "This person already surfaced in an earlier wave or community. One person is one lead." },
  no_intent: { label: "No intent", meaning: "The model read it and found no real buying or complaining intent." },
  excerpt_not_verbatim: { label: "Unverifiable quote", meaning: "The excerpt could not be matched back to the real post text, so the lead was dropped rather than shipped with a quote we cannot stand behind." },
  source_timeout: { label: "Source timed out", meaning: "That platform did not answer inside its 4s budget. The run continues without it." },
  source_error: { label: "Source errored", meaning: "That platform refused or failed the request — usually a 403 from an unauthenticated API." },
};

export type Verdict = {
  status: "ok" | "empty" | "broken";
  /** The stage where the funnel actually died, if there is one. */
  stage?: string;
  headline: string;
  detail: string;
  fixes: string[];
};

const SLOW_MS = 10_000;

function find(stages: StageMetric[], re: RegExp) {
  return stages.filter((s) => re.test(s.stage));
}

function sum(stages: StageMetric[], pick: (s: StageMetric) => number) {
  return stages.reduce((a, s) => a + pick(s), 0);
}

function dominantDrop(s: StageMetric): [DropReason, number] | null {
  const entries = Object.entries(s.drops ?? {}).filter(([, n]) => n > 0) as [DropReason, number][];
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0];
}

// Reads a trace and names the earliest point at which the run stopped producing. Earliest matters:
// a zero at scoring is meaningless if nothing was ever found to score, and reporting both would
// send someone chasing the wrong stage.
export function diagnose(stages: StageMetric[], leadsFound: number): Verdict {
  if (stages.length === 0) {
    return {
      status: "broken",
      headline: "The run produced no trace at all.",
      detail: "The function was killed before it recorded a single stage, or it failed on the very first call.",
      fixes: ["Confirm Fluid Compute is enabled on the Vercel project — without it functions are capped far below the configured maxDuration.", "Check ANTHROPIC_API_KEY is set."],
    };
  }

  const slow = stages.filter((s) => s.ms > SLOW_MS);

  if (leadsFound > 0) {
    return {
      status: "ok",
      headline: `The pipeline works end to end — ${leadsFound} real ${leadsFound === 1 ? "lead" : "leads"}.`,
      detail:
        slow.length > 0
          ? `It works, but ${slow.map((s) => s.stage).join(", ")} ran over ${SLOW_MS / 1000}s. That is close enough to the platform ceiling to be killed under load.`
          : "Every stage produced output and stayed inside its budget. If a real onboarding still returns nothing, the problem is that niche's vocabulary, not the search.",
      fixes: slow.length > 0 ? ["Confirm Fluid Compute is enabled on the Vercel project."] : [],
    };
  }

  // Phase 1 — did we ever get somewhere to search?
  //
  // Only three stages report a FINAL venue count. venues:discover and venues:web are intermediate:
  // their output feeds annotation, which decides what actually survives. Counting them as resolved
  // venues would report phase 1 as healthy on a run where annotation threw everything away.
  const annotate = find(stages, /^venues:annotate$/)[0];
  const cache = find(stages, /^venues:cache$/)[0];
  const fallback = find(stages, /^venues:reddit-unavailable$/)[0];
  const resolvedVenues = cache?.candidatesOut || fallback?.candidatesOut || annotate?.candidatesOut || 0;

  if (resolvedVenues === 0) {
    if (annotate && annotate.candidatesIn > 0) {
      return {
        status: "broken",
        stage: annotate.stage,
        headline: "Communities were found, then the ranking pass threw them all away.",
        detail: `${annotate.candidatesIn} candidate communities went into the annotate stage and none came out.${annotate.note ? ` Note: ${annotate.note}` : ""}`,
        fixes: ["Check ANTHROPIC_API_KEY is set and valid.", "If the note mentions a timeout, the 12s annotation budget was hit — the venues should have survived unannotated, so this is a bug worth reporting."],
      };
    }
    return {
      status: "broken",
      stage: "venues",
      headline: "No communities were found, so there was nowhere to search.",
      detail:
        "Reddit discovery and open-web discovery both came back empty. The always-available sources (Hacker News, Lemmy, Stack Exchange) should still have provided a floor, so this usually means the model call that annotates them failed.",
      fixes: [
        "Check ANTHROPIC_API_KEY is set — open-web discovery and annotation both need it.",
        "Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET to unblock subreddit discovery.",
        "Check the Lead sources card above — if every source is red, the deployment cannot reach the open internet.",
      ],
    };
  }

  // Phase 2 — we had venues, so where did the people go?
  const fanout = find(stages, /^extract:fanout/);
  const filter = find(stages, /^extract:filter/);
  const score = find(stages, /^extract:score/);

  if (fanout.length === 0) {
    return {
      status: "broken",
      stage: "extract:fanout",
      headline: "Communities resolved but the search inside them never ran.",
      detail: "No fan-out stage was recorded, which means the run ended after phase 1 — either it was cut off, or no community was marked searchable.",
      fixes: ["Confirm Fluid Compute is enabled on the Vercel project.", "Check the venue list below — a venue that is 'not searchable' has no API we can query."],
    };
  }

  const rawFound = sum(fanout, (s) => s.candidatesOut);
  if (rawFound === 0) {
    const timeouts = sum(fanout, (s) => s.drops?.source_timeout ?? 0);
    const errors = sum(fanout, (s) => s.drops?.source_error ?? 0);
    const queries = sum(fanout, (s) => s.candidatesIn);
    if (errors > 0 && errors >= timeouts) {
      return {
        status: "broken",
        stage: fanout[0].stage,
        headline: "Every source refused the request.",
        detail: `${queries} queries went out and ${errors} came back as errors. The communities were fine; the platforms would not answer.`,
        fixes: ["Check the Lead sources card above for which ones are returning 403.", "Reddit needs credentials. Bluesky needs BLUESKY_IDENTIFIER and BLUESKY_APP_PASSWORD — unauthenticated search is blocked from datacenter IPs."],
      };
    }
    if (timeouts > 0) {
      return {
        status: "broken",
        stage: fanout[0].stage,
        headline: "The sources were too slow to answer.",
        detail: `${timeouts} of ${queries} queries hit the 4s per-source budget. Nothing came back in time to filter.`,
        fixes: ["Usually transient — run it again.", "If it persists, the deployment's outbound network is slow or being throttled."],
      };
    }
    return {
      status: "empty",
      stage: fanout[0].stage,
      headline: "The sources answered, but had nothing matching.",
      detail: `${queries} queries ran cleanly across the resolved communities and returned zero posts inside the relevance window. This is a vocabulary or recency result, not a failure — the search worked and the niche was quiet.`,
      fixes: [
        "Widen the relevance window for this niche (analyze-site chooses it; the floor is 30 days).",
        "Broaden the buyer description — narrower personas produce narrower phrases, which match fewer real posts.",
      ],
    };
  }

  const kept = sum(filter, (s) => s.candidatesOut);
  if (filter.length > 0 && kept === 0) {
    const worst = filter.map(dominantDrop).filter(Boolean).sort((a, b) => b![1] - a![1])[0];
    return {
      status: "empty",
      stage: filter[0].stage,
      headline: "Real posts were found, then every one was filtered out.",
      detail: `${rawFound} posts came back and none survived the cheap filter.${worst ? ` The biggest single reason was ${DROPS[worst[0]].label.toLowerCase()} (${worst[1]}) — ${DROPS[worst[0]].meaning}` : ""}`,
      fixes: [
        "If the dominant reason is 'too old', the relevance window is too tight for this niche.",
        "If it is 'self-promotion', the niche's negative terms may be too aggressive and are catching real people.",
      ],
    };
  }

  const scoreFailure = score.find((s) => (s.note ?? "").includes("scoring failed"));
  if (scoreFailure) {
    return {
      status: "broken",
      stage: scoreFailure.stage,
      headline: "The model scoring pass failed.",
      detail: `Candidates reached the expensive pass and the call itself fell over. ${scoreFailure.note}`,
      fixes: ["Check ANTHROPIC_API_KEY is set and valid.", "If the note mentions a timeout, this stage is exceeding the function ceiling — confirm Fluid Compute is enabled."],
    };
  }

  if (score.length > 0 && sum(score, (s) => s.candidatesOut) === 0) {
    const noIntent = sum(score, (s) => s.drops?.no_intent ?? 0);
    const unverifiable = sum(score, (s) => s.drops?.excerpt_not_verbatim ?? 0);
    return {
      status: "empty",
      stage: score[0].stage,
      headline: "Candidates reached the model, and none were judged real buyers.",
      detail: `${sum(score, (s) => s.candidatesIn)} posts were read closely. ${noIntent} showed no real intent${unverifiable > 0 ? ` and ${unverifiable} had a quote that could not be verified against the original post` : ""}. This is the quality bar doing its job — it is the intended behaviour, not a fault.`,
      fixes: ["Nothing to fix if the niche is genuinely quiet.", "If you expected leads here, the buyer description may be pointing the model at the wrong kind of person."],
    };
  }

  return {
    status: "empty",
    stage: undefined,
    headline: "The run completed but produced no leads.",
    detail: "No single stage zeroed out, so the losses were spread across the funnel rather than caused by one break.",
    fixes: ["Read the stage table below — the largest in-to-out drop is where to look."],
  };
}
