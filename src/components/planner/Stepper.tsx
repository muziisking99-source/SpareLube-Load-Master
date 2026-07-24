"use client";

import { Lock } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { stepLabels, stepList } from "@/lib/store";
import type { PlanStep } from "@/lib/types";
import { cn } from "@/lib/utils";

const shortLabels: Record<PlanStep, string> = {
  setup: "Setup",
  import: "Import",
  allocate: "Allocate",
  adjust: "Adjust",
  lock: "Lock",
  print: "Print",
};

export function Stepper({
  current,
  onGo,
  locked,
}: {
  current: PlanStep;
  onGo: (s: PlanStep) => void;
  locked: boolean;
}) {
  const currentIdx = stepList.indexOf(current);

  return (
    <nav className="border-b border-border no-print">
      <div className="mx-auto max-w-7xl px-3 sm:px-4">
        <div className="flex items-center gap-0.5 overflow-x-auto py-2 sm:gap-1">
          {stepList.map((s, idx) => {
            const active = s === current;
            const done = idx < currentIdx;
            const stepNum = idx + 1;

            return (
              <button
                key={s}
                type="button"
                onClick={() => onGo(s)}
                style={{ "--index": idx } as React.CSSProperties}
                className={cn(
                  "stagger-item group relative flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-2 text-left transition-colors sm:gap-2 sm:px-3",
                  active
                    ? "text-primary"
                    : done
                      ? "text-foreground/80 hover:text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "metric-mono flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors sm:h-6 sm:w-6",
                    active
                      ? "bg-primary text-primary-foreground"
                      : done
                        ? "bg-primary/20 text-primary"
                        : "bg-secondary text-muted-foreground",
                  )}
                >
                  {stepNum}
                </span>
                <span className="whitespace-nowrap text-sm font-medium sm:hidden">
                  {shortLabels[s]}
                </span>
                <span className="hidden whitespace-nowrap text-sm font-medium sm:inline">
                  {stepLabels[s]}
                </span>
                {active && (
                  <motion.span
                    layoutId="step-indicator"
                    className="absolute inset-x-2 -bottom-2 h-0.5 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 100, damping: 20 }}
                  />
                )}
                {idx < stepList.length - 1 && (
                  <span
                    className={cn(
                      "mx-1 hidden h-px w-6 shrink-0 lg:block",
                      done ? "bg-primary/50" : "bg-border",
                    )}
                    aria-hidden
                  />
                )}
              </button>
            );
          })}

          {locked && (
            <Badge variant="good" className="ml-auto shrink-0 gap-1">
              <Lock className="size-3" />
              Locked
            </Badge>
          )}
        </div>
      </div>
    </nav>
  );
}
