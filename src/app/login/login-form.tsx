"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signInAction } from "@/server/actions/auth.actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";

/**
 * Sign-in form.
 *
 * On success it does a full `router.refresh()` before navigating so the new
 * session cookie is picked up by every server component — pushing straight to
 * the destination can otherwise render one frame of the signed-out state.
 *
 * `returnTo` is the page the user was trying to reach when middleware sent them
 * here — a cashier who tapped the POS shortcut on a lapsed session goes back to
 * /pos, not to a generic landing page. It has already been checked as a safe
 * same-origin path by `safeCallbackPath`; when absent, "/" resolves the correct
 * screen for the role server-side.
 */
export function LoginForm({ returnTo }: { returnTo?: string | null }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(signInAction, null);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      router.replace(returnTo ?? "/");
    }
  }, [state, router, returnTo]);

  return (
    <Card>
      <CardBody>
        <form action={formAction} className="space-y-4">
          {state && !state.ok ? <Alert tone="error">{state.message}</Alert> : null}

          <TextField
            label="Email"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            placeholder="you@cgcarwash.local"
            inputSize="lg"
          />

          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            inputSize="lg"
          />

          <Button type="submit" size="lg" fullWidth isLoading={isPending}>
            {isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
