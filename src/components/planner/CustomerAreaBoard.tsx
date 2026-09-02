"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import type { CustomerMemory } from "@/lib/types";
import { customerKey } from "@/lib/customers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { TownCombobox } from "@/components/planner/TownCombobox";
import { LoadingNumberInput } from "@/components/planner/LoadingNumbersBoard";

const LIST_CAP = 50;

function CappedCustomerList({
  items,
  liClassName,
  renderItem,
}: {
  items: CustomerMemory[];
  liClassName?: string;
  renderItem: (c: CustomerMemory) => React.ReactNode;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, LIST_CAP);
  const hidden = items.length - visible.length;
  return (
    <>
      <ul className="divide-y divide-border">
        {visible.map((c) => (
          <li key={customerKey(c)} className={liClassName}>
            {renderItem(c)}
          </li>
        ))}
      </ul>
      {!showAll && hidden > 0 && (
        <div className="border-t border-border px-3 py-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll(true)}>
            Show {hidden} more
          </Button>
        </div>
      )}
    </>
  );
}

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
  collections = [],
  customersByArea,
  areaOptions,
  hideEmptyUnassigned = false,
  hideEmptyCollections = false,
  onSetArea,
  onSetLoadingNumber,
  onSetCollection,
  onDelete,
}: {
  areas: string[];
  unassigned: CustomerMemory[];
  collections?: CustomerMemory[];
  customersByArea: Record<string, CustomerMemory[]>;
  areaOptions: string[];
  hideEmptyUnassigned?: boolean;
  hideEmptyCollections?: boolean;
  onSetArea: (key: string, area: string) => void;
  onSetLoadingNumber: (key: string, area: string, n: number) => void;
  onSetCollection?: (key: string, collection: boolean) => void;
  onDelete: (key: string) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = { unassigned: true, collections: true };
    for (const a of areas) init[a] = true;
    return init;
  });
  /** Draft load # for unassigned customers, applied when a town is chosen */
  const [pendingLoad, setPendingLoad] = useState<Record<string, number>>({});

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

  function assignTown(key: string, town: string) {
    onSetArea(key, town);
    if (town) {
      const n = pendingLoad[key];
      if (n && n > 0) {
        onSetLoadingNumber(key, town, n);
        setPendingLoad((p) => {
          const { [key]: _, ...rest } = p;
          return rest;
        });
      }
    }
  }

  return (
    <div className="space-y-3">
      {!(hideEmptyCollections && collections.length === 0) && (
        <AreaSection
          title="Collections"
          count={collections.length}
          open={open.collections !== false}
          onToggle={() => toggle("collections")}
          badge="No town required"
        >
          {collections.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              No collection customers without a town.
            </p>
          ) : (
            <CappedCustomerList
              items={collections}
              liClassName="flex flex-wrap items-center gap-2 px-3 py-2"
              renderItem={(c) => {
                const key = customerKey(c);
                return (
                  <>
                    <CustomerLabel c={c} />
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      Collection
                    </Badge>
                    <TownCombobox
                      value=""
                      options={areaOptions}
                      placeholder="Optional town…"
                      searchPlaceholder="Search towns…"
                      onChange={(town) => {
                        if (town) assignTown(key, town);
                      }}
                      buttonClassName="h-8 max-w-[11rem] border-input bg-panel-2 px-2 text-xs"
                    />
                    {onSetCollection && (
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Checkbox
                          checked={!!c.collection}
                          onCheckedChange={(v) => onSetCollection(key, !!v)}
                          className="size-3.5"
                        />
                        Collection
                      </label>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(key)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                );
              }}
            />
          )}
        </AreaSection>
      )}

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
            <CappedCustomerList
              items={unassigned}
              liClassName="flex flex-wrap items-center gap-2 px-3 py-2"
              renderItem={(c) => {
                const key = customerKey(c);
                return (
                  <>
                    <CustomerLabel c={c} />
                    <TownCombobox
                      value=""
                      options={areaOptions}
                      placeholder="Assign town…"
                      searchPlaceholder="Search towns…"
                      onChange={(town) => {
                        if (town) assignTown(key, town);
                      }}
                      buttonClassName="h-8 max-w-[11rem] border-input bg-panel-2 px-2 text-xs"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      Load #
                      <LoadingNumberInput
                        value={pendingLoad[key] ?? 0}
                        onCommit={(n) =>
                          setPendingLoad((p) => {
                            if (n <= 0) {
                              const { [key]: _, ...rest } = p;
                              return rest;
                            }
                            return { ...p, [key]: n };
                          })
                        }
                      />
                    </label>
                    {onSetCollection && (
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Checkbox
                          checked={!!c.collection}
                          onCheckedChange={(v) => onSetCollection(key, !!v)}
                          className="size-3.5"
                        />
                        Collection
                      </label>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(key)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                );
              }}
            />
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
              <CappedCustomerList
                items={list}
                liClassName="flex flex-wrap items-center gap-2 bg-panel px-3 py-2"
                renderItem={(c) => {
                  const key = customerKey(c);
                  return (
                    <>
                      <CustomerLabel c={c} />
                      {c.loadingNumber > 0 && (
                        <Badge variant="outline" className="metric-mono shrink-0 px-1.5">
                          #{c.loadingNumber}
                        </Badge>
                      )}
                      {c.collection && (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          Collection
                        </Badge>
                      )}
                      <TownCombobox
                        value={area}
                        options={areaOptions}
                        allowEmpty
                        emptyOptionLabel="Unassign"
                        searchPlaceholder="Search towns…"
                        onChange={(town) => onSetArea(key, town)}
                        buttonClassName="h-8 max-w-[11rem] border-input bg-panel-2 px-2 text-xs"
                      />
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        Load #
                        <LoadingNumberInput
                          value={c.loadingNumber || 0}
                          onCommit={(n) => onSetLoadingNumber(key, area, n)}
                        />
                      </label>
                      {onSetCollection && (
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Checkbox
                            checked={!!c.collection}
                            onCheckedChange={(v) => onSetCollection(key, !!v)}
                            className="size-3.5"
                          />
                          Collection
                        </label>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        onClick={() => onDelete(key)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  );
                }}
              />
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
