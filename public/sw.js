/* eslint-disable no-undef */
/**
 * CG Car Wash — service worker.
 *
 * DELIBERATELY MINIMAL. This is a point-of-sale system handling money, so the
 * worker is written deny-by-default: it caches a small, explicit allow-list of
 * immutable static assets and passes EVERYTHING else straight to the network,
 * untouched and unstored.
 *
 * WHAT IS CACHED
 *   * /_next/static/**  — content-hashed JS/CSS. A new build produces new URLs,
 *                         so these can never go stale.
 *   * /icons/**         — the launcher artwork.
 *
 * WHAT IS NEVER CACHED, AND WHY
 *   * HTML documents      — every page is per-user and permission-filtered.
 *                           Serving a cached page could show one cashier the
 *                           screen rendered for another, or show a signed-out
 *                           device the last signed-in view.
 *   * /api/**            — includes /api/auth. Caching auth responses would
 *                           mean caching session state.
 *   * Server Actions     — POST requests carrying transactions and payments.
 *   * Anything non-GET   — never cacheable by definition here.
 *
 * There is NO offline fallback for pages and NO background sync of
 * transactions. That is a correctness decision, not an omission: a wash sale
 * needs a server-assigned transaction number, live prices and a real payment
 * record. Queueing one locally would risk duplicate or mispriced sales, and
 * showing "Payment successful" for a sale the server never saw is the single
 * worst failure this system could have. When the network is down the app says
 * so (see connection-status.tsx) and refuses to pretend.
 */

const VERSION = "v1";
const STATIC_CACHE = `cg-static-${VERSION}`;

/** Only these prefixes may ever be written to the cache. */
const CACHEABLE_PREFIXES = ["/_next/static/", "/icons/"];

self.addEventListener("install", (event) => {
  // No precache list: the hashed asset names are not known here, and guessing
  // them would just serve stale files. Assets populate lazily on first use.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from previous versions of this worker.
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith("cg-static-") && name !== STATIC_CACHE).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/**
 * The page asks for the update to be applied. Triggered only by an explicit
 * click on "Update now" — never automatically, so a checkout in progress is
 * never interrupted by a reload.
 */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isCacheable(url) {
  return url.origin === self.location.origin && CACHEABLE_PREFIXES.some((p) => url.pathname.startsWith(p));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Non-GET (server actions, sign-in, payments) is passed through untouched.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Everything not on the allow-list — HTML, /api, cross-origin — is left to
  // the browser's default handling. Not intercepted, not stored.
  if (!isCacheable(url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      // Only store complete, successful, same-origin responses. An opaque or
      // partial response cached here would be served back indefinitely.
      if (response.ok && response.status === 200 && response.type === "basic") {
        cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
