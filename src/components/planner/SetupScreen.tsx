"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, Circle } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScreenHeader } from "./ui/ScreenHeader";
import { CollapsibleSection } from "./ui/CollapsibleSection";
import { EmptyState } from "./ui/EmptyState";
import { FormField } from "./ui/FormField";
import { AdminSearchInput, matchesQuery } from "./AdminSearchInput";
import { cn } from "@/lib/utils";
import { useRowHighlight } from "@/lib/useRowHighlight";

export function SetupScreen() {
  const plan = useStore((s) => s.plans[s.currentDate]);
  const plans = useStore((s) => s.plans);
  const currentDate = useStore((s) => s.currentDate);
  const trips = useStore((s) => s.trips);
  const setDate = useStore((s) => s.setDate);
  const setPlanTrips = useStore((s) => s.setPlanTrips);
  const setStep = useStore((s) => s.setStep);
  const deleteDay = useStore((s) => s.deleteDay);
  const { highlightProps } = useRowHighlight();

  const [tripSearch, setTripSearch] = useState("");
  const [continueAttempted, setContinueAttempted] = useState(false);

  const selectedTripIds = plan?.tripIds ?? [];
  const selectedSet = useMemo(() => new Set(selectedTripIds), [selectedTripIds]);
  const canContinue = selectedTripIds.length > 0;
  const showErrors = continueAttempted && !canContinue;

  const checklist = [
    {
      id: "trips-available",
      label:
        trips.length === 0
          ? "Create trips in Admin"
          : `${trips.length} trip${trips.length === 1 ? "" : "s"} available`,
      ok: trips.length > 0,
    },
    {
      id: "trips-selected",
      label:
        selectedTripIds.length === 0
          ? "Select at least one trip for today"
          : `${selectedTripIds.length} trip${selectedTripIds.length === 1 ? "" : "s"} selected`,
      ok: selectedTripIds.length > 0,
    },
  ];

  const filteredTrips = useMemo(() => {
    const q = tripSearch.trim();
    if (!q) return trips;
    return trips.filter(
      (t) =>
        matchesQuery(t.name, q) || t.towns.some((town) => matchesQuery(town, q)),
    );
  }, [trips, tripSearch]);

  const dailyPlans = useMemo(
    () => Object.values(plans).sort((a, b) => b.date.localeCompare(a.date)),
    [plans],
  );

  const selectedTrips = useMemo(
    () => trips.filter((t) => selectedSet.has(t.id)),
    [trips, selectedSet],
  );

  function toggleTrip(tripId: string) {
    if (selectedSet.has(tripId)) {
      setPlanTrips(selectedTripIds.filter((id) => id !== tripId));
    } else {
      setPlanTrips([...selectedTripIds, tripId]);
    }
  }

  const continuePanel = (
    <>
      <h3 className="font-semibold tracking-tight">Ready to continue?</h3>
      <ul className="mb-4 mt-3 space-y-2.5 text-sm">
        {checklist.map((item) => (
          <li key={item.id} className="flex items-start gap-2.5">
            {item.ok ? (
              <Check className="mt-0.5 size-4 shrink-0 text-good" aria-hidden />
            ) : (
              <Circle
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  showErrors ? "text-crit" : "text-muted-foreground",
                )}
                aria-hidden
              />
            )}
            <span
              className={cn(
                item.ok
                  ? "text-foreground"
                  : showErrors
                    ? "text-crit"
                    : "text-muted-foreground",
              )}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
      {showErrors && trips.length === 0 && (
        <p className="mb-3 text-sm text-crit">
          Create named trips in Admin → Trips before continuing.
        </p>
      )}
      {showErrors && trips.length > 0 && selectedTripIds.length === 0 && (
        <p className="mb-3 text-sm text-crit">Select at least one trip for today.</p>
      )}
      <Button
        className="w-full"
        size="lg"
        onClick={() => {
          if (!canContinue) {
            setContinueAttempted(true);
            return;
          }
          setStep("import");
        }}
      >
        Continue to Enter Invoices
        <ArrowRight className="size-4" />
      </Button>
    </>
  );

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <ScreenHeader
            title="Daily Setup"
            description="Pick the plan date and which trips run today. Trucks are assigned later."
          />
          <FormField label="Plan date" className="gap-1">
            <Input
              type="date"
              value={plan?.date ?? currentDate}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 w-full sm:h-8 sm:w-auto"
            />
          </FormField>
        </div>

        <section className="panel p-4 sm:p-5">
          <ScreenHeader
            title="Today's Trips"
            description="Select the runs for today. You’ll pair trucks to these trips after entering invoices."
            className="mb-4"
          />

          {trips.length === 0 ? (
            <EmptyState
              title="No trips yet"
              description="Create named trips with towns in Admin, then select them here."
              action={
                <Button asChild variant="secondary" size="sm">
                  <Link to="/admin">Open Admin → Trips</Link>
                </Button>
              }
            />
          ) : (
            <>
              <AdminSearchInput
                value={tripSearch}
                onChange={setTripSearch}
                placeholder="Search trips by name or town…"
                className="mb-3"
              />
              {filteredTrips.length === 0 ? (
                <EmptyState
                  title="No matching trips"
                  description={`Nothing matched “${tripSearch.trim()}”.`}
                />
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {filteredTrips.map((trip) => {
                    const selected = selectedSet.has(trip.id);
                    return (
                      <li key={trip.id}>
                        <button
                          type="button"
                          onClick={() => toggleTrip(trip.id)}
                          className={cn(
                            "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-panel-2/60",
                            selected && "bg-primary/5",
                          )}
                        >
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() => toggleTrip(trip.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-medium">{trip.name}</span>
                              {selected ? (
                                <Badge variant="good" className="text-[10px]">
                                  Selected
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                              {trip.towns.length === 0
                                ? "No towns on this trip yet — edit in Admin"
                                : trip.towns.join(" · ")}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </section>

        {selectedTrips.length > 0 && (
          <div className="rounded-xl border border-border bg-panel-2/40 p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Selected for {currentDate}
            </div>
            <ul className="space-y-1.5 text-sm">
              {selectedTrips.map((t) => (
                <li key={t.id} className="flex justify-between gap-3">
                  <span className="truncate font-medium">{t.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {t.towns.length} town{t.towns.length === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <CollapsibleSection
          title="Daily plans"
          description="Saved plans by date. Open a day to continue or review that plan."
          defaultOpen={dailyPlans.length > 0}
          action={
            <Badge variant="outline" className="metric-mono font-normal">
              {dailyPlans.length}
            </Badge>
          }
        >
          {dailyPlans.length === 0 ? (
            <EmptyState
              title="No plans yet"
              description="Plans are saved automatically as you work each day."
            />
          ) : (
            <div className="overflow-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-panel-2 hover:bg-panel-2">
                    <TableHead>Date</TableHead>
                    <TableHead>Invoices</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyPlans.map((p) => {
                    const isCurrent = p.date === currentDate;
                    return (
                      <TableRow
                        key={p.date}
                        className={cn(isCurrent && "bg-primary/5")}
                        {...highlightProps(p.date)}
                      >
                        <TableCell className="metric-mono">
                          {p.date}
                          {isCurrent && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              Current
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{p.invoices.length}</TableCell>
                        <TableCell>
                          {p.locked ? <Badge variant="good">Locked</Badge> : "—"}
                        </TableCell>
                        <TableCell className="space-x-2 text-right">
                          {!isCurrent && (
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0"
                              onClick={() => {
                                setDate(p.date);
                                toast.success(`Opened plan ${p.date}`);
                              }}
                            >
                              Open
                            </Button>
                          )}
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-destructive"
                            onClick={() => {
                              if (confirm(`Delete plan ${p.date}?`)) {
                                deleteDay(p.date);
                                toast.success("Plan deleted");
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CollapsibleSection>

        <aside className="panel p-4 sm:p-5">{continuePanel}</aside>
      </div>
    </div>
  );
}
