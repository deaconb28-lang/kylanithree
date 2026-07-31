import { getResend, FROM_EMAIL } from "./resend";
import { COLOR, FONT_STACK, emailButton, escapeHtml, renderEmailShell, statPair } from "./email/layout";

export type OnboardingSummaryEmailInput = {
  to: string;
  productName: string;
  productUrl: string;
  buyers: { name: string; desc: string }[];
  leadsCount: number;
  communitiesCount: number;
  appUrl: string;
};

function buildText(input: OnboardingSummaryEmailInput) {
  const buyerLines = input.buyers.map((b) => `- ${b.name}: ${b.desc}`).join("\n");
  return [
    `You're on your way to your first 100 buyers for ${input.productName}.`,
    "",
    `Kylani reads real conversations — Reddit threads, forum posts, job listings — to find people who already have ` +
      `the problem ${input.productName} solves, then drafts a message anchored to what they actually said. No lists, ` +
      "no cold blasts, nothing that reads like a bot.",
    "",
    `${input.leadsCount} real lead${input.leadsCount === 1 ? "" : "s"} found, ${input.communitiesCount} communit${input.communitiesCount === 1 ? "y" : "ies"} confirmed, from ${input.productUrl}.`,
    "",
    "Buyer personas Kylani is searching for:",
    buyerLines,
    "",
    "This is the first batch, not the last — approve, edit, or skip each draft, nothing sends without you. As " +
      "replies come in, Kylani learns which persona and which channel actually convert, so finding your next " +
      "hundred gets easier, not harder.",
    "",
    `See your first drafts: ${input.appUrl}/app`,
    "",
    "— Deacon, Kylani",
  ].join("\n");
}

function buildHtml(input: OnboardingSummaryEmailInput) {
  const buyerRows = input.buyers
    .map(
      (b, i) => `
      <tr>
        <td style="padding:${i === 0 ? 0 : 12}px 0 0;${i < input.buyers.length - 1 ? `border-bottom:1px solid ${COLOR.border};padding-bottom:12px;` : ""}">
          <div style="font-size:14.5px;font-weight:700;color:${COLOR.ink};">${escapeHtml(b.name)}</div>
          <div style="font-size:13.5px;color:${COLOR.muted};line-height:1.45;margin-top:2px;">${escapeHtml(b.desc)}</div>
        </td>
      </tr>`,
    )
    .join("");

  const body = `
    <h1 style="font-family:${FONT_STACK};font-weight:800;font-size:22px;letter-spacing:-.02em;color:${COLOR.ink};margin:0 0 8px;">
      You're on your way to your first 100 buyers.
    </h1>
    <p style="font-size:15px;color:${COLOR.muted};line-height:1.55;margin:0 0 18px;">
      ${escapeHtml(input.productName)} (${escapeHtml(input.productUrl)}) is live in Kylani.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
      <tr>
        ${statPair(input.leadsCount, `real lead${input.leadsCount === 1 ? "" : "s"} found`)}
        <td style="width:12px;"></td>
        ${statPair(input.communitiesCount, `communit${input.communitiesCount === 1 ? "y" : "ies"} confirmed`)}
      </tr>
    </table>

    <p style="font-size:14.5px;color:${COLOR.muted};line-height:1.6;margin:0 0 20px;">
      Kylani reads real conversations — Reddit threads, forum posts, job listings — to find people who
      already have the problem ${escapeHtml(input.productName)} solves, then drafts a message anchored
      to what they actually said. No lists, no cold blasts, nothing that reads like a bot.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.cardAlt};border:1px solid ${COLOR.border};border-radius:12px;">
      <tr>
        <td style="padding:16px 18px;">
          <span style="font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${COLOR.muted};">Buyer personas</span>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
            ${buyerRows}
          </table>
        </td>
      </tr>
    </table>

    <p style="font-size:14.5px;color:${COLOR.muted};line-height:1.6;margin:20px 0 20px;">
      This is the first batch, not the last — approve, edit, or skip each draft, nothing sends without
      you. As replies come in, Kylani learns which persona and which channel actually convert, so
      finding your next hundred gets easier, not harder.
    </p>

    ${emailButton("See your first drafts", `${input.appUrl}/app`)}

    <p style="font-size:14px;color:${COLOR.ink};margin:22px 0 0;">— Deacon, Kylani</p>
  `;

  return renderEmailShell({
    preheader: `${input.leadsCount} real leads and ${input.communitiesCount} communities found for ${input.productName}.`,
    title: `Your Kylani campaign for ${input.productName} is ready`,
    bodyHtml: body,
  });
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
