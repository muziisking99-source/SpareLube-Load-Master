import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function StickyStepBar({
  status,
  primaryLabel,
  primaryIcon: PrimaryIcon,
  onPrimary,
  primaryDisabled,
  secondaryLabel,
  secondaryIcon: SecondaryIcon,
  onSecondary,
  className,
}: {
  status?: string;
  primaryLabel: string;
  primaryIcon?: LucideIcon;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  secondaryIcon?: LucideIcon;
  onSecondary?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-20 -mx-3 glass-chrome px-3 py-3 no-print sm:-mx-0 sm:rounded-xl sm:px-4 lg:static lg:mx-0 lg:mt-4",
        "mb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:mb-0",
        className,
      )}
    >
      {status && (
        <p className="mb-2 text-xs text-muted-foreground sm:text-sm">{status}</p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {secondaryLabel && onSecondary && (
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={onSecondary}
          >
            {SecondaryIcon && <SecondaryIcon className="size-4" />}
            {secondaryLabel}
          </Button>
        )}
        <Button
          type="button"
          className="w-full sm:ml-auto sm:w-auto"
          size="lg"
          disabled={primaryDisabled}
          onClick={onPrimary}
        >
          {primaryLabel}
          {PrimaryIcon && <PrimaryIcon className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
