import { PanelSkeleton, RouteSkeleton, StatRowSkeleton } from "@/components/RouteSkeleton";

/// Root loading state — the fallback for every route without its own.
///
/// This is the shape most of Airen shares: a heading, a row of stat cards and a
/// panel. Routes with a distinctly different layout override it.
export default function RootLoading() {
  return (
    <RouteSkeleton>
      <StatRowSkeleton />
      <PanelSkeleton />
    </RouteSkeleton>
  );
}
