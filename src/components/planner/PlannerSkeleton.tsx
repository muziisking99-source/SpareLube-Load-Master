import { Skeleton } from "@/components/ui/skeleton";

export function PlannerSkeleton() {
  return (
    <div className="min-h-[100dvh]">
      <div className="border-b border-border px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center gap-4">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-36" />
          </div>
          <Skeleton className="ml-auto h-8 w-64 max-w-md flex-1" />
        </div>
      </div>
      <div className="border-b border-border px-4 py-3">
        <div className="mx-auto flex max-w-7xl gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-lg" />
          ))}
        </div>
      </div>
      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-[1.25rem]" />
          <Skeleton className="h-64 w-full rounded-[1.25rem]" />
        </div>
        <Skeleton className="h-80 w-full rounded-[1.25rem]" />
      </main>
    </div>
  );
}
