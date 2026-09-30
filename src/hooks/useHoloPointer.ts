"use client";

import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";

/// Drives the pointer glare on `.holo-card` elements: writes the cursor
/// position into the `--holo-x` / `--holo-y` custom properties so the highlight
/// follows where the user is pointing, the way a real foil card shifts as you
/// tilt it. Writing to the DOM directly keeps this off the React render path.
///
/// Skipped for touch pointers (there is no hover) and when the OS asks for
/// reduced motion, where the ambient drift is also disabled by CSS.
export function useHoloPointer<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  const onPointerMove = useCallback((event: ReactPointerEvent<T>) => {
    if (event.pointerType === "touch") return;
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    node.style.setProperty("--holo-x", `${x.toFixed(1)}%`);
    node.style.setProperty("--holo-y", `${y.toFixed(1)}%`);
  }, []);

  const onPointerLeave = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    node.style.setProperty("--holo-x", "50%");
    node.style.setProperty("--holo-y", "50%");
  }, []);

  return { ref, onPointerMove, onPointerLeave };
}
