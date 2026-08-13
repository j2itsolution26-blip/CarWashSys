/**
 * SMTP diagnostic — `npm run mail:check [recipient@gmail.com]`
 *
 * Finds a mail misconfiguration from a terminal instead of from a user's empty
 * inbox. Two stages:
 *
 *   1. Connect + STARTTLS + authenticate, then hang up. Proves the credentials.
 *   2. Optionally send a real test message to the address passed as an argument.
 *
 * Prints the masked recipient and the SMTP reply. It never prints the password,
 * and it does not deal in verification codes at all.
 */
// `.env` is loaded by Node's --env-file flag and `server-only` is neutralised by
// --conditions=react-server; both are set in the npm script.
import { maskForLog, sendMail, verifyMailConnection } from "../src/lib/mail/mailer";

const REMEDY: Record<string, string> = {
  not_configured:
    "Set MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD and MAIL_FROM_ADDRESS in .env, and clear MAIL_TRANSPORT.",
  authentication:
    "Gmail rejected the login. Enable 2-Step Verification on the sending account, then create an App Password\n" +
    "  (Google Account -> Security -> App passwords) and paste it as MAIL_PASSWORD with no spaces.\n" +
    "  A normal Gmail password will always fail here.",
  connection:
    "Could not reach smtp.gmail.com:587. Check the network, and whether a firewall or ISP is blocking outbound 587.",
  invalid_recipient: "The mail server refused the recipient address. Check it is a real, well-formed address.",
  rejected: "Gmail accepted the login but refused the message. Try again shortly.",
  unknown: "Unrecognised SMTP failure. The raw error is printed above.",
};

async function main(): Promise<void> {
  if (process.env.MAIL_TRANSPORT === "console") {
    console.error(
      "MAIL_TRANSPORT=console is set. Nothing is emailed in this mode — clear it in .env before testing SMTP.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Host       : ${process.env.MAIL_HOST ?? "(unset)"}:${process.env.MAIL_PORT ?? "(unset)"}`);
  console.log(`Username   : ${maskForLog(process.env.MAIL_USERNAME ?? "")}`);
  console.log(`Password   : ${process.env.MAIL_PASSWORD ? "(set)" : "(UNSET)"}`);
  console.log(`From       : ${maskForLog(process.env.MAIL_FROM_ADDRESS ?? "")}\n`);

  console.log("1. Verifying SMTP connection and authentication...");
  const verified = await verifyMailConnection();

  if (!verified.ok) {
    console.error(`   FAILED (${verified.reason})`);
    console.error(`   SMTP error: ${verified.detail}\n`);
    console.error(`   ${REMEDY[verified.reason] ?? REMEDY.unknown}`);
    process.exitCode = 1;
    return;
  }
  console.log("   OK — connected, STARTTLS negotiated, credentials accepted.\n");

  const recipient = process.argv[2];
  if (!recipient) {
    console.log("Pass a recipient to also send a test message:");
    console.log("  npm run mail:check -- you@gmail.com");
    return;
  }

  console.log(`2. Sending a test message to ${maskForLog(recipient)}...`);
  try {
    const result = await sendMail({
      to: recipient,
      subject: "CG CAR WASH - SMTP test",
      text: "This is a test message from the CG CAR WASH POS mail configuration. No action is needed.",
      html: "<p>This is a test message from the CG CAR WASH POS mail configuration. No action is needed.</p>",
    });
    console.log(`   OK — accepted by the server (messageId: ${result.messageId}).`);
    console.log("   Check the inbox, then the spam folder.");
  } catch (error) {
    const reason = (error as { reason?: string }).reason ?? "unknown";
    console.error(`   FAILED (${reason})`);
    console.error(`   ${REMEDY[reason] ?? REMEDY.unknown}`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("Unexpected failure:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  // The pooled transport keeps sockets open; nothing else holds the loop.
  .finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 250));
