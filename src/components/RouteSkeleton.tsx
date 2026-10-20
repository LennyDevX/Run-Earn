import type { ReactNode } from "react";

/// ───────────────────────────── Route skeletons ─────────────────────────────
///
/// Shaped like the content they stand in for, not spinners. A spinner says
/// "something is happening"; a skeleton says "this is what you are about to get",
/// and the layout does not jump when the real content lands.
///
/// **No new animation.** The bars use `animate-pulse`, which the global
/// `prefers-reduced-motion: reduce` rule already collapses to a static block — so
/// there is nothing to opt out of here, unlike the timer-driven components.
///
/// Every variant is server-safe (no hooks, no "use client") so a `loading.tsx`
/// can render it without shipping JS.

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-full bg-foreground/10 ${className}`} />;
}

function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-foreground/8 ${className}`} />;
}

/// Page heading: pixel eyebrow, display title, supporting paragraph.
export function HeadingSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Bar className="h-2 w-24" />
      <Bar className="h-9 w-3/4 max-w-md" />
      <Bar className="h-3 w-full max-w-xl" />
      <Bar className="h-3 w-2/3 max-w-md" />
    </div>
  );
}

/// The four stat cards most dashboards open with.
export function StatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-3xl border border-foreground/10 bg-surface p-6">
          <Bar className="h-2 w-16" />
          <Bar className="h-6 w-24" />
          <Bar className="h-2 w-20" />
        </div>
      ))}
    </div>
  );
}

/// A panel with a title and a few rows — wallets, listings, activity.
export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-foreground/8 bg-surface p-6 sm:p-8">
      <Bar className="h-2 w-28" />
      <div className="flex flex-col divide-y divide-foreground/8">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center justify-between gap-4 py-3">
            <div className="flex min-w-0 flex-col gap-2">
              <Bar className="h-3 w-40" />
              <Bar className="h-2 w-24" />
            </div>
            <Bar className="h-3 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/// Card grid for `/collection`, `/my-nfts` and the marketplace.
export function CardGridSkeleton({ count = 6, columns = 3 }: { count?: number; columns?: 2 | 3 }) {
  return (
    <div className={`grid gap-4 sm:grid-cols-2 ${columns === 3 ? "lg:grid-cols-3" : ""}`}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-4 rounded-2xl border border-foreground/8 bg-surface p-4">
          <Block className="aspect-square w-full" />
          <Bar className="h-3 w-24" />
          <Bar className="h-2 w-16" />
          <div className="flex gap-2">
            <Block className="h-9 flex-1" />
            <Block className="h-9 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

/// Generic page shell so every route's loading state shares one rhythm.
export function RouteSkeleton({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-24 pt-28 sm:px-6 sm:pt-32">
      <HeadingSkeleton />
      {children}
    </div>
  );
}
