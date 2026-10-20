import { PanelSkeleton, RouteSkeleton, StatRowSkeleton } from "@/components/RouteSkeleton";

export default function Loading() {
  return (
    <RouteSkeleton>
      <StatRowSkeleton />
      <PanelSkeleton />
      <PanelSkeleton rows={3} />
    </RouteSkeleton>
  );
}
