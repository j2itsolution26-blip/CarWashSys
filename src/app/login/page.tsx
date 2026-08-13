import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/feedback";
import { InstallAppButton } from "@/components/pwa/install-app-button";
import { LoginScene } from "@/components/login/login-scene";
import { getSessionUser } from "@/lib/auth/guards";
import { landingPathFor, safeCallbackPath } from "@/lib/navigation";
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
  searchParams: Promise<{ verified?: string; callbackUrl?: string }>;
}) {
  const { verified, callbackUrl } = await searchParams;
  // Where the user was heading before middleware intercepted them. The Host
  // header identifies this deployment, so a callback pointing anywhere else is
  // discarded rather than followed.
  const returnTo = safeCallbackPath(callbackUrl, (await headers()).get("host"));

  const user = await getSessionUser();
  if (user) {
    redirect(returnTo ?? landingPathFor(user.permissions));
  }

  const ownerStatus = await getOwnerStatus();
  const businessName = process.env.NEXT_PUBLIC_BUSINESS_NAME ?? "CG CAR WASH";

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden p-4">
      {/*
        Decorative only, and behind everything: the scene is aria-hidden and
        every layer inside it is pointer-events-none, so it cannot swallow a
        click, a caret or a tab stop belonging to the form.
      */}
      <LoginScene />

      {/*
        The interactive column, lifted onto its own stacking context above the
        backdrop. `pointer-events-auto` is explicit rather than implied so the
        guarantee survives future edits to the scene.
      */}
      <div className="pointer-events-auto relative z-10 w-full max-w-sm">
        <div className="mb-6 text-center">
          <p aria-hidden="true" className="text-4xl drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
            🚿
          </p>
          {/* On the dark scene the heading is always light, independent of theme. */}
          <h1 className="mt-2 text-3xl font-bold uppercase tracking-wide text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
            {businessName}
          </h1>
          <p className="mt-1 text-sm font-medium text-white/75">Point of Sale — staff sign in</p>
        </div>

        {verified === "1" ? (
          <div className="login-card mb-4 p-4">
            <Alert tone="success" title="Owner account verified">
              Your Gmail address is confirmed. Sign in with it below.
            </Alert>
          </div>
        ) : null}

        {/* `.login-card` redefines the light tokens locally, so the fields and
            button inside stay light even when the app is in dark mode. */}
        <div className="login-card p-6">
          <LoginForm returnTo={returnTo} />
        </div>

        {/*
          Shown only while no owner account exists. This is a convenience, not a
          control — the registration page and its server actions each re-check
          the database, so removing this markup by hand gains nothing.
        */}
        {/* Below the card the background is the dark scene, so this text is
            light rather than the theme's muted grey. */}
        {ownerStatus.state === "NONE" ? (
          <p className="mt-5 text-center text-sm text-white/70">
            Don&apos;t have an owner account?{" "}
            <Link
              href="/register-owner"
              className="font-semibold text-white underline underline-offset-4 hover:text-white/80"
            >
              Create Owner Account
            </Link>
          </p>
        ) : null}

        {ownerStatus.state === "PENDING" ? (
          <p className="mt-5 text-center text-sm text-white/70">
            Owner registration in progress for {ownerStatus.pendingEmail}.{" "}
            <Link
              href="/verify-owner"
              className="font-semibold text-white underline underline-offset-4 hover:text-white/80"
            >
              Continue Email Verification
            </Link>
          </p>
        ) : null}

        {/*
          Offered before sign-in as well as inside the app: this is the screen a
          staff member reaches by typing the URL, and the whole point is that
          they should only ever have to do that once.
        */}
        {/* The helper line under the button sits on the dark scene, so it is
            lightened here rather than in the shared component. */}
        <InstallAppButton className="mt-6 [&>p]:text-white/60" />

        <p className="mt-6 text-center text-xs text-white/55">
          Authorised staff only. All activity is recorded.
        </p>
      </div>
    </main>
  );
}
