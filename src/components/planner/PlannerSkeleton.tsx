import { Skeleton } from "@/components/ui/skeleton";

export function PlannerSkeleton() {
  return (
    <div className="min-h-[100dvh]">
      <div className="glass-chrome border-b border-border/50 px-3 py-2 sm:px-4">
        <div className="mx-auto flex h-12 w-full max-w-[1600px] items-center gap-2 sm:gap-3">
          <Skeleton className="h-8 w-24 rounded-lg bg-muted/60" />
          <Skeleton className="ml-auto h-8 w-full max-w-md flex-1 bg-muted/40" />
          <Skeleton className="h-8 w-8 rounded-lg bg-muted/60" />
        </div>
      </div>
      <div className="glass-chrome border-b border-border/50 px-3 py-1.5 sm:px-4">
        <div className="mx-auto flex w-full max-w-[1600px] gap-2 overflow-hidden sm:gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 shrink-0 rounded-lg bg-muted/50 sm:w-24" />
          ))}
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-[1600px] items-start gap-4 px-3 py-4 pb-24 sm:px-4 lg:pb-4">
        <div className="min-w-0 flex-1 space-y-4">
          <Skeleton className="h-48 w-full rounded-[1.25rem] bg-muted/40" />
          <Skeleton className="h-64 w-full rounded-[1.25rem] bg-muted/40" />
        </div>
        <Skeleton className="hidden h-80 w-52 shrink-0 rounded-[1.25rem] bg-muted/40 lg:block" />
      </div>
    </div>
  );
}
