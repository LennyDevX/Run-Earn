import type { NextConfig } from "next";

/// ─────────────────────────── Security headers ──────────────────────────────
///
/// Airen handles wallet signatures, so the browser-side surface matters as much
/// as the contracts. Everything below is defense-in-depth: none of it replaces
/// contract-level authorization, and none of it can be bypassed by the app.
///
/// ### CSP is ENFORCED
///
/// The policy ships as `Content-Security-Policy` and blocks violations.
///
/// It started as `Content-Security-Policy-Report-Only` so the wallet flows could
/// be observed without risk. It is now live, which means **an origin missing from
/// `buildCsp()` will break silently in the browser** — usually as a wallet that
/// refuses to connect with no error in the app.
///
/// If something breaks after a change here, the fastest recovery is to rename
/// the header back to `Content-Security-Policy-Report-Only`, which restores the
/// previous behaviour without a revert.

const isDev = process.env.NODE_ENV === "development";

/// Extra origins the wallet SDKs talk to. Kept as a named list so tightening the
/// policy later is a one-line edit rather than an archaeology dig.
const WALLET_ORIGINS = [
  "https://*.walletconnect.com",
  "wss://relay.walletconnect.com",
  "https://*.metamask.io",
  "https://*.okx.com",
  "https://*.okxconnect.io",
  // WalletConnect's verify API. Harmless to allow and a common silent breakage.
  "https://verify.walletconnect.com",
  "https://verify.walletconnect.org",
];

/// Public RPC endpoints the app falls back to when the configured one is
/// unreachable (see `Providers.tsx`). A CSP that omits these would block the
/// fallback exactly when it is needed most.
const RPC_ORIGINS = [
  "https://polygon.drpc.org",
  "https://polygon-amoy.drpc.org",
  "https://polygon.api.onfinality.io",
  "https://polygon-amoy.api.onfinality.io",
];

function configuredRpcOrigins(): string[] {
  const configured = [
    process.env.NEXT_PUBLIC_POLYGON_RPC_URL,
    process.env.POLYGON_RPC_URL,
  ].filter((value): value is string => Boolean(value));
  return configured.flatMap((value) => {
    try {
      return [new URL(value).origin];
    } catch {
      return [];
    }
  });
}

function buildCsp() {
  // Deduped: the configured RPC is often the same origin as a fallback.
  const connect = [
    ...new Set([
      "'self'",
      ...RPC_ORIGINS,
      ...configuredRpcOrigins(),
      ...WALLET_ORIGINS,
      // Uniswap price feed goes through our own route, but keep the origin
      // allowlisted so a future direct read does not silently fail.
      "https://trading-api-labs.interface.gateway.uniswap.org",
    ]),
  ];

  return [
    "default-src 'self'",
    // Next injects inline bootstrap/flight scripts. Without nonces (which need
    // middleware) 'unsafe-inline' is required.
    //
    // `'unsafe-eval'` is added **only in development** — the dev server's HMR
    // runtime evaluates code at runtime. Production does not need it, and this
    // is the single most valuable thing to keep out of a shipped policy.
    isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'",
    // Tailwind ships a stylesheet, but the app also sets inline style attributes
    // for gradients, progress widths, and per-piece accent colors.
    "style-src 'self' 'unsafe-inline'",
    // AI artwork arrives as data: URLs and uploaded photos as blob:.
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    `connect-src ${connect.join(" ")}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'self' https://*.walletconnect.com https://*.metamask.io https://*.okx.com",
    // Clickjacking: nothing may embed the app.
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const nextConfig: NextConfig = {
  /// Drop the `X-Powered-By: Next.js` fingerprint. Zero cost, one less hint.
  poweredByHeader: false,

  async headers() {
    const securityHeaders = [
      // The CSP itself is Report-Only, but the framing lock is enforced now —
      // nothing legitimate embeds Airen, so there is no migration risk.
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
      },
      // Wallet popups need to keep a handle on the opener; a strict COOP would
      // break the connect flows.
      { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      { key: "X-DNS-Prefetch-Control", value: "on" },
      { key: "Content-Security-Policy", value: buildCsp() },
    ];

    // HSTS on localhost would pin a dev origin to HTTPS. Only send it in prod.
    if (!isDev) {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }

    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        // API responses are never a document, so they get the strictest set.
        //
        // Note there is deliberately NO `Cache-Control` here. A blanket
        // `no-store` on `/api/*` silently overrides whatever a route handler
        // sets, which made it impossible for `/api/pol-price` to cache its
        // response. Each route now declares its own caching policy.
        source: "/api/(.*)",
        headers: [{ key: "X-Content-Type-Options", value: "nosniff" }],
      },
    ];
  },
};

export default nextConfig;
