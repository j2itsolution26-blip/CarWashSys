import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { AppError } from "@/lib/errors";

/**
 * SMTP mail transport.
 *
 * CREDENTIALS COME FROM THE ENVIRONMENT ONLY. Nothing in this file contains a
 * host, address or password, and `.env` is gitignored — the deployed secret
 * lives in the Vercel project settings, never in the repository or in any file
 * served to a browser. This module is `server-only`, so importing it from a
 * client component is a build error rather than a leak.
 *
 * THIS MODULE NEVER PRETENDS. `sendMail` resolves only when the SMTP server has
 * accepted the message for the intended recipient. Every other outcome — no
 * configuration, no connection, a rejected login, a refused address — throws a
 * `MailError` carrying a machine-readable reason, and the caller refuses to
 * report success. A registration is never completed, and a working code is never
 * invalidated, on the strength of an email that did not actually leave.
 */

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * How the message was delivered.
 *
 *  * `sent`   — an SMTP server accepted it for the recipient.
 *  * `logged` — the dev console transport printed it. NOT delivered. Callers must
 *               never describe this to a user as a sent email.
 */
export type MailOutcome = "sent" | "logged";

export interface MailResult {
  outcome: MailOutcome;
  messageId: string | null;
}

/** Why a send failed, for mapping onto a user-facing message. */
export type MailFailureReason =
  | "not_configured"
  | "connection"
  | "authentication"
  | "invalid_recipient"
  | "rejected"
  | "unknown";

/**
 * A failed send. `message` is already safe for a browser; `reason` is for the
 * caller's logic. Neither carries the host, the account or the password.
 */
export class MailError extends AppError {
  readonly reason: MailFailureReason;

  constructor(reason: MailFailureReason, message: string) {
    super(reason === "invalid_recipient" ? "VALIDATION" : "INTERNAL", message);
    this.name = "MailError";
    this.reason = reason;
  }
}

/**
 * What the user is told for each failure class. Deliberately specific enough to
 * be actionable and vague enough to reveal nothing about the mail account or the
 * server it runs on.
 */
const USER_MESSAGE: Record<MailFailureReason, string> = {
  not_configured:
    "We couldn't send the verification code. Please check the email configuration and try again.",
  connection:
    "We couldn't reach the email server. Please check your connection and try again in a moment.",
  authentication:
    "We couldn't send the verification code. Please check the email configuration and try again.",
  invalid_recipient:
    "That email address was rejected by the mail server. Please check it and try again.",
  rejected:
    "The email provider refused the message. Please try again in a few minutes.",
  unknown: "We couldn't send the verification code. Please try again.",
};

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromAddress: string;
  fromName: string;
}

/**
 * Dev-only escape hatch. With `MAIL_TRANSPORT=console` the message is printed to
 * the server log instead of sent, so the flow can be exercised before SMTP
 * credentials exist. It is explicitly opt-in, refuses to run in production, and
 * reports the `logged` outcome so no caller can mistake it for a delivery.
 */
function consoleTransportEnabled(): boolean {
  return (
    process.env.MAIL_TRANSPORT === "console" && process.env.NODE_ENV !== "production"
  );
}

/** Verbose SMTP tracing, off in production so logs stay clean. */
function debugLoggingEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

function readConfig(): SmtpConfig | null {
  const host = process.env.MAIL_HOST?.trim();
  const user = process.env.MAIL_USERNAME?.trim();
  const password = process.env.MAIL_PASSWORD?.trim();
  const fromAddress = process.env.MAIL_FROM_ADDRESS?.trim() || user;

  if (!host || !user || !password || !fromAddress) return null;

  const port = Number(process.env.MAIL_PORT ?? 587);

  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    // Port 465 is implicit TLS; 587 upgrades via STARTTLS.
    secure: process.env.MAIL_SECURE ? process.env.MAIL_SECURE === "true" : port === 465,
    user,
    password,
    fromAddress,
    fromName: process.env.MAIL_FROM_NAME?.trim() || "CG Car Wash",
  };
}

export function isMailConfigured(): boolean {
  return consoleTransportEnabled() || readConfig() !== null;
}

/** True when codes are being printed to the dev log rather than emailed. */
export function isConsoleTransport(): boolean {
  return consoleTransportEnabled();
}

/**
 * `j*******0@gmail.com` — enough of the address to confirm the right mailbox was
 * targeted while debugging, without writing a user's full address into a log
 * file that may be shipped off the box.
 */
export function maskForLog(email: string): string {
  const [local = "", domain = ""] = email.trim().toLowerCase().split("@");
  if (!domain) return "<invalid>";
  if (local.length <= 2) return `${local}@${domain}`;
  return `${local[0]}${"*".repeat(Math.min(local.length - 2, 8))}${local.at(-1)}@${domain}`;
}

/**
 * Development tracing.
 *
 * Prints the recipient (masked), the transport stage and the outcome. It never
 * receives the password, the verification code or the message body — the code is
 * not in scope in this module at all, so it cannot be logged here by accident.
 */
function trace(stage: string, detail?: Record<string, unknown>): void {
  if (!debugLoggingEnabled()) return;
  console.info(`[mail] ${stage}`, detail ?? "");
}

