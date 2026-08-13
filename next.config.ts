import type { NextConfig } from "next";

/**
 * Production hardening for the POS.
 *
 * `poweredByHeader: false` and the security headers below are set here rather
 * than in middleware so they apply to static assets too, and so Vercel's edge
 * serves them without invoking a function.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Prisma must not be bundled into the server build; it loads native engines.
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  typedRoutes: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
