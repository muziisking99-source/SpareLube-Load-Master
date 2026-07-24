"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { CustomerMemory } from "@/lib/types";
import { customerKey } from "@/lib/customers";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function LoadingNumbersBoard({
  areas,
  customersByArea,
  onSetLoadingNumber,
}: {
  areas: string[];
  customersByArea: Record<string, CustomerMemory[]>;
  onSetLoadingNumber: (key: string, area: string, n: number) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const a of areas) init[a] = true;
    return init;
  });

  useEffect(() => {
    setOpen((prev) => {
      const next = { ...prev };
      for (const a of areas) {
        if (next[a] === undefined) next[a] = true;
      }
      return next;
    });
  }, [areas]);

  if (areas.length === 0) {
    return (
      <p className="px-1 py-4 text-sm text-muted-foreground">
        No towns with customers yet. Assign customers to towns first.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {areas.map((area) => {
        const list = customersByArea[area] ?? [];
        const numbered = list.filter((c) => c.loadingNumber > 0).length;
        const isOpen = open[area] !== false;
        return (
          <div key={area} className="overflow-hidden rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [area]: !isOpen }))}
              className="flex w-full items-center gap-2 bg-panel-2 px-3 py-2.5 text-left transition-colors hover:bg-secondary/40"
            >
              {isOpen ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
              <span className="font-semibold tracking-tight">{area}</span>
              <Badge variant="secondary" className="ml-1">
                {list.length}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {numbered}/{list.length} numbered · sheets print low → high
              </span>
            </button>
            <div className={cn(!isOpen && "hidden")}>
              {list.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  No customers in this town.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {list.map((c) => {
                    const key = customerKey(c);
                    return (
                      <li key={key} className="flex items-center gap-3 bg-panel px-3 py-2.5">
                        <Badge
                          variant="outline"
                          className="metric-mono w-10 shrink-0 justify-center px-1"
                        >
                          {c.loadingNumber > 0 ? c.loadingNumber : "—"}
                        </Badge>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {c.code ? (
                            <>
                              <span className="metric-mono text-muted-foreground">{c.code}</span>
                              <span className="mx-1.5 text-muted-foreground/50">·</span>
                            </>
                          ) : null}
                          <span className="font-medium">{c.name}</span>
                        </span>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          Load #
                          <LoadingNumberInput
                            value={c.loadingNumber || 0}
                            onCommit={(n) => onSetLoadingNumber(key, area, n)}
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function LoadingNumberInput({
  value,
  onCommit,
  className,
}: {
  value: number;
  onCommit: (n: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value > 0 ? String(value) : "");

  useEffect(() => {
    setDraft(value > 0 ? String(value) : "");
  }, [value]);

  function commit() {
    const n = Math.floor(Number(draft));
    if (!Number.isFinite(n) || n < 1) {
      if (value > 0) onCommit(0);
      setDraft("");
      return;
    }
    if (n !== value) onCommit(n);
    else setDraft(String(value));
  }

  return (
    <Input
      type="number"
      min={1}
      value={draft}
      placeholder="#"
      className={cn("h-8 w-20 metric-mono text-foreground", className)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}
