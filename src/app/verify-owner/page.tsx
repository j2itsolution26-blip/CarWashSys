import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { getRegistrationCookie } from "@/server/actions/owner.actions";
import { isConsoleTransport } from "@/lib/mail/mailer";
import {
  getOwnerStatus,
  getPendingRegistration,
} from "@/server/services/owner-registration.service";
import { VerificationForm } from "./verification-form";

export const metadata = { title: "Verify your Gmail" };
export const dynamic = "force-dynamic";

/**
 * Email verification.
 *
 * Reachable only with the httpOnly registration cookie set. Refreshing keeps
 * the pending registration because the state lives in the cookie and the
 * database, never in component state or the URL.
 */
export default async function VerifyOwnerPage() {
  const businessName = process.env.NEXT_PUBLIC_BUSINESS_NAME ?? "CG CAR WASH";
  const status = await getOwnerStatus();

  if (status.state === "ACTIVE") {
    redirect("/login");
  }

  const registrationId = await getRegistrationCookie();
  const registration = registrationId ? await getPendingRegistration(registrationId) : null;

  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--surface-page)] p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p aria-hidden="true" className="text-4xl">
            📧
          </p>
          <h1 className="mt-2 text-2xl font-bold">Verify Your Gmail</h1>
          {registration ? (
            <p className="mt-1 text-sm text-muted">
              We sent a 6-digit security code to your Gmail address.
            </p>
          ) : null}
        </div>

        {/*
          Development only. With the console transport there is no email to check,
          and the heading above would otherwise be untrue.
        */}
        {registration && isConsoleTransport() ? (
          <Alert tone="warning" title="No email was sent" className="mb-4">
            <code>MAIL_TRANSPORT=console</code> is set, so the code was printed to the dev-server
            terminal instead of emailed. Clear it and configure SMTP to send real mail.
          </Alert>
        ) : null}

        {!registration ? (
          <Card>
            <CardBody className="space-y-4 text-center">
              <Alert tone="error" title="No registration in progress">
                Your registration session has expired or was completed on another device. Please
                start again.
              </Alert>
              <Link
                href="/register-owner"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[var(--brand)] px-5 font-semibold text-[var(--brand-contrast)]"
              >
                Start registration
              </Link>
              <Link
                href="/login"
                className="block text-sm font-medium text-muted underline underline-offset-2"
              >
                Back to sign in
              </Link>
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardBody>
              <VerificationForm
                maskedEmail={registration.maskedEmail}
                expiresAt={registration.expiresAt}
                resendAvailableAt={registration.resendAvailableAt}
                attemptsRemaining={registration.attemptsRemaining}
                resendsRemaining={registration.resendsRemaining}
                lockedUntil={registration.lockedUntil}
              />
            </CardBody>
          </Card>
        )}

        <p className="mt-6 text-center text-xs text-muted">
          {businessName} will never ask you for this code.
        </p>
      </div>
    </main>
  );
}
