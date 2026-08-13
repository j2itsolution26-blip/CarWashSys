"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startOwnerRegistrationAction } from "@/server/actions/owner.actions";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";

/**
 * Owner registration form.
 *
 * Client-side validation is a courtesy that gives instant feedback; the same
 * Zod schema runs server-side and is the actual gate. Nothing here is trusted.
 */
export function OwnerRegistrationForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const passwordsMatch = confirmPassword.length === 0 || password === confirmPassword;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    // The disabled button already prevents this, but a double-submit can land
    // between renders — and a second registration must never be started.
    if (isPending) return;

    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await startOwnerRegistrationAction({
        name,
        email,
        password,
        confirmPassword,
      });

      if (!result.ok) {
        setError(result.message);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      // The registration id is in an httpOnly cookie; nothing sensitive rides
      // in the URL.
      router.push("/verify-owner");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error ? <Alert tone="error">{error}</Alert> : null}

      <TextField
        label="Full name"
        name="name"
        autoComplete="name"
        required
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={fieldErrors.name}
        disabled={isPending}
      />

      <TextField
        label="Gmail address"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="owner@gmail.com"
        hint="Must be a Gmail address — the security code is sent here."
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={fieldErrors.email}
        disabled={isPending}
      />

      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 10 characters with upper case, lower case and a number."
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldErrors.password}
        disabled={isPending}
      />

      <TextField
        label="Confirm password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        error={fieldErrors.confirmPassword ?? (passwordsMatch ? undefined : "Passwords do not match")}
        disabled={isPending}
      />

      <Button
        type="submit"
        size="lg"
        fullWidth
        isLoading={isPending}
        disabled={!name || !email || !password || password !== confirmPassword}
      >
        {isPending ? "Sending security code…" : "Create Owner Account"}
      </Button>

      <p className="text-center text-xs text-muted">
        We&apos;ll email a 6-digit code to confirm the address before the account is created.
      </p>
    </form>
  );
}
