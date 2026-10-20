"use client";

/// ───────────────────────────── Haptic feedback ─────────────────────────────
///
/// A tap that buzzes confirms itself without the visitor having to look. That is
/// the whole point on a phone, where the thumb covers the button it just pressed.
///
/// **`navigator.vibrate` is Android-only.** iOS Safari does not implement it and
/// there is no supported workaround short of a native wrapper, so this is a
/// progressive enhancement everywhere it is used — never the only confirmation of
/// anything. Every call site must still show its own visual feedback.
///
/// Patterns stay at or under 10ms for a tap: anything longer reads as a
/// notification rather than a press, and a phone buzzing on every nav tap gets
/// switched off in the OS settings within a day.

export type HapticPattern = "tap" | "confirm" | "warn";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  /// A press. Short enough to feel like the button, not the app.
  tap: 8,
  /// Something completed — a mint, a purchase. Two beats.
  confirm: [10, 36, 12],
  /// Something was refused. Distinct rhythm so it is not confused with success.
  warn: [14, 60, 14],
};

/// Fires a haptic pattern where the platform supports it, and does nothing where
/// it does not. Never throws.
export function haptic(pattern: HapticPattern = "tap"): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (typeof window === "undefined") return;
  // A visitor who asked for less motion is also telling us not to buzz them.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // Some browsers expose `vibrate` but reject it outside a user gesture.
  }
}
