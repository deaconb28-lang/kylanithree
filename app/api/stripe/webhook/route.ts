import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, billingConfigured } from "@/lib/stripe";
import { Campaigns } from "@/lib/collections";
import { isInterval, isPlan } from "@/lib/billing";

export const runtime = "nodejs";

function statusFromStripe(sub: Stripe.Subscription, eventType: string): "active" | "past_due" | "canceled" | "incomplete" {
  if (eventType === "customer.subscription.deleted") return "canceled";
  if (sub.status === "active" || sub.status === "trialing") return "active";
  if (sub.status === "past_due" || sub.status === "unpaid") return "past_due";
  if (sub.status === "canceled") return "canceled";
  return "incomplete";
}

// Public, unauthenticated — Stripe calls this directly, verified by signature rather than a
// session. This is the real source of truth for subscription state; the Payment Link redirect
// after checkout is just UX polish, not something the app relies on.
export async function POST(req: NextRequest) {
  if (!billingConfigured()) {
    console.error("[stripe/webhook] STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET missing.");
    return NextResponse.json({ error: "Billing isn't configured." }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature ?? "", process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("[stripe/webhook] Signature verification failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    const campaigns = await Campaigns();

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const ref = session.client_reference_id ?? "";
        const [userId, plan, interval] = ref.split("::");
        if (!userId || !isPlan(plan) || !isInterval(interval) || !session.customer || !session.subscription) {
          console.error("[stripe/webhook] checkout.session.completed missing expected fields:", ref);
          break;
        }
        await campaigns.updateOne(
          { userId },
          {
            $set: {
              subscription: {
                plan,
                interval,
                status: "active",
                stripeCustomerId: String(session.customer),
                stripeSubscriptionId: String(session.subscription),
                updatedAt: new Date(),
              },
              updatedAt: new Date(),
            },
          },
        );
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        // current_period_end moved from the subscription to its first item in this API version.
        const periodEnd = sub.items.data[0]?.current_period_end;
        await campaigns.updateOne(
          { "subscription.stripeSubscriptionId": sub.id },
          {
            $set: {
              "subscription.status": statusFromStripe(sub, event.type),
              "subscription.currentPeriodEnd": periodEnd ? new Date(periodEnd * 1000) : null,
              "subscription.updatedAt": new Date(),
              updatedAt: new Date(),
            },
          },
        );
        break;
      }
      default:
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe/webhook] Failed to process event:", event.type, err instanceof Error ? err.message : err);
    // Non-2xx so Stripe retries — this is our own DB write failing, not a bad event.
    return NextResponse.json({ error: "Failed to process event." }, { status: 500 });
  }
}
