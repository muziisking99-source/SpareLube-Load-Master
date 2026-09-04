"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { SearchResult } from "@/lib/searchNavigation";
import { SyncStatusChip } from "./SyncStatusChip";

export function TopBar({
  q,
  setQ,
  searchResults,
  searchDisabled,
  onSelectResult,
  currentStep,
}: {
  q: string;
  setQ: (v: string) => void;
  searchResults: SearchResult[] | null;
  searchDisabled?: boolean;
  onSelectResult: (result: SearchResult) => void;
  currentStep?: string;
}) {
  const isMobile = useIsMobile();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const hasResults = !!searchResults && searchResults.length > 0;
  const showDropdown = open && !searchDisabled && q.trim() && searchResults !== null;

  useEffect(() => {
    setActiveIndex(0);
  }, [q, searchResults?.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inField =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      if (e.key === "/" && !inField && !searchDisabled) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
        return;
      }

      if (!showDropdown || !searchResults) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, searchResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && hasResults) {
        e.preventDefault();
        onSelectResult(searchResults[activeIndex]!);
        setOpen(false);
        setQ("");
        inputRef.current?.blur();
      } else if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showDropdown, searchResults, activeIndex, hasResults, onSelectResult, setQ, searchDisabled]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!listRef.current?.contains(e.target as Node) && e.target !== inputRef.current) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      onSelectResult(result);
      setOpen(false);
      setQ("");
    },
    [onSelectResult, setQ],
  );

  return (
    <header
      className="glass-chrome sticky top-0 z-40 no-print"
      style={{ borderBottomColor: "var(--rail-line)" }}
    >
      <div className="mx-auto flex h-12 w-full max-w-[1600px] items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <div className="flex min-w-0 shrink-0 items-center gap-2.5">
          <Logo className="h-8 w-auto shrink-0 sm:h-9" />
          <div className="hidden min-w-0 sm:block">
            <div className="truncate text-[15px] font-semibold tracking-tight text-foreground">
              Load Planner
            </div>
            <div className="truncate text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              SpareLube
            </div>
          </div>
        </div>

        <div className="relative min-w-0 flex-1 sm:max-w-md" ref={listRef}>
          <Input
            ref={inputRef}
            value={q}
            disabled={searchDisabled}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => q.trim() && setOpen(true)}
            placeholder={
              searchDisabled
                ? "Search after entering invoices…"
                : isMobile
                  ? "Search…"
                  : "Search doc, customer, or town…"
            }
            className="h-8 focus-visible:ring-primary/40"
            aria-label="Search doc, customer, or town"
            aria-expanded={showDropdown}
            aria-controls="search-results-list"
            aria-autocomplete="list"
            role="combobox"
          />
          {showDropdown && hasResults && (
            <ul
              id="search-results-list"
              role="listbox"
              className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto glass-popover p-1 animate-in fade-in slide-in-from-top-1 duration-200"
            >
              <li className="px-2 py-1 text-xs text-muted-foreground" aria-hidden>
                {searchResults!.length} match{searchResults!.length === 1 ? "" : "es"} · Enter to
                jump
              </li>
              {searchResults!.map((r, idx) => (
                <li key={`${r.kind}-${r.id}`} role="option" aria-selected={idx === activeIndex}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-secondary/60",
                      idx === activeIndex && "bg-primary/12",
                    )}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => handleSelect(r)}
                  >
                    <span className="metric-mono shrink-0 text-xs font-medium">{r.doc}</span>
                    <span className="min-w-0 flex-1 truncate">{r.customer}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{r.area || "—"}</span>
                    <span className="metric-mono shrink-0 text-xs">{r.weight}kg</span>
                    {r.kind === "held" && (
                      <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                        Held
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {showDropdown && searchResults && searchResults.length === 0 && (
            <div
              className="absolute left-0 right-0 top-full z-50 mt-1 glass-popover p-3 text-sm text-muted-foreground"
              role="status"
            >
              No matches for &ldquo;{q}&rdquo;
            </div>
          )}
        </div>

        <SyncStatusChip />

        <ThemeToggle />
        <Link
          to="/admin"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "size-8 shrink-0 px-0 no-print sm:size-auto sm:px-3",
          )}
          aria-label="Admin"
          title="Admin"
        >
          <Settings className="size-4" />
          <span className="hidden sm:inline">Admin</span>
        </Link>
      </div>
    </header>
  );
}
