"use client";

import { useEffect } from "react";
import Link from "next/link";

/// Shared error UI for the route boundaries.
///
/// Without a boundary a render throw unmounts the tree and the visitor gets a
/// blank page — indistinguishable from the site being down, with no DevTools on a
/// phone to explain it. The buttons matter more than the message: they are what
/// gets the person back to something that works.
///
/// **The error string is never rendered.** It can carry a contract address, an
/// API path, or a fragment of a request. The digest correlates with the server
/// log, and that is the only thing shown.
///
/// Boundaries are placed per group (`/game`, `/workshop`, `/profile`) so a failing
/// dashboard does not take the navigation with it.
export default function RouteError({
  error,
  reset,
  scope,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /// Where it broke, in the visitor's words: "the game", "the workshop".
  scope: string;
}) {
  useEffect(() => {
    console.error(`[airen] route error in ${scope}:`, error);
  }, [error, scope]);

  return (
    <div className="mx-auto flex min-h-[60dvh] w-full max-w-lg flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <span className="font-pixel text-[10px] tracking-widest text-magma">SIGNAL LOST</span>

      <h1 className="font-display text-3xl leading-tight sm:text-4xl">
        {scope} could not load<span className="text-magma">.</span>
      </h1>

      <p className="text-sm leading-relaxed text-foreground/60">
        Nothing was signed and your wallet is untouched. Trying again usually clears it, and the rest of the app still
        works.
      </p>

      {error.digest ? (
        <p className="rounded-xl bg-foreground/5 px-3 py-2 font-mono text-[10px] text-foreground/40">
          ref {error.digest}
        </p>
      ) : null}

      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={reset}
          className="min-h-11 cursor-pointer rounded-full bg-mint px-6 text-sm font-semibold text-ink transition-transform active:scale-95 hover:scale-105"
        >
          Try again
        </button>
        <Link
          href="/"
          className="flex min-h-11 items-center justify-center rounded-full border border-foreground/15 px-6 text-sm font-semibold transition-colors active:scale-95 hover:border-mint/50"
        >
          Back to home
        </Link>
      </div>

      {error.digest ? (
        <p className="text-[11px] leading-relaxed text-foreground/40">
          If it keeps happening, the reference above is what to send us.
        </p>
      ) : null}
    </div>
  );
}