let cachedTransporter: Transporter | null = null;

function getTransporter(config: SmtpConfig): Transporter {
  // Reused across requests: creating a transport per email would open a new SMTP
  // connection every time and get the sender throttled.
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
      // Gmail on 587 advertises STARTTLS; require it so credentials are never
      // put on the wire in the clear, even if the server stops offering it.
      requireTLS: !config.secure,
      pool: true,
      maxConnections: 2,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return cachedTransporter;
}

/**
 * Map a nodemailer/SMTP error onto a failure class.
 *
 * nodemailer sets `code` for transport-level problems and `responseCode` to the
 * SMTP reply code when the server answered. Gmail answers 535 for a bad App
 * Password and 550/553 for an address it will not accept.
 */
function classify(error: unknown): MailFailureReason {
  const candidate = error as { code?: string; responseCode?: number } | null;
  const code = candidate?.code;
  const responseCode = candidate?.responseCode;

  if (code === "EAUTH" || responseCode === 535 || responseCode === 534) {
    return "authentication";
  }
  if (
    code === "ECONNECTION" ||
    code === "ESOCKET" ||
    code === "ETIMEDOUT" ||
    code === "ECONNREFUSED" ||
    code === "EDNS" ||
    code === "ENOTFOUND" ||
    code === "ETLS"
  ) {
    return "connection";
  }
  if (code === "EENVELOPE" || responseCode === 550 || responseCode === 553) {
    return "invalid_recipient";
  }
  if (code === "EMESSAGE" || responseCode === 552 || responseCode === 554) {
    return "rejected";
  }
  return "unknown";
}

function fail(reason: MailFailureReason, detail: Record<string, unknown>): never {
  // Server-side only, and never in front of the user.
  console.error(`[mail] send failed (${reason})`, detail);
  throw new MailError(reason, USER_MESSAGE[reason]);
}

/**
 * Send a message, or throw a `MailError`.
 *
 * Resolving means the SMTP server returned a success reply AND listed the
 * recipient as accepted. A message the server silently dropped from the envelope
 * is treated as a failure, not a send.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  trace("verification email requested", { recipient: maskForLog(message.to) });

  if (consoleTransportEnabled()) {
    console.warn(
      `[mail] MAIL_TRANSPORT=console — message NOT sent, printed below instead.\n` +
        `  Set MAIL_TRANSPORT="" and configure MAIL_USERNAME / MAIL_PASSWORD to send for real.\n` +
        `  to: ${message.to}\n  subject: ${message.subject}\n\n${message.text}\n`,
    );
    return { outcome: "logged", messageId: null };
  }

  const config = readConfig();
  if (!config) {
    console.error(
      "[mail] SMTP is not configured. Set MAIL_HOST, MAIL_USERNAME, MAIL_PASSWORD and " +
        "MAIL_FROM_ADDRESS. Owner registration is blocked until mail works.",
    );
    throw new MailError("not_configured", USER_MESSAGE.not_configured);
  }

  trace("SMTP connection attempted", {
    host: config.host,
    port: config.port,
    secure: config.secure,
    recipient: maskForLog(message.to),
  });

  let info: Awaited<ReturnType<Transporter["sendMail"]>>;
  try {
    info = await getTransporter(config).sendMail({
      from: `"${config.fromName}" <${config.fromAddress}>`,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } catch (error) {
    const reason = classify(error);
    // A bad credential can poison a pooled transport; drop it so the next
    // attempt reconnects with whatever the environment now holds.
    if (reason === "authentication" || reason === "connection") {
      cachedTransporter?.close();
      cachedTransporter = null;
    }
    fail(reason, {
      host: config.host,
      port: config.port,
      recipient: maskForLog(message.to),
      // The SMTP reply text, which names the failure but not our credentials.
      smtpError: error instanceof Error ? error.message : String(error),
    });
  }

  // A 250 on the transaction is not proof this recipient was taken — check the
  // envelope the server actually accepted.
  const accepted: string[] = (info.accepted ?? []).map((entry: unknown) =>
    (typeof entry === "string" ? entry : String(entry)).toLowerCase(),
  );
  if (!accepted.includes(message.to.trim().toLowerCase())) {
    fail("invalid_recipient", {
      recipient: maskForLog(message.to),
      rejectedCount: (info.rejected ?? []).length,
      smtpResponse: info.response,
    });
  }

  trace("SMTP send result: accepted", {
    recipient: maskForLog(message.to),
    messageId: info.messageId,
    smtpResponse: info.response,
  });

  return { outcome: "sent", messageId: info.messageId ?? null };
}

/**
 * Prove the credentials work without sending anything — connects, runs STARTTLS
 * and authenticates, then hangs up. Used by `npm run mail:check` so a
 * misconfiguration is found from a terminal rather than from a user's empty
 * inbox.
 */
export async function verifyMailConnection(): Promise<
  { ok: true } | { ok: false; reason: MailFailureReason; detail: string }
> {
  const config = readConfig();
  if (!config) {
    return { ok: false, reason: "not_configured", detail: "SMTP environment variables are missing." };
  }
  try {
    await getTransporter(config).verify();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: classify(error),
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
