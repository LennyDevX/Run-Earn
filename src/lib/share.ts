"use client";

/// ──────────────────────────────── Web Share ────────────────────────────────
///
/// Sharing is the cheapest growth loop a game has: a collector who just minted
/// something wants to show it, and that is a link a friend can open.
///
/// **Two fallbacks, because `navigator.share` is not universal.** It needs HTTPS
/// and a user gesture, and desktop Firefox does not implement it. Order:
///
///   1. `navigator.share` — the native sheet, which is what people expect.
///   2. `navigator.clipboard` — copy the link and say so.
///   3. Nothing. The caller reports the outcome; this never throws.
///
/// The function resolves to what actually happened so the caller can word its
/// confirmation honestly — "shared" and "copied" are not the same thing.

export type ShareOutcome = "shared" | "copied" | "cancelled" | "unsupported";

export type SharePayload = {
  title: string;
  text?: string;
  url: string;
};

export async function shareLink({ title, text, url }: SharePayload): Promise<ShareOutcome> {
  if (typeof navigator === "undefined") return "unsupported";

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, ...(text ? { text } : {}), url });
      return "shared";
    } catch (cause) {
      // The user dismissing the sheet rejects with AbortError. That is not a
      // failure and must not be reported as one.
      if (cause instanceof Error && cause.name === "AbortError") return "cancelled";
      // Anything else falls through to the clipboard.
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "unsupported";
  }
}
