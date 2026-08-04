import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { Invoice } from "@/lib/types";
import { SyncStatusChip } from "./SyncStatusChip";

export function TopBar({
  q,
  setQ,
  searchResults,
}: {
  q: string;
  setQ: (v: string) => void;
  searchResults: Invoice[] | null;
}) {
  const isMobile = useIsMobile();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md no-print">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:gap-4 sm:px-4">
        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          <Logo className="h-9 w-auto shrink-0 object-contain sm:h-10" />
          <div className="hidden min-w-0 sm:block">
            <div className="truncate text-sm font-semibold tracking-tight sm:text-base">
              Load Planner
            </div>
            <div className="hidden truncate text-[11px] text-muted-foreground sm:block">
              Daily load planning
            </div>
          </div>
        </div>


        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={isMobile ? "Search…" : "Search doc, customer, or town…"}
            className="h-9 sm:h-8"
            aria-label="Search doc, customer, or town"
          />
          {searchResults && searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-xl border border-border bg-popover p-2 shadow-lg animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="mb-1 px-2 text-xs text-muted-foreground">
                {searchResults.length} match{searchResults.length === 1 ? "" : "es"}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {searchResults.map((i) => (
                  <span key={i.id} className="chip">
                    <span className="metric-mono text-[11px]">{i.doc}</span>
                    <span className="truncate max-w-[12ch]">{i.customer}</span>
                    <span className="text-muted-foreground">{i.area || "—"}</span>
                    <span className="metric-mono">{i.weight}kg</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {searchResults && searchResults.length === 0 && q.trim() && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-border bg-popover p-3 text-sm text-muted-foreground shadow-lg animate-in fade-in duration-200">
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
            "size-9 shrink-0 px-0 no-print sm:size-auto sm:px-3",
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
