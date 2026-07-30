import type { SuppressionReason } from "./collections";

export const SUPPRESSION_REASONS: SuppressionReason[] = ["unsubscribed", "bounced", "existing_customer"];

export const SUPPRESSION_REASON_LABELS: Record<SuppressionReason, string> = {
  unsubscribed: "Unsubscribed",
  bounced: "Bounced email",
  existing_customer: "Existing customer",
};
