import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: string | number;
  tone?: "good" | "warn" | "crit" | "muted";
  className?: string;
}) {
  const color =
    tone === "good"
      ? "text-good"
      : tone === "warn"
        ? "text-warn"
        : tone === "crit"
          ? "text-crit"
          : tone === "muted"
            ? "text-muted-foreground"
            : "";

  return (
    <div
      className={cn(
        "glass-panel relative overflow-hidden p-4",
        !tone &&
          "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-foreground/15 before:to-transparent",
        className,
      )}
    >
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1.5 text-2xl font-semibold metric-mono tracking-tight", color)}>
        {value}
      </div>
    </div>
  );
}
