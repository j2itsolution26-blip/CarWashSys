"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * "Install CG Car Wash App".
 *
 * The whole point of this feature: staff tap an icon instead of typing a URL.
 *
 * Three states, because browsers differ and a wrong instruction is worse than
 * none:
 *
 *   installed  — render nothing at all. Never nag someone who already did it.
 *   promptable — Chrome/Edge/Android fired `beforeinstallprompt`; show the
 *                button and hand off to the real OS dialog on click.
 *   manual     — iOS/Safari and Firefox never fire that event. Show the actual
 *                gesture for THAT browser, and only when it applies.
 */

/** Not in TypeScript's DOM lib — Chromium-only, hence the local declaration. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Mode = "hidden" | "promptable" | "ios" | "manual";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari predates the display-mode media query.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallAppButton({ className }: { className?: string }) {
  const [mode, setMode] = useState<Mode>("hidden");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    // Already installed and launched from the icon — nothing to offer.
    if (isStandalone()) {
      setMode("hidden");
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      // Suppress the browser's own mini-infobar so the in-app button is the
      // single, predictable entry point.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setMode("promptable");
    };

    const onInstalled = () => {
      setMode("hidden");
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // iOS can install, but only through the Share sheet — there is no event to
    // wait for, so this is decided up front.
    if (isIos()) setMode("ios");

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // The event is single-use: a dismissed prompt cannot be replayed, so the
    // button is retired until the browser offers another one.
    setDeferred(null);
    setMode(outcome === "accepted" ? "hidden" : "manual");
  }, [deferred]);

  if (mode === "hidden") return null;

  if (mode === "promptable") {
    return (
      <div className={className}>
        <Button variant="secondary" fullWidth onClick={install}>
          📲 Install CG Car Wash App
        </Button>
        <p className="mt-1.5 text-center text-xs text-muted">
          Adds an icon so you don&apos;t have to type the address.
        </p>
      </div>
    );
  }

  // iOS, Firefox, or a prompt the user dismissed: no API to call, so explain
  // the gesture rather than showing a button that would do nothing.
  return (
    <div className={className}>
      <Button variant="ghost" fullWidth onClick={() => setShowHelp((open) => !open)}>
        📲 Install CG Car Wash App
      </Button>
      {showHelp ? (
        <p className="mt-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-body">
          {mode === "ios"
            ? "Tap the Share button, then choose “Add to Home Screen”."
            : "Open your browser menu and choose “Install app” or “Add to Home Screen”."}
        </p>
      ) : null}
    </div>
  );
}
