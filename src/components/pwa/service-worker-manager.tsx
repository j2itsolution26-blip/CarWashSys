"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Registers the service worker and offers a CONTROLLED update.
 *
 * The worker calls `skipWaiting()` only when the user clicks "Update now". A new
 * deployment therefore never reloads the page by itself — a cashier halfway
 * through taking payment keeps the app they started the sale in, and applies the
 * update when the counter is clear.
 *
 * Registration is skipped in development: an active worker serving cached chunks
 * across hot reloads produces confusing stale-bundle errors.
 */
export function ServiceWorkerManager() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);
  // Guards against the reload loop where controllerchange fires more than once.
  const reloading = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | undefined;

    const onControllerChange = () => {
      if (reloading.current) return;
      reloading.current = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        registration = reg;

        // A worker already waiting from a previous visit.
        if (reg.waiting && navigator.serviceWorker.controller) {
          setWaiting(reg.waiting);
        }

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            // `controller` is null on the very first install — that is not an
            // update, so no prompt is shown for it.
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              setWaiting(installing);
              setDismissed(false);
            }
          });
        });
      })
      .catch(() => {
        // A failed registration must never break the app; it only means no
        // asset caching this session.
      });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      void registration;
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (!waiting) return;
    // The worker takes over, controllerchange fires, and the page reloads once.
    waiting.postMessage("SKIP_WAITING");
    setWaiting(null);
  }, [waiting]);

  if (!waiting || dismissed) return null;

  return (
    <div
      role="status"
      className="no-print fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 sm:bottom-4"
    >
      <div className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-card)] p-4 shadow-lg sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-strong">New version available</p>
          <p className="mt-0.5 text-xs text-muted">
            Finish what you&apos;re doing first — updating reloads the app.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" onClick={applyUpdate}>
            Update now
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            Later
          </Button>
        </div>
      </div>
    </div>
  );
}
