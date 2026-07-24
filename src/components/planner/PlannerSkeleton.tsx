import { Skeleton } from "@/components/ui/skeleton";

export function PlannerSkeleton() {
  return (
    <div className="min-h-[100dvh]">
      <div className="border-b border-border px-3 py-3 sm:px-4">
        <div className="mx-auto flex max-w-7xl items-center gap-2 sm:gap-4">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="hidden h-3 w-36 sm:block" />
          </div>
          <Skeleton className="ml-auto h-9 w-full max-w-md flex-1 sm:h-8" />
        </div>
      </div>
      <div className="border-b border-border px-3 py-3 sm:px-4">
        <div className="mx-auto flex max-w-7xl gap-2 overflow-hidden sm:gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-20 shrink-0 rounded-lg sm:w-28" />
          ))}
        </div>
      </div>
      <main className="mx-auto grid max-w-7xl gap-4 px-3 py-4 pb-24 sm:px-4 lg:grid-cols-[1fr_320px] lg:pb-4">
        <div className="min-w-0 space-y-4">
          <Skeleton className="h-48 w-full rounded-[1.25rem]" />
          <Skeleton className="h-64 w-full rounded-[1.25rem]" />
        </div>
        <Skeleton className="hidden h-80 w-full rounded-[1.25rem] lg:block" />
      </main>
    </div>
  );
}
