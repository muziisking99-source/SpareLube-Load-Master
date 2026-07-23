import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type TownFilterMode = "all" | "unassigned" | string;

export function TownFilterBar({
  value,
  onChange,
  towns,
  counts,
  unassignedCount,
  showUnassigned = true,
  className,
}: {
  value: TownFilterMode;
  onChange: (next: TownFilterMode) => void;
  towns: string[];
  counts: Record<string, number>;
  unassignedCount?: number;
  showUnassigned?: boolean;
  className?: string;
}) {
  const withCustomers = towns.filter((t) => (counts[t] ?? 0) > 0);
  const emptyTowns = towns.filter((t) => (counts[t] ?? 0) === 0);
  const selectValue =
    value !== "all" && value !== "unassigned" ? value : "";

  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap items-center gap-2 border-b border-border pb-3",
        className,
      )}
    >
      <div className="flex items-center gap-1 rounded-lg border border-border bg-panel-2/50 p-0.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn(
            "h-8 px-3",
            value === "all" && "bg-background text-foreground shadow-sm",
          )}
          onClick={() => onChange("all")}
        >
          All
        </Button>
        {showUnassigned && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              "h-8 px-3",
              value === "unassigned" && "bg-background text-foreground shadow-sm",
            )}
            onClick={() => onChange("unassigned")}
          >
            Unassigned
            <span className="ml-1.5 metric-mono text-muted-foreground">
              {unassignedCount ?? 0}
            </span>
          </Button>
        )}
      </div>

      <label className="flex min-w-[12rem] flex-1 items-center gap-2 sm:max-w-xs">
        <span className="sr-only">Filter by town</span>
        <select
          className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm transition-colors hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={selectValue}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v || "all");
          }}
        >
          <option value="">Jump to town…</option>
          {withCustomers.length > 0 && (
            <optgroup label="With customers">
              {withCustomers.map((t) => (
                <option key={t} value={t}>
                  {t} ({counts[t] ?? 0})
                </option>
              ))}
            </optgroup>
          )}
          {emptyTowns.length > 0 && (
            <optgroup label="Empty">
              {emptyTowns.map((t) => (
                <option key={t} value={t}>
                  {t} (0)
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      {selectValue ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 text-muted-foreground"
          onClick={() => onChange("all")}
        >
          Clear
        </Button>
      ) : null}
    </div>
  );
}
