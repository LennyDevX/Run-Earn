"use client";

import { useEffect, useState } from "react";

/// ─────────────────────────── Install prompt ────────────────────────────────
///
/// Moves a returning visitor from a browser tab into standalone mode, where the
/// app has no URL bar, no tab strip, and the safe-area insets the layout was
/// built for.
///
/// **Only after the second visit.** Asking on the first screen is the fastest way
/// to get dismissed forever: the visitor has not seen enough to want an icon yet.
///
/// **A dismissal is remembered.** Re-prompting someone who already said no is how
/// an app teaches people to ignore it.
///
/// **iOS is not covered.** Safari has no `beforeinstallprompt`; installing there
/// is a manual Share → "Add to Home Screen". This component stays hidden rather
/// than showing instructions nobody asked for.
///
/// The event is captured in the root layout's scope because Chrome fires
/// `beforeinstallprompt` early — often before a route component mounts. A listener
/// registered inside a page can miss it entirely.

const DISMISS_KEY = "airen:install-dismissed";
const VISITS_KEY = "airen:visits";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/// Mounted once, in the root layout, so the event is never missed.
export default function InstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<PromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      // Chrome shows its own mini-infobar unless this is prevented.
      event.preventDefault();
      setPromptEvent(event as PromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  useEffect(() => {
    if (!promptEvent) return;

    let dismissed = false;
    let visits = 0;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
      visits = Number(localStorage.getItem(VISITS_KEY) ?? "0") + 1;
      localStorage.setItem(VISITS_KEY, String(visits));
    } catch {
      // Storage blocked: treat it as already dismissed rather than nagging.
      dismissed = true;
    }
    if (dismissed || visits < 2) return;

    // Let the page settle before sliding a banner in over it.
    const frame = window.setTimeout(() => setVisible(true), 2500);
    return () => window.clearTimeout(frame);
  }, [promptEvent]);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Nothing to do; the banner is already hidden for this session.
    }
  }

  async function install() {
    if (!promptEvent) return;
    setVisible(false);
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
    } catch {
      // The prompt can reject if it was already shown. Nothing to recover.
    }
    // Whatever the outcome, do not ask again — an accepted install has nothing
    // left to prompt, and a declined one is a decision.
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Ignored.
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(var(--mobile-nav-height)+var(--safe-bottom)+0.75rem)] z-40 md:hidden">
      <div className="animate-modal-in flex items-center gap-3 rounded-2xl border border-brand/25 bg-surface/95 p-3 shadow-xl shadow-ink/20 backdrop-blur-xl">
        <span aria-hidden className="text-lg">
          👟
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold leading-tight">Install Airen</p>
          <p className="text-[11px] leading-tight text-foreground/50">Full screen, no browser chrome.</p>
        </div>
        <button
          type="button"
          onClick={() => void install()}
          className="min-h-9 shrink-0 cursor-pointer rounded-full bg-mint px-3 text-[11px] font-bold text-ink transition-transform active:scale-95"
        >
          Install
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="-mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-foreground/40 transition-colors hover:bg-foreground/5"
        >
          ×
        </button>
      </div>
    </div>
  );
}
