"use client";

import { useEffect, useState } from "react";

/**
 * Connection banner.
 *
 * The POS cannot complete a sale without the server: transaction numbers, live
 * prices and payment records are all issued there. So when the network drops the
 * honest thing to do is say so plainly and let the cashier stop, rather than
 * accept taps that will fail on submit.
 *
 * This is a WARNING, not a blocker. It deliberately does not disable the UI —
 * `navigator.onLine` reports the network interface, not whether our server is
 * actually reachable, and false positives are common on cafe/venue Wi-Fi. The
 * real guarantee is server-side: no transaction exists until the server records
 * it, and the payment panel only reports success on a confirmed response.
 */
export function ConnectionStatus() {
  // Starts optimistic: assuming offline before the browser reports would flash
  // the banner on every cold load.
  const [online, setOnline] = useState(true);
  const [everOffline, setEverOffline] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);

    const goOnline = () => setOnline(true);
    const goOffline = () => {
      setOnline(false);
      setEverOffline(true);
    };

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online) {
    // Brief confirmation once a previously-lost connection returns, so the
    // cashier knows it is safe to retry rather than guessing.
    if (!everOffline) return null;
    return (
      <div
        role="status"
        className="no-print bg-[var(--positive-soft)] px-4 py-2 text-center text-sm font-medium text-strong"
      >
        ✓ Connection restored — you can continue.
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="no-print bg-[var(--danger-soft)] px-4 py-2 text-center text-sm font-medium text-strong"
    >
      ⚠ Connection lost — transactions cannot be completed until it returns. Nothing you have
      already saved is affected.
    </div>
  );
}
