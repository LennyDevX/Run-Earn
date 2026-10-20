import { RouteSkeleton } from "@/components/RouteSkeleton";

/// The mint studio is a wizard, not a dashboard: a step bar, a large upload
/// well, and a form column. A stat-card skeleton would be the wrong shape and
/// would jump when the real content lands.
export default function Loading() {
  return (
    <RouteSkeleton>
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-2 flex-1 animate-pulse rounded-full bg-foreground/10" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="animate-pulse rounded-3xl border border-foreground/10 bg-surface p-6">
          <div className="aspect-square w-full rounded-2xl bg-foreground/8" />
          <div className="mt-5 h-11 w-full rounded-full bg-foreground/10" />
        </div>
        <div className="flex flex-col gap-4 rounded-3xl border border-foreground/10 bg-surface p-6">
          <div className="h-2 w-24 animate-pulse rounded-full bg-foreground/10" />
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex flex-col gap-2">
              <div className="h-2 w-16 animate-pulse rounded-full bg-foreground/10" />
              <div className="h-11 w-full animate-pulse rounded-2xl bg-foreground/8" />
            </div>
          ))}
        </div>
      </div>
    </RouteSkeleton>
  );
}
