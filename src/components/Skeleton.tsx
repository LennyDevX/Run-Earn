import type { CSSProperties } from "react";

/// ─────────────────────────── Skeletons ─────────────────────────────────────
///
/// Loading placeholders shaped like the content they replace. A text label
/// ("Loading your collection…") collapses to one line and then snaps to a grid of
/// cards, which is a layout shift on every load. A skeleton with the right shape
/// reserves the space up front, so the swap is a fade rather than a jump.
///
/// The shimmer animates `transform` only, so it runs on the compositor and never
/// triggers layout — the whole point of replacing the spinners.
///
/// Every skeleton is `aria-hidden`; the container should carry the live region.

export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return <span aria-hidden className={`skeleton block ${className}`} style={style} />;
}

/// A line of text. `width` is a percentage so callers can vary the ragged edge.
export function SkeletonText({ width = "100%", className = "" }: { width?: string; className?: string }) {
  return <Skeleton className={`h-3 rounded-full ${className}`} style={{ width }} />;
}

/// A circular token, for avatars and icon buttons.
export function SkeletonCircle({ size = "2.5rem", className = "" }: { size?: string; className?: string }) {
  return <Skeleton className={`rounded-full ${className}`} style={{ width: size, height: size }} />;
}

/// A card with an artwork square on top — the shape of `HoloSneakerCard` and
/// `ModItemCard`.
export function SkeletonArtworkCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="holo-card">
      <div className="flex h-full flex-col gap-4 rounded-2xl bg-surface p-4">
        <Skeleton className="aspect-square w-full rounded-xl" />
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <SkeletonText width="55%" />
            <SkeletonText width="18%" />
          </div>
          {Array.from({ length: lines }, (_, index) => (
            <SkeletonText key={index} width={index === lines - 1 ? "62%" : "100%"} />
          ))}
        </div>
      </div>
    </div>
  );
}

/// A grid of artwork cards, sized to match the real collections.
export function SkeletonCardGrid({ count = 3, columns = "sm:grid-cols-2 lg:grid-cols-3" }: { count?: number; columns?: string }) {
  return (
    <div className={`grid gap-5 ${columns}`}>
      {Array.from({ length: count }, (_, index) => (
        <SkeletonArtworkCard key={index} />
      ))}
    </div>
  );
}

/// A stack of label/value rows, for stat panels and level ladders.
export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center justify-between gap-4 rounded-xl border border-foreground/8 px-4 py-3">
          <SkeletonText width="42%" />
          <SkeletonText width="16%" />
        </div>
      ))}
    </div>
  );
}
