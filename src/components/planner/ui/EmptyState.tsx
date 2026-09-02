import { cn } from "@/lib/utils";

export function EmptyState({
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
    <div
      className={cn(
        "glass-panel flex flex-col items-start gap-2 border-dashed px-4 py-8",
        className,
      )}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="text-sm text-muted-foreground max-w-[40ch]">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
