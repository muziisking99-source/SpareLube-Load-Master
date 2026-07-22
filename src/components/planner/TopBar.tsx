import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import type { Invoice } from "@/lib/types";

export function TopBar({
  q,
  setQ,
  searchResults,
}: {
  q: string;
  setQ: (v: string) => void;
  searchResults: Invoice[] | null;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md no-print">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            L
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold tracking-tight">Load Planner</div>
            <div className="truncate text-[11px] text-muted-foreground">Daily load planning</div>
          </div>
        </div>

        <div className="relative flex-1 max-w-md">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search doc, customer, or area…"
            className="h-8"
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

        <ThemeToggle />
        <Link
          to="/admin"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "shrink-0 no-print",
          )}
        >
          <Settings className="size-4" />
          Admin
        </Link>
      </div>
    </header>
  );
}
