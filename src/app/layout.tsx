import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/ui/feedback";
import { ServiceWorkerManager } from "@/components/pwa/service-worker-manager";
import "./globals.css";

const BUSINESS_NAME = process.env.NEXT_PUBLIC_BUSINESS_NAME ?? "CG Car Wash";

export const metadata: Metadata = {
  title: {
    default: `${BUSINESS_NAME} POS`,
    template: `%s · ${BUSINESS_NAME}`,
  },
  description: "Point of sale and transaction management for CG Car Wash.",
  robots: { index: false, follow: false },
  /*
   * Served as a static file from public/ rather than via the app/manifest.ts
   * metadata convention. That convention triggers a PageNotFoundError for
   * /_document during "Collecting page data" on Next 15.5.x, which fails the
   * production build outright. A static manifest is equivalent for every
   * browser and keeps the build green; see public/manifest.webmanifest.
   */
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    // iOS ignores the manifest entirely; these are its equivalent.
    capable: true,
    title: BUSINESS_NAME,
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The POS is used on tablets; allow zoom rather than locking it (a11y).
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1d22" },
  ],
};

/**
 * Applies the saved theme before first paint. Without this the app would flash
 * light-on-dark for a frame on every navigation, which is genuinely unpleasant
 * on a screen someone stares at all shift.
 */
const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('cg-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (stored === 'dark' || (stored !== 'light' && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <a
          href="#main-content"
          className="no-print sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[var(--brand)] focus:px-4 focus:py-2 focus:font-semibold focus:text-[var(--brand-contrast)]"
        >
          Skip to main content
        </a>
        <ToastProvider>{children}</ToastProvider>
        {/* Registers the worker in production and offers an opt-in update. */}
        <ServiceWorkerManager />
      </body>
    </html>
  );
}
