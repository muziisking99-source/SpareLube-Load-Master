"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import type { CustomerMemory } from "@/lib/types";
import { customerKey } from "@/lib/customers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function CustomerLabel({ c }: { c: CustomerMemory }) {
  return (
    <span className="min-w-0 flex-1 truncate text-sm">
      {c.code ? (
        <>
          <span className="metric-mono text-muted-foreground">{c.code}</span>
          <span className="mx-1.5 text-muted-foreground/50">·</span>
        </>
      ) : null}
      <span className="font-medium">{c.name}</span>
    </span>
  );
}

export function CustomerAreaBoard({
  areas,
  unassigned,
  customersByArea,
  areaOptions,
  hideEmptyUnassigned = false,
  onSetArea,
  onDelete,
}: {
  areas: string[];
  unassigned: CustomerMemory[];
  customersByArea: Record<string, CustomerMemory[]>;
  areaOptions: string[];
  hideEmptyUnassigned?: boolean;
  onSetArea: (key: string, area: string) => void;
  onDelete: (key: string) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = { unassigned: true };
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

  function toggle(key: string) {
    setOpen((o) => ({ ...o, [key]: !o[key] }));
  }

  return (
    <div className="space-y-3">
      {!(hideEmptyUnassigned && unassigned.length === 0) && (
      <AreaSection
        title="Unassigned"
        count={unassigned.length}
        open={open.unassigned !== false}
        onToggle={() => toggle("unassigned")}
      >
        {unassigned.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">No unassigned customers.</p>
        ) : (
          <ul className="divide-y divide-border">
            {unassigned.map((c) => {
              const key = customerKey(c);
              return (
                <li key={key} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <CustomerLabel c={c} />
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) onSetArea(key, e.target.value);
                    }}
                    className="h-8 rounded-lg border border-input bg-panel-2 px-2 text-xs text-foreground"
                  >
                    <option value="">Assign town…</option>
                    {areaOptions.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(key)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </AreaSection>
      )}

      {areas.map((area) => {
        const list = customersByArea[area] ?? [];
        return (
          <AreaSection
            key={area}
            title={area}
            count={list.length}
            open={open[area] !== false}
            onToggle={() => toggle(area)}
          >
            {list.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">No customers in this town.</p>
            ) : (
              <ul className="divide-y divide-border">
                {list.map((c) => {
                  const key = customerKey(c);
                  return (
                    <li key={key} className="flex items-center gap-2 bg-panel px-3 py-2">
                      <CustomerLabel c={c} />
                      <select
                        value={area}
                        onChange={(e) => onSetArea(key, e.target.value)}
                        className="h-8 max-w-[9rem] rounded-lg border border-input bg-panel-2 px-2 text-xs text-foreground"
                      >
                        <option value="">Unassign</option>
                        {areaOptions.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        onClick={() => onDelete(key)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </AreaSection>
        );
      })}
    </div>
  );
}

function AreaSection({
  title,
  count,
  open,
  onToggle,
  badge,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 bg-panel-2 px-3 py-2.5 text-left transition-colors hover:bg-secondary/40"
      >
        {open ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
        <span className="font-semibold tracking-tight">{title}</span>
        <Badge variant="secondary" className="ml-1">
          {count}
        </Badge>
        {badge && <span className="text-xs text-muted-foreground">{badge}</span>}
      </button>
      <div className={cn(!open && "hidden")}>{children}</div>
    </div>
  );
}
