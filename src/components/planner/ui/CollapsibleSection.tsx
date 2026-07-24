import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/** Panel section with a clickable header that expands/collapses the body. */
export function CollapsibleSection({
  title,
  description,
  action,
  open,
  onOpenChange,
  defaultOpen = true,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel p-4 sm:p-5", className)}>
      <Collapsible open={open} onOpenChange={onOpenChange} defaultOpen={defaultOpen}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <CollapsibleTrigger className="group flex min-w-0 flex-1 items-start gap-2 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
              {description && (
                <p className="mt-0.5 max-w-[65ch] text-sm text-muted-foreground">{description}</p>
              )}
            </div>
          </CollapsibleTrigger>
          {action && <div className="shrink-0 pl-6 sm:pl-0">{action}</div>}
        </div>
        <CollapsibleContent className="mt-4">{children}</CollapsibleContent>
      </Collapsible>
    </section>
  );
}
