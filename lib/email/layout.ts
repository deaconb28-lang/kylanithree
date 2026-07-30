// Shared visual shell for every transactional email Kylani sends — same palette as the app
// (app/globals.css) but as literal hex values, since email clients don't support CSS custom
// properties. Table-based structure rather than flex/grid, which Outlook's rendering engine
// doesn't support.

const COLOR = {
  ink: "#14120F",
  card: "#FDFCFA",
  cardAlt: "#FAF8F5",
  border: "#EDE9E3",
  muted: "#6B655D",
  ember: "#E4572E",
  green: "#2F7A56",
  greenTint: "#E9F2EC",
};

const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function emailButton(label: string, href: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0;">
      <tr>
        <td bgcolor="${COLOR.ember}" style="border-radius:10px;">
          <a href="${href}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${FONT_STACK};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

export function statPair(value: string | number, label: string): string {
  return `
    <td style="padding:14px 18px;background:${COLOR.card};border:1px solid ${COLOR.border};border-radius:12px;" align="center">
      <div style="font-family:${FONT_STACK};font-weight:800;font-size:26px;letter-spacing:-.02em;color:${COLOR.ink};line-height:1.1;">${escapeHtml(String(value))}</div>
      <div style="font-size:12.5px;color:${COLOR.muted};margin-top:2px;">${escapeHtml(label)}</div>
    </td>
  `;
}

export function renderEmailShell(opts: { preheader: string; title: string; bodyHtml: string; footerNote?: string }): string {
  const footer = opts.footerNote ?? "You're getting this because you have an active Kylani campaign.";
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(opts.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:${COLOR.cardAlt};font-family:${FONT_STACK};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.cardAlt};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${COLOR.card};border:1px solid ${COLOR.border};border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="width:28px;height:28px;border-radius:8px;background:${COLOR.ink};" align="center" valign="middle">
                      <span style="font-family:${FONT_STACK};font-weight:800;font-size:15px;color:${COLOR.card};">K</span>
                    </td>
                    <td style="padding-left:9px;">
                      <span style="font-family:${FONT_STACK};font-weight:700;font-size:17px;color:${COLOR.ink};">Kylani</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 32px;">
                ${opts.bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;border-top:1px solid ${COLOR.border};">
                <span style="font-size:12.5px;color:${COLOR.muted};line-height:1.5;">
                  ${escapeHtml(footer)} Questions? Just reply, or write to
                  <a href="mailto:deacon@kylani.app" style="color:${COLOR.muted};">deacon@kylani.app</a>.
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export { COLOR, FONT_STACK };
