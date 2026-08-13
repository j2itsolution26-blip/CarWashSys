"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

/**
 * Route-level error boundary.
 *
 * Renders a message a staff member can act on. The underlying error is logged
 * to the browser console for support, never printed on screen — a stack trace
 * on a counter monitor helps nobody and can leak internals.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] route error", error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-lg">
      <CardBody className="space-y-4 text-center">
        <p aria-hidden="true" className="text-4xl">
          ⚠
        </p>
        <div>
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="mt-1 text-sm text-muted">
            This screen could not be loaded. Try again — if it keeps happening, tell the owner and
            quote reference {error.digest ?? "n/a"}.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" fullWidth onClick={() => window.location.reload()}>
            Reload page
          </Button>
          <Button fullWidth onClick={reset}>
            Try again
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
