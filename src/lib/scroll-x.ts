/// Smoothly scrolls a tapped chip/card to the horizontal center of its nearest
/// `.scroll-x` row, so the selection and its neighbors stay visible on narrow
/// screens. `block: "nearest"` avoids vertical page jumps.
export function centerInScrollRow(target: HTMLElement) {
  target.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
}
