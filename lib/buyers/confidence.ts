// How much a buyer hypothesis has actually been proven, and by what.
//
// This replaces a stored `status` field that someone assigned by hand. `primary` rendered as
// "gaining" on the card — a word that claims replies are coming back — and a hypothesis with zero
// leads read exactly the same as one with forty, because the label was written when the hypothesis
// was, not earned by anything that happened afterwards.
//
// THE HONEST PART, AND IT CONSTRAINS THE WHOLE FILE. Nothing in this product can send yet: the
// Gmail scope was reduced to `openid email profile` pending Google's verification, so `sendGmail()`
// fails at runtime and nothing anywhere writes `status: "replied"`. That means `contacted`,
// `replied` and `booked` are structurally zero today, for every hypothesis, forever, until that
// scope is approved. A formula weighted on reply rate would therefore return the same number for
// every buyer and dress it up as a measurement.
//
// So the positive terms are implemented and are DEAD until sending works, and the file says so
// rather than looking finished. What is live today is the negative evidence, which is real: the
// founder rejecting leads from a hypothesis is a measured verdict on that hypothesis, and
// `lead_rejections` has been collecting it since the relevance loop shipped.

/** Everything measurable about one hypothesis. Every field is a count of something that happened. */
export interface BuyerEvidence {
  /** Leads found and shown to the founder for this hypothesis. */
  leadsShown: number;
  /** Leads the founder rejected with a reason. Live signal — this one works today. */
  rejections: number;
  /** Approved and actually sent. Zero until the Gmail scope is verified. */
  contacted: number;
  /** Replies received. Zero until reply ingestion exists, which needs a further scope. */
  replied: number;
  /** Calls booked. Zero for the same reason. */
  booked: number;
}

/**
 * How many contacts before a reply rate means anything.
 *
 * Below this the denominator is too small to divide by — 1 contact and 0 replies is not "0%", it is
 * "we do not know yet", and the difference is the whole point. The same reasoning removed the reply
 * rate from the old metric grid.
 */
export const MIN_CONTACTED_FOR_RATE = 5;

/** How many leads must be shown before rejections are worth reading as a verdict. */
export const MIN_SHOWN_FOR_REJECTION_RATE = 4;

/** Tunable weights. Named rather than inlined so the formula can be argued about in one place. */
export const WEIGHTS = {
  reply: 55,
  booking: 45,
  rejection: 60,
} as const;

export type BuyerStatus =
  /** Nothing has been sent, so nothing is proven either way. The default, and today the only one
   *  reachable through the positive path. */
  | "unproven"
  /** The founder keeps rejecting these people. Measured, and available right now. */
  | "disconfirmed"
  /** Leads are being found but no verdict exists yet. */
  | "finding"
  /** Replies are coming back. Unreachable until Gmail sending is verified. */
  | "gaining"
  /** Explicitly retired by the founder. */
  | "retired";

export interface BuyerConfidence {
  /** 0-100, or null when there is genuinely nothing to compute from. Null is not zero. */
  score: number | null;
  status: BuyerStatus;
  /** One line naming the evidence behind the status. Never a claim the counts do not support. */
  reason: string;
}

/**
 * Score a hypothesis from what actually happened to it.
 *
 * Returns `score: null` rather than 0 whenever there is no evidence. A zero is a measurement
 * meaning "we tried and it failed"; null means "nothing has been tried". Collapsing them would put
 * a confident-looking 0 next to a buyer nobody has tested, which is the same fabrication the
 * reply-rate tile was deleted for.
 */
export function buyerConfidence(evidence: BuyerEvidence, opts: { retired?: boolean } = {}): BuyerConfidence {
  const { leadsShown, rejections, contacted, replied, booked } = evidence;

  if (opts.retired) {
    return { score: null, status: "retired", reason: "Retired — not being searched for." };
  }

  // Nothing found at all. Distinct from "found people and they were wrong".
  if (leadsShown === 0) {
    return { score: null, status: "unproven", reason: "No one matched this buyer yet." };
  }

  const rateReady = contacted >= MIN_CONTACTED_FOR_RATE;
  const rejectionReady = leadsShown >= MIN_SHOWN_FOR_REJECTION_RATE;

  const replyRate = rateReady ? replied / contacted : 0;
  const bookingRate = rateReady ? booked / contacted : 0;
  const rejectionRate = rejectionReady ? rejections / leadsShown : 0;

  const raw = WEIGHTS.reply * replyRate + WEIGHTS.booking * bookingRate - WEIGHTS.rejection * rejectionRate;

  // Disconfirmation is reportable long before confirmation is, because rejecting is the only
  // verdict a founder can currently give. More than half the leads rejected is a clear signal that
  // this is the wrong buyer, and saying so is useful even with nothing sent.
  if (rejectionReady && rejectionRate >= 0.5) {
    return {
      score: clamp(50 + raw),
      status: "disconfirmed",
      reason: `You rejected ${rejections} of ${leadsShown} — this may be the wrong buyer.`,
    };
  }

  if (rateReady && replied > 0) {
    return {
      score: clamp(50 + raw),
      status: "gaining",
      reason: `${replied} ${replied === 1 ? "reply" : "replies"} from ${contacted} contacted.`,
    };
  }

  if (rateReady) {
    return {
      score: clamp(50 + raw),
      status: "unproven",
      reason: `${contacted} contacted, nothing back yet.`,
    };
  }

  // The live state for every hypothesis today: people are being found, and the only thing that
  // could prove or disprove the buyer — actually writing to them — is not available.
  return {
    score: null,
    status: "finding",
    reason:
      rejections > 0
        ? `${leadsShown} found, ${rejections} rejected. Nothing sent yet, so nothing is proven.`
        : `${leadsShown} found. Nothing sent yet, so nothing is proven.`,
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
