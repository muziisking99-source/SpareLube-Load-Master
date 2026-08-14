"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import type { CustomerMemory } from "@/lib/types";
import { customerKey } from "@/lib/customers";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function CustomerCombobox({
  value,
  customers,
  onChange,
  placeholder = "Select customer…",
  searchPlaceholder = "Search customers…",
  emptyLabel = "No customer found.",
  disabled = false,
  allowCreate = false,
  className,
  buttonClassName,
}: {
  value: string;
  customers: Record<string, CustomerMemory>;
  onChange: (customer: CustomerMemory | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  allowCreate?: boolean;
  className?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const list = useMemo(
    () =>
      Object.values(customers).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [customers],
  );

  const selected = useMemo(() => {
    if (!value.trim()) return undefined;
    const lower = value.trim().toLowerCase();
    return list.find(
      (c) =>
        c.name.toLowerCase() === lower ||
        c.code.toLowerCase() === lower ||
        customerKey(c).toLowerCase() === lower,
    );
  }, [list, value]);

  const trimmedQuery = query.trim();
  const q = trimmedQuery.toLowerCase();
  const filtered = q
    ? list.filter((c) =>
        `${c.code} ${c.name} ${customerKey(c)}`.toLowerCase().includes(q),
      )
    : list;
  const canCreate =
    allowCreate &&
    trimmedQuery.length > 0 &&
    !list.some(
      (c) =>
        c.name.toLowerCase() === q ||
        c.code.toLowerCase() === q,
    );

  const label = selected
    ? selected.code
      ? `${selected.code} · ${selected.name}`
      : selected.name
    : value || placeholder;

  function createFromQuery() {
    const name = trimmedQuery;
    if (!name) return;
    onChange({
      code: "",
      name,
      defaultArea: "",
      loadingNumber: 0,
      firstSeen: new Date().toISOString(),
      collection: false,
    });
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || (list.length === 0 && !allowCreate)}
          className={cn(
            "h-8 justify-between gap-2 font-normal",
            !selected && !value && "text-muted-foreground",
            buttonClassName,
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-[var(--radix-popover-trigger-width)] min-w-[16rem] p-0", className)}
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {filtered.length === 0 && !canCreate ? (
              <CommandEmpty>
                {allowCreate
                  ? trimmedQuery
                    ? "No matching customer."
                    : "Type a name to add a customer."
                  : emptyLabel}
              </CommandEmpty>
            ) : null}
            {canCreate ? (
              <CommandGroup>
                <CommandItem value={`__create__ ${trimmedQuery}`} onSelect={createFromQuery}>
                  <Plus className="size-4" />
                  <span className="min-w-0 flex-1 truncate">
                    Add “{trimmedQuery}”
                  </span>
                </CommandItem>
              </CommandGroup>
            ) : null}
            {filtered.length > 0 ? (
            <CommandGroup>
              {filtered.map((c) => {
                const key = customerKey(c);
                const isSelected = selected && customerKey(selected) === key;
                return (
                  <CommandItem
                    key={key}
                    value={`${c.code} ${c.name} ${key}`}
                    onSelect={() => {
                      onChange(c);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <Check
                      className={cn(
                        "size-4",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {c.code ? (
                        <>
                          <span className="metric-mono text-muted-foreground">{c.code}</span>
                          <span className="mx-1.5 text-muted-foreground/50">·</span>
                        </>
                      ) : null}
                      <span className="font-medium">{c.name}</span>
                    </span>
                    {c.defaultArea ? (
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                        {c.defaultArea}
                      </span>
                    ) : null}
                    {c.collection ? (
                      <span className="ml-1 shrink-0 text-[10px] uppercase text-warn">
                        Coll
                      </span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
