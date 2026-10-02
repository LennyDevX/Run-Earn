/// Smoothly scrolls a tapped chip/card to the horizontal center of its nearest
/// `.scroll-x` row, so the selection and its neighbors stay visible on narrow
/// screens.
///
/// ### Why not `scrollIntoView`
///
/// `scrollIntoView` walks **every** scrollable ancestor, the page included. Even
/// with `block: "nearest"` it will scroll the document when the target sits
/// below the fold — which is exactly what happened on `/mint`, where the wizard
/// calls this on mount before the hero has settled and the step row is still off
/// screen. The page jumped down a little on arrival.
///
/// Scrolling the row directly is strictly better: it can only ever move the row
/// horizontally, so no caller can move the page by accident.
export function centerInScrollRow(target: HTMLElement) {
  const row = target.closest(".scroll-x");
  if (!(row instanceof HTMLElement)) return;

  // `offsetLeft` is relative to the offset parent; for a flex row inside a
  // positioned container that is the row itself, which is what we want.
  const targetCenter = target.offsetLeft + target.offsetWidth / 2;
  const nextLeft = targetCenter - row.clientWidth / 2;
  const maxLeft = row.scrollWidth - row.clientWidth;

  row.scrollTo({
    left: Math.min(Math.max(0, nextLeft), Math.max(0, maxLeft)),
    behavior: "smooth",
  });
}
