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
 */
export function LoginForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(signInAction, null);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      router.replace("/");
    }
  }, [state, router]);

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
