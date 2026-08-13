"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { signInAction } from "@/server/actions/auth.actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

/**
 * Sign-in form.
 *
 * The AUTHENTICATION PATH IS UNCHANGED: the same `signInAction`, the same
 * `useActionState`, the same validation, the same session. Everything added here
 * is presentation or client-side convenience.
 *
 * On success it does a full `router.refresh()` before navigating so the new
 * session cookie is picked up by every server component — pushing straight to
 * the destination can otherwise render one frame of the signed-out state.
 *
 * `returnTo` is the page the user was trying to reach when middleware sent them
 * here, already checked as a safe same-origin path by `safeCallbackPath`.
 */

/** Where the remembered address is kept. Never the password. */
const REMEMBERED_EMAIL_KEY = "cg-remembered-email";

export function LoginForm({ returnTo }: { returnTo?: string | null }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(signInAction, null);

  const emailId = useId();
  const passwordId = useId();

  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [remember, setRemember] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Restore the remembered address on mount. Read in an effect rather than
  // during render so the server and client markup match.
  useEffect(() => {
    const saved = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (saved) {
      setEmail(saved);
      setRemember(true);
    }
  }, []);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      router.replace(returnTo ?? "/");
    }
  }, [state, router, returnTo]);

  function persistEmail() {
    // Runs on submit. Only ever the address — storing anything resembling a
    // credential in localStorage would put it within reach of any script on the
    // page, which is exactly what the httpOnly session cookie avoids.
    if (remember && email.trim()) {
      window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
    } else {
      window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }
  }

  return (
    <form action={formAction} onSubmit={persistEmail} className="space-y-4">
      {state && !state.ok ? <Alert tone="error">{state.message}</Alert> : null}

      {/* --- Email ---------------------------------------------------- */}
      <div className="space-y-1.5">
        <label htmlFor={emailId} className="block text-sm font-medium text-strong">
          Email
        </label>
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          >
            <MailIcon />
          </span>
          <input
            id={emailId}
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            placeholder="you@cgcarwash.local"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isPending}
            className="h-13 w-full rounded-lg border border-[var(--line-strong)] pl-11 pr-3 text-base text-[var(--text-strong)] placeholder:text-[var(--text-muted)] transition-colors disabled:opacity-70"
          />
        </div>
      </div>

      {/* --- Password ------------------------------------------------- */}
      <div className="space-y-1.5">
        <label htmlFor={passwordId} className="block text-sm font-medium text-strong">
          Password
        </label>
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          >
            <LockIcon />
          </span>
          <input
            id={passwordId}
            name="password"
            // Toggling the type is what reveals the value; the field is still a
            // password field to the browser's autofill and to the form post.
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="Enter your password"
            disabled={isPending}
            className="h-13 w-full rounded-lg border border-[var(--line-strong)] pl-11 pr-12 text-base text-[var(--text-strong)] placeholder:text-[var(--text-muted)] transition-colors disabled:opacity-70"
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            // Announced state, not just an icon swap.
            aria-pressed={showPassword}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)]"
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </div>

      {/* --- Remember / help ------------------------------------------ */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-body)]">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            // `accent-color` alone leaves the UNCHECKED box as the platform
            // default, which is a pale grey square that looks broken on navy.
            className="size-4 appearance-none rounded border border-[var(--line-strong)] bg-[rgb(3_10_26/0.55)] transition-colors checked:border-[var(--brand-strong)] checked:bg-[var(--brand)] checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22 fill=%22none%22 stroke=%22white%22 stroke-width=%223%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22M3 8.5l3.5 3.5L13 5%22/></svg>')] checked:bg-center checked:bg-no-repeat"
          />
          Remember me
        </label>

        <button
          type="button"
          onClick={() => setShowHelp((open) => !open)}
          aria-expanded={showHelp}
          className="text-sm font-medium text-[var(--brand-strong)] underline-offset-4 hover:underline"
        >
          Forgot password?
        </button>
      </div>

      {showHelp ? (
        <p className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-body)]">
          Staff passwords are reset by the owner or an administrator from{" "}
          <strong className="font-semibold text-strong">Staff</strong> in the app. Ask them to
          issue you a new one — there is no self-service reset, so nobody can take over an account
          from this screen.
        </p>
      ) : null}

      {/* `isLoading` disables the button, so a double-tap cannot submit twice. */}
      <Button type="submit" size="lg" fullWidth isLoading={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

/* --- Icons -----------------------------------------------------------------
   Inline 1.5px strokes rather than an icon package: four glyphs do not justify
   a dependency on the one route that must become interactive fastest.        */

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <path d="M3 7l9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9.9 5.7A9.9 9.9 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a17 17 0 0 1-3.3 4M6.2 7.9A17 17 0 0 0 2 12s3.6 6.5 10 6.5a9.6 9.6 0 0 0 4-.85" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 3l18 18" strokeLinecap="round" />
    </svg>
  );
}
