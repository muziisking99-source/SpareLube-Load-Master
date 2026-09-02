import { cn } from "@/lib/utils";

export function ScreenHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div>
        <h2 className="relative pb-2 text-lg font-semibold tracking-tight text-foreground after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:max-w-[12rem] after:bg-gradient-to-r after:from-transparent after:via-primary/50 after:to-transparent">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 max-w-[65ch] text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
