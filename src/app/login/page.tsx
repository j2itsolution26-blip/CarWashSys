import Link from "next/link";
import Image from "next/image";
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
        {verified === "1" ? (
          <div className="login-card mb-4 p-4">
            <Alert tone="success" title="Owner account verified">
              Your Gmail address is confirmed. Sign in with it below.
            </Alert>
          </div>
        ) : null}

        {/* `.login-card` redefines the theme tokens locally as dark navy glass,
            so the fields, button and alerts inside restyle themselves without
            any change to the shared UI components. */}
        <div className="login-card p-6 sm:p-7">
          {/* Branding lives inside the card, as in the reference composition. */}
          <div className="mb-6 text-center">
            <div className="flex items-center justify-center gap-2.5">
              {/* The existing app mark, reused rather than reinvented. */}
              <Image
                src="/icons/icon-192.png"
                alt=""
                aria-hidden="true"
                width={44}
                height={44}
                priority
                className="size-11 rounded-xl"
              />
              <span className="text-4xl font-extrabold tracking-tight text-white">
                CG
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-extrabold uppercase tracking-[0.06em] text-white">
              {businessName.replace(/^CG\s+/i, "")}
            </h1>
            <p className="mt-1.5 text-sm font-medium text-[var(--text-muted)]">
              Point of Sale — staff sign in
            </p>
          </div>

          <LoginForm returnTo={returnTo} />

          {/* Security note — small and secondary, per the brief. */}
          <p className="mt-5 flex items-start justify-center gap-2 text-center text-xs text-[var(--text-muted)]">
            <span aria-hidden="true" className="mt-px shrink-0 text-[var(--brand-strong)]">
              <ShieldIcon />
            </span>
            <span>
              Authorised staff only.
              <br />
              All activity is recorded.
            </span>
          </p>
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

        {/* Brand tagline, sitting under the card as in the reference. */}
        <div className="mt-6 flex items-center justify-center gap-2.5 text-center">
          <span aria-hidden="true" className="text-[var(--brand-strong)] text-[#1683ff]">
            <DropletIcon />
          </span>
          <span>
            <span className="block text-sm font-bold uppercase tracking-[0.16em] text-white/90">
              Clean. Shine. Protect.
            </span>
            <span className="block text-xs text-white/45">We take care of your ride.</span>
          </span>
        </div>
      </div>
    </main>
  );
}

function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        d="M12 2.5 4.5 5.8v6.1c0 4.6 3.2 8.4 7.5 9.6 4.3-1.2 7.5-5 7.5-9.6V5.8Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DropletIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 3s6 6.6 6 10.6A6 6 0 0 1 6 13.6C6 9.6 12 3 12 3Z" strokeLinejoin="round" />
    </svg>
  );
}
