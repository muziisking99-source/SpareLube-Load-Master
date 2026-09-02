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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { StickyStepBar } from "./ui/StickyStepBar";
import { ScreenShell } from "./ui/ScreenShell";
import { AdminSearchInput, matchesQuery } from "./AdminSearchInput";
import { cn } from "@/lib/utils";
import { useRowHighlight } from "@/lib/useRowHighlight";
import { usePlanReadOnly } from "@/hooks/use-plan-read-only";

export function SetupScreen() {
  const plan = useStore((s) => s.plans[s.currentDate]);
  const plans = useStore((s) => s.plans);
  const currentDate = useStore((s) => s.currentDate);
  const trips = useStore((s) => s.trips);
  const searchHighlightId = useStore((s) => s.searchHighlightId);
  const setDate = useStore((s) => s.setDate);
  const setPlanTrips = useStore((s) => s.setPlanTrips);
  const setStep = useStore((s) => s.setStep);
  const deleteDay = useStore((s) => s.deleteDay);
  const readOnly = usePlanReadOnly();
  const { highlightProps } = useRowHighlight(searchHighlightId);

  const [tripSearch, setTripSearch] = useState("");
  const [continueAttempted, setContinueAttempted] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const selectedTripIds = plan?.tripIds ?? [];
  const selectedSet = useMemo(() => new Set(selectedTripIds), [selectedTripIds]);
  const canContinue = selectedTripIds.length > 0 && !readOnly;
  const showErrors = continueAttempted && !canContinue;

  const continueStatus = useMemo(() => {
    if (readOnly) return "Plan is locked — unlock on Lock step to edit.";
    if (trips.length === 0) return "Create trips in Admin before continuing.";
    if (selectedTripIds.length === 0) return "Select at least one trip for today.";
    return `${selectedTripIds.length} trip${selectedTripIds.length === 1 ? "" : "s"} selected — ready to enter invoices.`;
  }, [readOnly, trips.length, selectedTripIds.length]);

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
    if (readOnly) return;
    if (selectedSet.has(tripId)) {
      setPlanTrips(selectedTripIds.filter((id) => id !== tripId));
    } else {
      setPlanTrips([...selectedTripIds, tripId]);
    }
  }

  function handleContinue() {
    if (!canContinue) {
      setContinueAttempted(true);
      return;
    }
    setStep("import");
  }

  return (
    <>
      <ScreenShell className="space-y-6">
      {readOnly && (
        <div className="rounded-xl border border-warn/40 bg-warn/5 px-4 py-3 text-sm text-warn">
          This plan is locked. You can review setup but cannot change trips until you unlock on the
          Lock step.
        </div>
      )}

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
            disabled={readOnly}
            className="h-9 w-full sm:h-8 sm:w-auto"
          />
        </FormField>
      </div>

      <section className="glass-panel p-4 sm:p-5">
        <ScreenHeader
          title="Today's Trips"
          description="Select the runs for today. You'll pair trucks to these trips after entering invoices."
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
                description={`Nothing matched "${tripSearch.trim()}".`}
              />
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {filteredTrips.map((trip) => {
                  const selected = selectedSet.has(trip.id);
                  return (
                    <li key={trip.id}>
                      <label
                        className={cn(
                          "flex w-full cursor-pointer items-start gap-3 px-3 py-3 transition-colors hover:bg-panel-2/60",
                          selected && "bg-primary/5",
                          readOnly && "cursor-default opacity-80",
                        )}
                      >
                        <Checkbox
                          checked={selected}
                          disabled={readOnly}
                          onCheckedChange={() => toggleTrip(trip.id)}
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
                      </label>
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
        defaultOpen={false}
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
                          disabled={readOnly}
                          onClick={() => setDeleteTarget(p.date)}
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
      </ScreenShell>

      <StickyStepBar
        status={continueStatus}
        primaryLabel="Continue to Enter Invoices"
        primaryIcon={ArrowRight}
        onPrimary={handleContinue}
        primaryDisabled={!canContinue}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="glass-panel border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete plan {deleteTarget}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the saved plan for that date. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deleteDay(deleteTarget);
                  toast.success("Plan deleted");
                  setDeleteTarget(null);
                }
              }}
            >
              Delete plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
