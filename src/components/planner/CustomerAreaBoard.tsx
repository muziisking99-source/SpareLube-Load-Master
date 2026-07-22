"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import type { CustomerMemory } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function CustomerAreaBoard({
  areas,
  unassigned,
  customersByArea,
  areaOptions,
  onSetArea,
  onSetLoadingNumber,
  onDelete,
}: {
  areas: string[];
  unassigned: CustomerMemory[];
  customersByArea: Record<string, CustomerMemory[]>;
  areaOptions: string[];
  onSetArea: (name: string, area: string) => void;
  onSetLoadingNumber: (name: string, area: string, n: number) => void;
  onDelete: (name: string) => void;
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
            {unassigned.map((c) => (
              <li key={c.name} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) onSetArea(c.name, e.target.value);
                  }}
                  className="h-8 rounded-lg border border-input bg-panel-2 px-2 text-xs text-foreground"
                >
                  <option value="">Assign area…</option>
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
                  onClick={() => onDelete(c.name)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </AreaSection>

      {areas.map((area) => {
        const list = customersByArea[area] ?? [];
        return (
          <AreaSection
            key={area}
            title={area}
            count={list.length}
            open={open[area] !== false}
            onToggle={() => toggle(area)}
            badge="Enter load # manually · sheets print low → high"
          >
            {list.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">No customers in this area.</p>
            ) : (
              <ul className="divide-y divide-border">
                {list.map((c) => (
                  <li key={c.name} className="flex items-center gap-2 bg-panel px-3 py-2">
                    <Badge
                      variant="outline"
                      className="metric-mono w-10 shrink-0 justify-center px-1"
                    >
                      {c.loadingNumber > 0 ? c.loadingNumber : "—"}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      Load #
                      <LoadingNumberInput
                        value={c.loadingNumber || 0}
                        onCommit={(n) => onSetLoadingNumber(c.name, area, n)}
                      />
                    </label>
                    <select
                      value={area}
                      onChange={(e) => onSetArea(c.name, e.target.value)}
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
                      onClick={() => onDelete(c.name)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
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

function LoadingNumberInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (n: number) => void;
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
      className="h-8 w-16 metric-mono text-foreground"
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
