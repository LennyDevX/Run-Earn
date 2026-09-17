"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/// Bottom sheet used on mobile for navigation overflow and wallet dialogs.
///
/// Behaviour: portals to <body>, locks background scroll, closes on Escape or
/// backdrop tap, traps focus while open and restores it on close. The panel
/// respects the iOS home indicator through the safe-area padding.
export default function MoreSheet({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null,
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const { overflow, paddingRight } = document.body.style;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;

    // Focus the panel itself so screen readers announce the dialog.
    const frame = window.requestAnimationFrame(() => panelRef.current?.focus());

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      restoreFocusRef.current?.focus?.();
    };
  }, [handleKeyDown, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    // No `md:hidden` here: the sheet is also used for touch devices whose
    // viewport is wider than `md` (e.g. an iPad), where hiding it would make the
    // dialog invisible. Callers decide when to open it.
    <div className="fixed inset-0 z-[60]">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="animate-backdrop-in absolute inset-0 h-full w-full cursor-default bg-ink/60 backdrop-blur-sm"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="animate-modal-in absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-[2rem] border-t border-foreground/10 bg-surface pb-safe shadow-2xl shadow-ink/40 outline-none md:mx-auto md:max-w-lg"
      >
        <div className="flex items-center justify-center pt-3 pb-1">
          <span className="h-1 w-10 rounded-full bg-foreground/20" aria-hidden="true" />
        </div>

        <div className="flex items-start justify-between gap-4 px-6 pt-2 pb-4">
          <div>
            <h2 id={titleId} className="font-pixel text-[10px] tracking-wider text-mint">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-2 text-xs leading-relaxed text-foreground/55">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 flex size-11 shrink-0 items-center justify-center rounded-full text-xl text-foreground/40 transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
