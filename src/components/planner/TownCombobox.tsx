"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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

export function TownCombobox({
  value,
  options,
  onChange,
  placeholder = "Select town…",
  searchPlaceholder = "Search towns…",
  emptyLabel,
  allowEmpty = false,
  emptyOptionLabel = "Unassign",
  disabled = false,
  className,
  buttonClassName,
  priorityOptions,
  priorityLabel = "Suggested",
  optionsLabel = "All towns",
}: {
  value: string;
  options: string[];
  onChange: (town: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  allowEmpty?: boolean;
  emptyOptionLabel?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  /** Towns to list first under their own heading (still searchable) */
  priorityOptions?: string[];
  priorityLabel?: string;
  optionsLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  const priority = useMemo(() => {
    if (!priorityOptions?.length) return [];
    const available = new Set(options);
    return [...new Set(priorityOptions)].filter((t) => available.has(t));
  }, [priorityOptions, options]);

  const sorted = useMemo(() => {
    const promoted = new Set(priority);
    return options.filter((t) => !promoted.has(t)).sort((a, b) => a.localeCompare(b));
  }, [options, priority]);

  const label = value || placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || (sorted.length === 0 && priority.length === 0 && !allowEmpty)}
          className={cn(
            "h-8 justify-between gap-2 font-normal",
            !value && "text-muted-foreground",
            buttonClassName,
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-[var(--radix-popover-trigger-width)] min-w-[14rem] p-0", className)}
        align="start"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyLabel ?? "No town found."}</CommandEmpty>
            {allowEmpty && (
              <CommandGroup>
                <CommandItem
                  value="__empty__"
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("size-4", value ? "opacity-0" : "opacity-100")}
                  />
                  <span className="text-muted-foreground">{emptyOptionLabel}</span>
                </CommandItem>
              </CommandGroup>
            )}
            {priority.length > 0 && (
              <CommandGroup heading={priorityLabel}>
                {priority.map((town) => (
                  <TownOption
                    key={town}
                    town={town}
                    value={value}
                    onSelect={(t) => {
                      onChange(t);
                      setOpen(false);
                    }}
                  />
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading={priority.length > 0 ? optionsLabel : undefined}>
              {sorted.map((town) => (
                <TownOption
                  key={town}
                  town={town}
                  value={value}
                  onSelect={(t) => {
                    onChange(t);
                    setOpen(false);
                  }}
                />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function TownOption({
  town,
  value,
  onSelect,
}: {
  town: string;
  value: string;
  onSelect: (town: string) => void;
}) {
  return (
    <CommandItem value={town} onSelect={() => onSelect(town)}>
      <Check className={cn("size-4", value === town ? "opacity-100" : "opacity-0")} />
      {town}
    </CommandItem>
  );
}
