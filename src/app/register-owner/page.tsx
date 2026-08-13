import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { getOwnerStatus } from "@/server/services/owner-registration.service";
import { OwnerRegistrationForm } from "./registration-form";

export const metadata = { title: "Create owner account" };
export const dynamic = "force-dynamic";

/**
 * Owner registration.
 *
 * SERVER-SIDE GUARD: navigating here directly once an owner exists renders a
 * refusal, not the form. Combined with the re-check inside the action itself,
 * typing the URL by hand or replaying the POST both fail.
 */
export default async function RegisterOwnerPage() {
  const status = await getOwnerStatus();
  const businessName = process.env.NEXT_PUBLIC_BUSINESS_NAME ?? "CG CAR WASH";

  // A registration already in flight belongs on the verification screen.
  if (status.state === "PENDING") {
    redirect("/verify-owner");
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--surface-page)] p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p aria-hidden="true" className="text-4xl">
            🚿
          </p>
          <h1 className="mt-2 text-2xl font-bold uppercase tracking-wide">{businessName}</h1>
          <p className="mt-1 text-sm text-muted">Create the owner account</p>
        </div>

        {status.state === "ACTIVE" ? (
          <Card>
            <CardBody className="space-y-4 text-center">
              <p aria-hidden="true" className="text-3xl">
                🔒
              </p>
              <Alert tone="error" title="Registration closed">
                An Owner account already exists. Owner registration is no longer available.
              </Alert>
              <p className="text-sm text-muted">
                Staff accounts are created by the owner from the Staff screen after signing in.
              </p>
              <Link
                href="/login"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[var(--brand)] px-5 font-semibold text-[var(--brand-contrast)]"
              >
                Back to sign in
              </Link>
            </CardBody>
          </Card>
        ) : (
          <>
            <Card>
              <CardBody>
                <OwnerRegistrationForm />
              </CardBody>
            </Card>

            <p className="mt-5 text-center text-sm text-muted">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-semibold text-[var(--brand-strong)] underline underline-offset-2"
              >
                Sign in
              </Link>
            </p>
          </>
        )}

        <p className="mt-6 text-center text-xs text-muted">
          This is a one-time setup. Only one owner account can ever exist.
        </p>
      </div>
    </main>
  );
}
