import { CardGridSkeleton, RouteSkeleton } from "@/components/RouteSkeleton";

export default function Loading() {
  return (
    <RouteSkeleton>
      <CardGridSkeleton />
    </RouteSkeleton>
  );
}
