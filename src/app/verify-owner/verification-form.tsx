"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  cancelOwnerRegistrationAction,
  resendOwnerCodeAction,
  verifyOwnerCodeAction,
} from "@/server/actions/owner.actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

/**
 * 6-digit code entry.
 *
 * The countdown is display only — expiry and every rate limit are decided
 * server-side from stored timestamps, so a user who edits the clock, the DOM,
 * or the React state gains nothing.
 */
export function VerificationForm({
  maskedEmail,
  expiresAt,
  resendAvailableAt,
  attemptsRemaining,
  resendsRemaining,
  lockedUntil,
}: {
  maskedEmail: string;
  expiresAt: string;
  resendAvailableAt: string;
  attemptsRemaining: number;
  resendsRemaining: number;
  lockedUntil: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "warning"; text: string } | null>(null);
  const [expiry, setExpiry] = useState(() => new Date(expiresAt).getTime());
  const [resendAt, setResendAt] = useState(() => new Date(resendAvailableAt).getTime());
  const [remainingResends, setRemainingResends] = useState(resendsRemaining);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  // One shared ticker rather than one per countdown.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const secondsLeft = Math.max(0, Math.floor((expiry - now) / 1000));
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const lockedFor = lockedUntil
    ? Math.max(0, Math.ceil((new Date(lockedUntil).getTime() - now) / 1000))
    : 0;

  const isExpired = secondsLeft === 0;
  const isLocked = lockedFor > 0;

  const submit = useCallback(
    (submitted: string) => {
      if (isPending || submitted.length !== 6) return;
      setError(null);
      setNotice(null);

      startTransition(async () => {
        const result = await verifyOwnerCodeAction({ code: submitted });

        if (!result.ok) {
          setError(result.message);
          setCode("");
          inputRef.current?.focus();
          return;
        }

        // Account is live. A full refresh so the login page re-reads owner state
        // and drops the registration link.
        router.refresh();
        router.replace("/login?verified=1");
      });
    },
    [isPending, router],
  );

  function onCodeChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    // Auto-submit on the sixth digit — one less tap on a phone.
    if (digits.length === 6) submit(digits);
  }

  function resend() {
    if (isPending || resendIn > 0 || remainingResends <= 0) return;
    setError(null);
    setNotice(null);

    startTransition(async () => {
      const result = await resendOwnerCodeAction();

      // The send failed. The server did not touch the stored code, the resend
      // count or the cooldown, so this branch must not move the countdowns
      // either — the code already in the user's inbox still works.
      if (!result.ok) {
        setError(result.message);
        return;
      }

      setExpiry(new Date(result.data.expiresAt).getTime());
      setResendAt(new Date(result.data.resendAvailableAt).getTime());
      setRemainingResends(result.data.resendsRemaining);
      setCode("");
      setNotice(
        result.data.delivery === "sent"
          ? { tone: "success", text: "Code sent successfully. Check your Gmail inbox." }
          : {
              // Dev console transport: no email exists, so we do not claim one.
              tone: "warning",
              text: "A new code was written to the server log (MAIL_TRANSPORT=console). No email was sent.",
            },
      );
      inputRef.current?.focus();
    });
  }

  function cancel() {
    startTransition(async () => {
      await cancelOwnerRegistrationAction();
      router.refresh();
      router.replace("/login");
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-center text-sm text-muted">
        Enter the 6-digit code sent to{" "}
        <span className="font-semibold text-strong">{maskedEmail}</span>
      </p>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice && !error ? (
        // An explicit title: the default success prefix is "Saved", which says
        // nothing about whether an email actually went out.
        <Alert
          tone={notice.tone}
          title={notice.tone === "success" ? "Code sent" : "Not emailed"}
        >
          {notice.text}
        </Alert>
      ) : null}
      {isExpired && !error ? (
        <Alert tone="warning">
          This verification code has expired. Please request a new code.
        </Alert>
      ) : null}

      <div>
        <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-strong">
          Security code
        </label>
        <input
          ref={inputRef}
          id="code"
          name="code"
          value={code}
          onChange={(event) => onCodeChange(event.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          // Lets iOS/Android autofill the code straight from the notification.
          pattern="\d{6}"
          maxLength={6}
          autoFocus
          disabled={isPending || isLocked}
          aria-describedby="code-help"
          className="tabular h-16 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface-card)] text-center text-3xl font-bold tracking-[0.4em] text-[var(--text-strong)] disabled:opacity-60"
          placeholder="——————"
        />
        <p id="code-help" className="mt-1.5 text-center text-xs text-muted">
          {isLocked
            ? `Locked for ${formatDuration(lockedFor)} after too many incorrect codes.`
            : isExpired
              ? "Code expired — request a new one below."
              : `Expires in ${formatDuration(secondsLeft)} · ${attemptsRemaining} attempt${
                  attemptsRemaining === 1 ? "" : "s"
                } remaining`}
        </p>
      </div>

      <Button
        size="lg"
        fullWidth
        onClick={() => submit(code)}
        isLoading={isPending}
        disabled={code.length !== 6 || isExpired || isLocked}
      >
        Verify
      </Button>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          fullWidth
          onClick={resend}
          disabled={isPending || resendIn > 0 || remainingResends <= 0}
        >
          {remainingResends <= 0
            ? "No resends left"
            : resendIn > 0
              ? `Resend in ${resendIn}s`
              : "Resend code"}
        </Button>
        <Button variant="ghost" fullWidth onClick={cancel} disabled={isPending}>
          Cancel
        </Button>
      </div>

      <p className="text-center text-xs text-muted">
        Check your spam folder if it hasn&apos;t arrived. {remainingResends} resend
        {remainingResends === 1 ? "" : "s"} remaining.
      </p>
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
