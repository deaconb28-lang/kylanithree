import { stripe } from "./stripe";
import { PLAN } from "./billing";

// Finding — or creating, exactly once — the live Stripe Price for the single plan.
//
// The alternative was pasting a `price_…` id into an environment variable. That fails in a specific
// and expensive way: a Price in Stripe is IMMUTABLE, so "changing the price" always means creating a
// new one, and an id pasted months ago keeps charging the old amount while the marketing page shows
// the new one. Nothing errors. Customers are simply billed a number nobody on the team believes.
//
// Resolving by `lookup_key` fixes that because the key encodes the amount (`kylani_monthly_4999`).
// A price change means a new key, which cannot resolve to the old Price, so the two can never
// silently disagree. `STRIPE_PRICE_ID` still wins when set, for the case where the price is managed
// by hand in the dashboard.
//
// Creation is idempotent by construction: the lookup runs first, and `lookup_key` is unique per
// account in Stripe, so a race between two concurrent checkouts ends with one create succeeding and
// the other failing — which is then re-resolved rather than retried blindly.

let cached: { id: string; at: number } | null = null;
/** Long enough to spare every checkout two API calls, short enough that a dashboard edit lands. */
const CACHE_MS = 10 * 60_000;

export class PriceUnavailable extends Error {}

/**
 * The Price id to charge, creating the Product and Price on first use if they do not exist.
 *
 * Throws rather than falling back to any other price. A checkout that quietly bills the wrong
 * amount is the worst outcome available here — worse than a checkout that does not open — so there
 * is deliberately no "close enough" branch.
 */
export async function resolvePriceId(): Promise<string> {
  const override = process.env.STRIPE_PRICE_ID?.trim();
  if (override) return override;

  if (cached && Date.now() - cached.at < CACHE_MS) return cached.id;

  // 1. Does it already exist?
  const found = await findByLookupKey();
  if (found) {
    cached = { id: found, at: Date.now() };
    return found;
  }

  // 2. Create it, once.
  try {
    const product = await findOrCreateProduct();
    const price = await stripe.prices.create({
      product,
      unit_amount: PLAN.amountCents,
      currency: PLAN.currency,
      recurring: { interval: PLAN.interval },
      lookup_key: PLAN.lookupKey,
      // If a Price somehow already holds this key, take it over rather than failing — the key is
      // the identity we care about, and two prices claiming it is the state to avoid.
      transfer_lookup_key: true,
    });
    console.error(`[billing] created Stripe price ${price.id} (${PLAN.lookupKey}, ${PLAN.amountCents} ${PLAN.currency})`);
    cached = { id: price.id, at: Date.now() };
    return price.id;
  } catch (err) {
    // A concurrent checkout may have created it in the gap between the lookup and the create. Ask
    // again before giving up: losing that race is the expected outcome, not a failure.
    const raced = await findByLookupKey().catch(() => null);
    if (raced) {
      cached = { id: raced, at: Date.now() };
      return raced;
    }
    throw new PriceUnavailable(
      `Could not resolve or create the Stripe price for ${PLAN.lookupKey}: ${err instanceof Error ? err.message : err}`,
    );
  }
}

async function findByLookupKey(): Promise<string | null> {
  const list = await stripe.prices.list({ lookup_keys: [PLAN.lookupKey], active: true, limit: 1 });
  const price = list.data[0];
  if (!price) return null;

  // Trust but verify. A Price is immutable, so this can only disagree if someone transferred the
  // lookup key onto a different amount — in which case charging it would bill a figure the product
  // never displays, and refusing is the only safe answer.
  if (price.unit_amount !== PLAN.amountCents || price.currency !== PLAN.currency) {
    throw new PriceUnavailable(
      `Stripe price ${price.id} carries lookup key ${PLAN.lookupKey} but is ` +
        `${price.unit_amount} ${price.currency}, not ${PLAN.amountCents} ${PLAN.currency}. ` +
        `Refusing to charge an amount the product does not display.`,
    );
  }
  return price.id;
}

async function findOrCreateProduct(): Promise<string> {
  // Products are not unique by name, so an existing one is reused when its metadata claims this
  // plan — otherwise a redeploy would litter the account with duplicate "Kylani" products.
  const existing = await stripe.products.search({ query: `metadata['kylani_plan']:'${PLAN.id}'`, limit: 1 }).catch(() => null);
  if (existing?.data[0]) return existing.data[0].id;

  const product = await stripe.products.create({
    name: PLAN.name,
    description: PLAN.tagline,
    metadata: { kylani_plan: PLAN.id },
  });
  return product.id;
}

/** Drops the memo so the next checkout re-reads Stripe. Used by tests and after a price change. */
export function resetPriceCache() {
  cached = null;
}
