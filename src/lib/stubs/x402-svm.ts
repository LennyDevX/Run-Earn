/// Stub for `@x402/svm/exact/client`.
///
/// Nothing here is reachable in Airen. The only importer is Coinbase's
/// `@coinbase/cdp-sdk`, reached through thirdweb's Base Account wallet, and this
/// app is Polygon-only with MetaMask, OKX and an in-app wallet. The import is an
/// **undeclared** dependency of the CDP SDK — `@base-org/account` lists no x402
/// package at all — so Turbopack cannot resolve it and the whole build fails
/// with "Module not found".
///
/// Aliased in `next.config.ts` rather than installing `@x402/svm`, which would
/// pull six Solana packages and roughly twenty-five extra audit findings to
/// satisfy a module that never executes.
///
/// The exports throw rather than resolve silently: if a future thirdweb or CDP
/// release ever routes real traffic here, the failure is immediate and names
/// itself instead of surfacing as an undefined function somewhere downstream.
export class SvmScheme {
  constructor() {
    throw new Error("@x402/svm is not bundled in Airen.");
  }
}

export function registerExactSvmScheme(): never {
  throw new Error("@x402/svm is not bundled in Airen.");
}
