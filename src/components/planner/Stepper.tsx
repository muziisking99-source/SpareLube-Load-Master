"use client";

import { Lock } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { stepLabels, stepList } from "@/lib/store";
import type { PlanStep } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

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
  const reducedMotion = usePrefersReducedMotion();

  return (
    <nav
      className="glass-chrome no-print"
      style={{ borderBottomColor: "var(--rail-line)" }}
      aria-label="Plan steps"
    >
      <div className="mx-auto max-w-[1600px] px-3 sm:px-4">
        <div className="flex items-center gap-0.5 overflow-x-auto py-1.5 sm:gap-1">
          {stepList.map((s, idx) => {
            const active = s === current;
            const done = idx < currentIdx;
            const upcoming = idx > currentIdx;
            const stepNum = idx + 1;

            return (
              <button
                key={s}
                type="button"
                onClick={() => onGo(s)}
                aria-current={active ? "step" : undefined}
                aria-label={`${stepLabels[s]}${done ? ", completed" : upcoming ? ", upcoming" : ", current"}`}
                style={reducedMotion ? undefined : ({ "--index": idx } as React.CSSProperties)}
                className={cn(
                  "group relative flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-[color,background-color] duration-150 ease-[cubic-bezier(0.2,0,0,1)] sm:gap-2 sm:px-2.5",
                  !reducedMotion && "stagger-item",
                  active
                    ? "text-primary"
                    : done
                      ? "text-foreground/80 hover:bg-secondary/35 hover:text-foreground"
                      : upcoming
                        ? "text-muted-foreground/55 hover:bg-secondary/35 hover:text-muted-foreground"
                        : "text-muted-foreground hover:bg-secondary/35 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "metric-mono flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-150",
                    active
                      ? "bg-secondary text-primary ring-1 ring-primary/30"
                      : done
                        ? "bg-secondary text-primary"
                        : "bg-secondary/80 text-muted-foreground",
                    upcoming && !active && "opacity-60",
                  )}
                >
                  {stepNum}
                </span>
                <span className="whitespace-nowrap text-sm font-medium sm:hidden">
                  {shortLabels[s]}
                </span>
                <span className="hidden whitespace-nowrap text-sm font-medium sm:inline">
                  {stepLabels[s].replace(/^\d+\.\s*/, "")}
                </span>
                {active && !reducedMotion && (
                  <motion.span
                    layoutId="step-indicator"
                    className="absolute inset-x-2 -bottom-1.5 h-0.5 rounded-full bg-brand"
                    transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
                  />
                )}
                {active && reducedMotion && (
                  <span className="absolute inset-x-2 -bottom-1.5 h-0.5 rounded-full bg-brand" />
                )}
                {idx < stepList.length - 1 && (
                  <span
                    className={cn(
                      "mx-1 hidden h-px w-4 shrink-0 lg:block",
                      done ? "bg-primary/30" : "bg-border",
                    )}
                    aria-hidden
                  />
                )}
              </button>
            );
          })}

          {locked && (
            <Badge variant="good" className="ml-auto shrink-0 gap-1 presence-pulse-soft">
              <Lock className="size-3" />
              Locked
            </Badge>
          )}
        </div>
      </div>
    </nav>
  );
}
