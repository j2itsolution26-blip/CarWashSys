import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/feedback";
import { getSessionUser } from "@/lib/auth/guards";
import { landingPathFor } from "@/lib/navigation";
import { getOwnerStatus } from "@/server/services/owner-registration.service";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

/**
 * `force-dynamic` because the owner-registration link must reflect the database
 * right now. A cached "Create Owner Account" link would keep offering
 * registration after the owner had been created — harmless (the server refuses
 * it) but confusing.
 */
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string }>;
}) {
  const user = await getSessionUser();
  if (user) {
    redirect(landingPathFor(user.permissions));
  }

  const { verified } = await searchParams;
  const ownerStatus = await getOwnerStatus();
  const businessName = process.env.NEXT_PUBLIC_BUSINESS_NAME ?? "CG CAR WASH";

  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--surface-page)] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p aria-hidden="true" className="text-4xl">
            🚿
          </p>
          <h1 className="mt-2 text-2xl font-bold uppercase tracking-wide">{businessName}</h1>
          <p className="mt-1 text-sm text-muted">Point of Sale — staff sign in</p>
        </div>

        {verified === "1" ? (
          <div className="mb-4">
            <Alert tone="success" title="Owner account verified">
              Your Gmail address is confirmed. Sign in with it below.
            </Alert>
          </div>
        ) : null}

        <LoginForm />

        {/*
          Shown only while no owner account exists. This is a convenience, not a
          control — the registration page and its server actions each re-check
          the database, so removing this markup by hand gains nothing.
        */}
        {ownerStatus.state === "NONE" ? (
          <p className="mt-5 text-center text-sm text-muted">
            Don&apos;t have an owner account?{" "}
            <Link
              href="/register-owner"
              className="font-semibold text-[var(--brand-strong)] underline underline-offset-2"
            >
              Create Owner Account
            </Link>
          </p>
        ) : null}

        {ownerStatus.state === "PENDING" ? (
          <p className="mt-5 text-center text-sm text-muted">
            Owner registration in progress for {ownerStatus.pendingEmail}.{" "}
            <Link
              href="/verify-owner"
              className="font-semibold text-[var(--brand-strong)] underline underline-offset-2"
            >
              Continue Email Verification
            </Link>
          </p>
        ) : null}

        <p className="mt-6 text-center text-xs text-muted">
          Authorised staff only. All activity is recorded.
        </p>
      </div>
    </main>
  );
}
