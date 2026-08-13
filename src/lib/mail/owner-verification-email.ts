import type { MailMessage } from "./mailer";

/**
 * The owner verification email.
 *
 * Built as a table-based layout with inline styles because that is what survives
 * Gmail, Outlook and Apple Mail — external stylesheets and modern CSS are
 * stripped by most clients. A plain-text alternative is always included so the
 * code is readable in a text-only client and so the message is less likely to be
 * scored as spam.
 */
export function buildOwnerVerificationEmail(input: {
  to: string;
  name: string;
  code: string;
  expiresInMinutes: number;
  businessName: string;
}): MailMessage {
  const { to, name, code, expiresInMinutes, businessName } = input;

  const text = [
    `${businessName} — Owner Account Verification`,
    "",
    `Hello ${name},`,
    "",
    `Your verification code is: ${code}`,
    "",
    `This code expires in ${expiresInMinutes} minutes and can be used once.`,
    "",
    "SECURITY NOTICE",
    `${businessName} staff will never ask you for this code. If you did not try`,
    "to create an owner account, ignore this email — no account has been created.",
    "",
    "— This is an automated message; replies are not monitored.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;">
  <!-- Preheader: shown in the inbox preview, hidden in the body. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    Your ${businessName} owner verification code expires in ${expiresInMinutes} minutes.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

          <tr>
            <td style="padding:28px 32px 20px;text-align:center;border-bottom:1px solid #e2e8f0;">
              <div style="font-size:30px;line-height:1;">&#128703;</div>
              <div style="margin-top:8px;font-size:19px;font-weight:700;letter-spacing:0.08em;color:#0f172a;text-transform:uppercase;">
                ${escapeHtml(businessName)}
              </div>
              <div style="margin-top:4px;font-size:13px;color:#64748b;">Owner Account Verification</div>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 32px 8px;">
              <p style="margin:0 0 14px;font-size:15px;color:#0f172a;">Hello ${escapeHtml(name)},</p>
              <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#334155;">
                Use the security code below to finish creating the owner account for
                ${escapeHtml(businessName)}.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
                <tr>
                  <td style="padding:22px;text-align:center;">
                    <div style="font-size:11px;font-weight:600;letter-spacing:0.14em;color:#64748b;text-transform:uppercase;">
                      Verification code
                    </div>
                    <div style="margin-top:10px;font-family:'SF Mono',Consolas,Menlo,monospace;font-size:36px;font-weight:700;letter-spacing:0.28em;color:#0f172a;">
                      ${escapeHtml(code)}
                    </div>
                    <div style="margin-top:10px;font-size:13px;color:#64748b;">
                      Expires in ${expiresInMinutes} minutes &middot; single use
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 32px 4px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border-left:3px solid #dc2626;border-radius:6px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <div style="font-size:13px;font-weight:700;color:#991b1b;">Security notice</div>
                    <div style="margin-top:5px;font-size:13px;line-height:1.6;color:#7f1d1d;">
                      Never share this code with anyone. ${escapeHtml(businessName)} staff will never
                      ask you for it. If you did not request it, ignore this email — no account has
                      been created.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:22px 32px 28px;border-top:1px solid #e2e8f0;margin-top:20px;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;text-align:center;">
                This is an automated message from the ${escapeHtml(businessName)} point-of-sale
                system. Replies are not monitored.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    to,
    subject: `${businessName} - Your Owner Verification Code`,
    text,
    html,
  };
}

/** The name is user-supplied and lands in an HTML document. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
