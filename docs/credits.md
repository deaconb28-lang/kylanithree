# Credits

## The load-bearing decision

**Meter every plan, bill only some.** "Unlimited" is a billing policy, not a metering policy.

Every chargeable action writes a `usage_event` carrying its credit cost — on Free, on Pro, on the
top tier alike. Only Free debits a wallet. This gives us per-account COGS, abuse detection, and the
ability to change plan rules later without re-plumbing anything.

This is the decision you make once and never revisit, which is why the metering half ships before
the billing half.

## The unit

One credit, one wallet, one rate card. Deliberately **not** separate lead-credits and
message-credits — nobody can reason about two currencies.

| Action | Credits |
|---|---|
| Lead — basic (handle + source post, no contact) | 1 |
| Lead — standard (identity + role + platform history) | 3 |
| Lead — verified (validated email or reachable DM + intent evidence) | 6 |
| Contact unlock (resolving a channel on an existing lead) | 2 |
| Message sent — email | 1 |
| Message sent — Reddit/X/LinkedIn DM | 3 |
| Follow-up in a sequence | 1 |
| Drafting, editing, reply tracking, analytics | 0 |

Two rules matter more than the numbers:

**Charge for the scarce thing.** Enrichment and contact resolution cost real money per unit. Sends
cost fractions of a cent. Keeping sends cheap means the behaviour that creates value isn't the
behaviour people ration.

**Never charge for what wasn't delivered.** Enrichment returns null → no charge. A verified email
hard-bounces → auto-refund within 72h. The same person surfaced twice for one account → charged
once, lifetime. These are published, because they are the reason anyone trusts a metered product.

## Variable lead pricing

Internally the cost is a stack: `base × source_cost × verification × signal_recency ×
intent_strength`. Externally we show **three fixed tiers**. People need to predict cost before they
hit go, and a floating multiplier makes that impossible. Bucket the score, price the bucket.

This makes a **pre-flight estimate a required surface**, not a nice-to-have:

> This search will return ~120 leads, est. 380–520 credits.

Estimate wide, charge narrow.

## Plan policy

| | Free | Pro | Founder |
|---|---|---|---|
| Billing mode | metered | unlimited | unlimited |
| Wallet | PAYG balance | none (metered, unbilled) | none (metered, unbilled) |
| Signup grant | 60 credits | — | — |
| Fair-use soft ceiling | n/a (balance is the ceiling) | ~4,000 cr/mo | ~15,000 cr/mo |
| Sends per mailbox/day | 25 | 50 (ramped) | 100 (ramped) |
| Concurrency | 1 search | 3 | 10 |
| API | no | read-only | full |

Packs: 100 cr / $6, 500 cr / $20, 2,000 cr / $60. Credits don't expire while the account is active.
Auto-reload with a monthly cap.

> **Naming collision — needs a decision before the billing half ships.** Live pricing today is
> **Founder $89** / **Studio $249** with message caps (see `lib/billing.ts`). If "Founder" becomes
> the top unlimited tier, the existing $89 Founder needs a new name, or every existing link and
> receipt breaks. Nothing in this spec is safe to bill against until that is settled.

## Request lifecycle

**Reserve the estimate, capture the actual.** That single asymmetry handles under-delivery, partial
failure and overdraft with no special-case code.

```
estimate ──▶ reserve(hold)  ──▶ run job ──┬─▶ success  ─▶ capture(actual) ─▶ release remainder
                 │                        ├─▶ partial  ─▶ capture(delivered only)
                 │                        └─▶ failure  ─▶ release(full)
                 └─ insufficient balance ─▶ reject before any work starts
```

## Schema

```
wallets          account_id, balance, reserved, version
ledger_entries   wallet_id, type, amount(signed), balance_after,
                 usage_event_id, idempotency_key UNIQUE, created_at
reservations     wallet_id, amount, status(held|captured|released),
                 job_id, expires_at
usage_events     account_id, plan_at_time, action, resource_id,
                 credits, billed(bool), vendor_cost_cents,
                 rate_card_version, idempotency_key UNIQUE
rate_cards       version, effective_from, weights jsonb
lead_charges     account_id, person_fingerprint UNIQUE, tier, credits
```

`ledger_entries` is **append-only**. `wallets.balance` is a materialised read cache with optimistic
locking, never the source of truth — it must be rebuildable by replaying the ledger, and it will
need to be the first time a webhook double-fires.

`idempotency_key` on both the ledger and usage events is **not optional**. Workers retry, and a
retry that double-debits a free user ends in a chargeback.

`vendor_cost_cents` is why metering unlimited plans pays for itself — per-account margin on day
one instead of month nine.

`lead_charges.person_fingerprint` (stable hash of platform + handle, or normalised email) enforces
lifetime dedup per account. Charge once for a person, ever.

## Fair use that actually holds

Unlimited without guardrails means one user with an API key sets COGS on fire. Three layers:

1. **Rate limits and concurrency**, per plan. Hard.
2. **Deliverability caps**, which we'd want even without credits — 300 cold emails a day from one
   mailbox destroys the sending domain. Framed in the UI as what it is: *"We cap at 50/day per
   mailbox and ramp new domains over two weeks, so your sends keep landing."*
3. **Anomaly review**, soft. Trailing-30d p95 per account; past ~4× flags for a human. Never
   auto-suspend on volume alone — that catches your best customer mid-launch.

## The conversion mechanic

PAYG on free isn't a downgrade, it's a pricing probe. Set the PAYG rate so monthly burn crosses the
Pro price at roughly the volume where a subscription is preferable. At $0.03/credit in bulk and Pro
at $89, crossover is ~3,000 credits — which is where the Pro soft ceiling goes.

A free user spending $70/mo should see, plainly and **once**: *"Pro covers this month's usage for
$89."* Not a nag, not a counter, not a warning banner.

**Downgrade rules**, decided up front:

- Leads already generated stay.
- Unused PAYG credits **freeze** on upgrade and **thaw** on downgrade — never confiscated.
- Failed payment on Pro drops to free-tier rate limits for a 5-day grace window before the wallet
  takes over.

## Build status

**Shipped — the metering core** (`lib/credits/`):

- `rateCard.ts` — versioned rate card, the table above as data.
- `fingerprint.ts` — stable person fingerprint for lifetime dedup.
- `meter.ts` — `recordUsage()`, idempotent, writes a `usage_event` on every plan and debits a
  wallet only when the plan says to.
- `estimate.ts` — pre-flight estimate for a search, returning a wide range.
- Collections + indexes in `lib/collections.ts`.

**Not built yet — the billing half:**

- Wallets, reservations, the ledger, and the reserve/capture state machine.
- Stripe packs and auto-reload.
- Plan enforcement (concurrency, sends/day, soft ceilings).
- The pre-flight estimate UI surface and the single Pro-conversion prompt.

Blocked on the Founder/Studio naming decision above. Metering runs unbilled until then, which is
exactly the point: by the time billing is switched on there is already real per-account usage data
to set the ceilings against.
