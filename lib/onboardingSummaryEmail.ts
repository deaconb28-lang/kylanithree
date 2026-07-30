import { getResend, FROM_EMAIL } from "./resend";

export type OnboardingSummaryEmailInput = {
  to: string;
  productName: string;
  productUrl: string;
  buyers: { name: string; desc: string }[];
  leadsCount: number;
  communitiesCount: number;
  appUrl: string;
};

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildText(input: OnboardingSummaryEmailInput) {
  const buyerLines = input.buyers.map((b) => `- ${b.name}: ${b.desc}`).join("\n");
  return [
    `Your Kylani campaign for ${input.productName} (${input.productUrl}) is set up.`,
    "",
    "Buyer personas:",
    buyerLines,
    "",
    `${input.leadsCount} real lead${input.leadsCount === 1 ? "" : "s"} found, ${input.communitiesCount} communit${input.communitiesCount === 1 ? "y" : "ies"} confirmed.`,
    "",
    `See your first drafts: ${input.appUrl}/app`,
    "",
    "— Deacon, Kylani",
  ].join("\n");
}

function buildHtml(input: OnboardingSummaryEmailInput) {
  const buyerItems = input.buyers
    .map((b) => `<li style="margin-bottom:8px;"><strong>${escapeHtml(b.name)}</strong> — ${escapeHtml(b.desc)}</li>`)
    .join("");
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#FDFCFA;color:#14120F;padding:32px 24px;">
      <div style="max-width:520px;margin:0 auto;">
        <h1 style="font-size:22px;font-weight:800;margin:0 0 8px;">Your Kylani campaign is set up.</h1>
        <p style="font-size:15px;color:#4A443D;line-height:1.6;margin:0 0 20px;">
          ${escapeHtml(input.productName)} (${escapeHtml(input.productUrl)}) is live. Here's what I found.
        </p>
        <div style="border:1px solid #EDE9E3;border-radius:12px;padding:18px 20px;margin-bottom:20px;">
          <span style="font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#6B655D;">Buyer personas</span>
          <ul style="margin:10px 0 0;padding-left:18px;font-size:14.5px;line-height:1.5;">${buyerItems}</ul>
        </div>
        <p style="font-size:15px;line-height:1.6;margin:0 0 24px;">
          <strong>${input.leadsCount}</strong> real lead${input.leadsCount === 1 ? "" : "s"} found ·
          <strong>${input.communitiesCount}</strong> communit${input.communitiesCount === 1 ? "y" : "ies"} confirmed.
        </p>
        <a href="${input.appUrl}/app" style="display:inline-block;background:#E4572E;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">
          See your first drafts
        </a>
        <p style="font-size:13px;color:#6B655D;margin-top:28px;">— Deacon, Kylani</p>
      </div>
    </div>
  `;
}

// Fire-and-forget from the caller's point of view — a failure here should never block or fail
// onboarding itself (the campaign is already built by the time this runs). Callers should wrap
// this in their own try/catch and just log, not surface it to the user.
export async function sendOnboardingSummaryEmail(input: OnboardingSummaryEmailInput) {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to: input.to,
    subject: `Your Kylani campaign for ${input.productName} is ready`,
    text: buildText(input),
    html: buildHtml(input),
  });
}
