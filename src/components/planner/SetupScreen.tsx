import { useMemo, useState } from "react";
import { ArrowRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { townsForTruckDay, tripById } from "@/lib/trips";
import type { Trip, Truck, TruckDay } from "@/lib/types";
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
import { ScreenHeader } from "./ui/ScreenHeader";
import { EmptyState } from "./ui/EmptyState";
import { FormField } from "./ui/FormField";
import { AdminSearchInput, matchesQuery } from "./AdminSearchInput";
import { cn } from "@/lib/utils";

export function SetupScreen() {
  const plan = useStore((s) => s.plans[s.currentDate]);
  const trucks = useStore((s) => s.trucks);
  const trips = useStore((s) => s.trips);
  const setDate = useStore((s) => s.setDate);
  const setTruckDayTrip = useStore((s) => s.setTruckDayTrip);
  const updateTruck = useStore((s) => s.updateTruck);
  const addTruck = useStore((s) => s.addTruck);
  const deleteTruck = useStore((s) => s.deleteTruck);
  const setStep = useStore((s) => s.setStep);
  const ensureTruckDay = useStore((s) => s.ensureTruckDay);

  const [showAddTruck, setShowAddTruck] = useState(false);
  const [truckForm, setTruckForm] = useState({ name: "", maxWeight: 3000 });
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [tripSearch, setTripSearch] = useState("");

  const truckDayById = new Map((plan?.truckDay ?? []).map((td) => [td.truckId, td]));
  const activeTrucks = trucks.filter((t) => t.active);
  const assignedTripIds = new Set(
    (plan?.truckDay ?? []).map((td) => td.tripId).filter(Boolean) as string[],
  );
  const missingTrip = activeTrucks.filter((t) => {
    const td = truckDayById.get(t.id);
    return townsForTruckDay(td, trips).length === 0;
  });
  const legacyOnly = activeTrucks.filter((t) => {
    const td = truckDayById.get(t.id);
    return td && !td.tripId && (td.areas?.length ?? 0) > 0;
  });
  const canContinue = activeTrucks.length > 0 && missingTrip.length === 0;

  const filteredTrips = useMemo(() => {
    const q = tripSearch.trim();
    if (!q) return trips;
    return trips.filter(
      (t) =>
        matchesQuery(t.name, q) || t.towns.some((town) => matchesQuery(town, q)),
    );
  }, [trips, tripSearch]);

  const continuePanel = (
    <>
      <h3 className="font-semibold tracking-tight">Ready to continue?</h3>
      <ul className="mb-4 mt-3 space-y-2 text-sm">
        <li className="flex justify-between">
          <span className="text-muted-foreground">Trips available</span>
          <span className="metric-mono font-medium">{trips.length}</span>
        </li>
        <li className="flex justify-between">
          <span className="text-muted-foreground">Active trucks</span>
          <span className="metric-mono font-medium">{activeTrucks.length}</span>
        </li>
        <li className="flex justify-between">
          <span className="text-muted-foreground">Missing trip</span>
          <span className={`metric-mono font-medium ${missingTrip.length ? "text-warn" : ""}`}>
            {missingTrip.length}
          </span>
        </li>
      </ul>
      {activeTrucks.length === 0 && (
        <p className="mb-3 text-sm text-crit">At least one truck must be active.</p>
      )}
      {trips.length === 0 && (
        <p className="mb-3 text-sm text-warn">
          Create named trips in Admin → Trips before assigning trucks.
        </p>
      )}
      {missingTrip.length > 0 && (
        <p className="mb-3 text-sm text-warn">
          Assign a trip to every active truck before continuing.
        </p>
      )}
      {legacyOnly.length > 0 && missingTrip.length === 0 && (
        <p className="mb-3 text-sm text-muted-foreground">
          {legacyOnly.length} truck(s) still use legacy towns — assign a named trip when convenient.
        </p>
      )}
      <Button disabled={!canContinue} className="w-full" size="lg" onClick={() => setStep("import")}>
        Continue to Import
        <ArrowRight className="size-4" />
      </Button>
    </>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <section className="panel p-4 sm:p-5">
          <ScreenHeader
            title="Today's Trips"
            description="Named runs available to assign to trucks. Manage trips in Admin."
            action={
              <FormField label="Plan date" className="gap-1">
                <Input
                  type="date"
                  value={plan?.date ?? ""}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-9 w-full sm:h-8 sm:w-auto"
                />
              </FormField>
            }
            className="mb-4"
          />

          {trips.length === 0 ? (
            <EmptyState
              title="No trips yet"
              description="Create named trips with towns in Admin, then assign them to trucks below."
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
                    const inUse = assignedTripIds.has(trip.id);
                    return (
                      <li
                        key={trip.id}
                        className="flex items-start gap-3 px-3 py-3 transition-colors hover:bg-panel-2/60"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-medium">{trip.name}</span>
                            {inUse ? (
                              <Badge variant="good" className="text-[10px]">
                                Assigned today
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {trip.towns.length === 0
                              ? "No towns on this trip yet — edit in Admin"
                              : trip.towns.join(" · ")}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </section>

        <section className="panel p-4 sm:p-5">
          <ScreenHeader
            title="Trucks"
            description="Assign each active truck to a named trip for today."
            action={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowAddTruck((v) => !v)}
              >
                {showAddTruck ? "Cancel" : "Add Truck"}
              </Button>
            }
            className="mb-4"
          />

          {showAddTruck && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!truckForm.name) return;
                addTruck({
                  name: truckForm.name,
                  maxWeight: Number(truckForm.maxWeight) || 0,
                  active: true,
                });
                setTruckForm({ name: "", maxWeight: 3000 });
                setShowAddTruck(false);
                setTimeout(ensureTruckDay, 0);
                toast.success(`Truck "${truckForm.name}" added`);
              }}
              className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap"
            >
              <Input
                autoFocus
                value={truckForm.name}
                onChange={(e) => setTruckForm({ ...truckForm, name: e.target.value })}
                placeholder="Truck name"
                className="min-w-0 flex-1 sm:min-w-[140px]"
              />
              <Input
                type="number"
                value={truckForm.maxWeight}
                onChange={(e) =>
                  setTruckForm({ ...truckForm, maxWeight: Number(e.target.value) })
                }
                placeholder="Max kg"
                className="w-full sm:w-32"
              />
              <Button type="submit" className="w-full sm:w-auto">
                Save
              </Button>
            </form>
          )}

          {trucks.length === 0 ? (
            <EmptyState title="No trucks yet" description="Add a truck using the button above." />
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-3 md:hidden">
                {trucks.map((t, idx) => {
                  const td = truckDayById.get(t.id);
                  return (
                    <TruckCard
                      key={t.id}
                      truck={t}
                      td={td}
                      trips={trips}
                      index={idx}
                      onUpdate={(patch) => updateTruck(t.id, patch)}
                      onTripChange={(tripId) => setTruckDayTrip(t.id, tripId)}
                      onDelete={() => setDeleteTarget({ id: t.id, name: t.name })}
                    />
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-panel-2 hover:bg-panel-2">
                      <TableHead className="w-16">Active</TableHead>
                      <TableHead>Truck</TableHead>
                      <TableHead className="w-28">Max kg</TableHead>
                      <TableHead className="min-w-[240px]">Today&apos;s Trip</TableHead>
                      <TableHead className="w-32">Status</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trucks.map((t, idx) => {
                      const td = truckDayById.get(t.id);
                      const trip = tripById(trips, td?.tripId);
                      const dayTowns = townsForTruckDay(td, trips);
                      const inactive = !t.active;
                      const isLegacy = !td?.tripId && (td?.areas?.length ?? 0) > 0;
                      return (
                        <TableRow
                          key={t.id}
                          style={{ "--index": idx } as React.CSSProperties}
                          className={cn("stagger-item", inactive && "opacity-50")}
                        >
                          <TableCell>
                            <Checkbox
                              checked={t.active}
                              onCheckedChange={(v) => updateTruck(t.id, { active: !!v })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={t.name}
                              onChange={(e) => updateTruck(t.id, { name: e.target.value })}
                              className="h-8 border-transparent bg-transparent hover:border-border focus:border-ring"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={t.maxWeight}
                              onChange={(e) =>
                                updateTruck(t.id, { maxWeight: Number(e.target.value) })
                              }
                              className="metric-mono h-8 w-24 border-transparent bg-transparent hover:border-border focus:border-ring"
                            />
                          </TableCell>
                          <TableCell>
                            <TripSelect
                              trips={trips}
                              inactive={inactive}
                              tripId={td?.tripId}
                              dayTowns={dayTowns}
                              trip={trip}
                              isLegacy={isLegacy}
                              onChange={(tripId) => setTruckDayTrip(t.id, tripId)}
                            />
                          </TableCell>
                          <TableCell>
                            <TruckStatusBadge inactive={inactive} dayTowns={dayTowns} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteTarget({ id: t.id, name: t.name })}
                              aria-label="Delete truck"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </section>

        {/* Mobile continue panel (inline, above FAB space) */}
        <aside className="panel p-4 lg:hidden">{continuePanel}</aside>
      </div>

      <aside className="panel sticky top-20 hidden h-fit p-5 lg:block">{continuePanel}</aside>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="panel border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete truck?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{deleteTarget?.name}</strong> from the fleet. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deleteTruck(deleteTarget.id);
                  toast.success(`Truck "${deleteTarget.name}" removed`);
                  setDeleteTarget(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TruckStatusBadge({ inactive, dayTowns }: { inactive: boolean; dayTowns: string[] }) {
  if (inactive) return <Badge variant="outline">Off Duty</Badge>;
  if (dayTowns.length > 0) return <Badge variant="good">Ready</Badge>;
  return <Badge variant="warn">Needs trip</Badge>;
}

function TripSelect({
  trips,
  inactive,
  tripId,
  dayTowns,
  trip,
  isLegacy,
  onChange,
  fullWidth,
}: {
  trips: Trip[];
  inactive: boolean;
  tripId?: string | null;
  dayTowns: string[];
  trip?: Trip | null;
  isLegacy: boolean;
  onChange: (tripId: string | null) => void;
  fullWidth?: boolean;
}) {
  if (trips.length === 0) {
    return <span className="text-xs text-muted-foreground">Create trips in Admin first</span>;
  }
  return (
    <div className="space-y-1 py-1">
      <select
        disabled={inactive}
        className={cn(
          "h-10 rounded-md border border-input bg-background px-2 text-sm md:h-8",
          fullWidth ? "w-full" : "w-full max-w-xs",
        )}
        value={tripId ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Unassigned</option>
        {trips.map((tr) => (
          <option key={tr.id} value={tr.id}>
            {tr.name}
          </option>
        ))}
      </select>
      {dayTowns.length > 0 && (
        <p className="line-clamp-2 text-[11px] text-muted-foreground">{dayTowns.join(" · ")}</p>
      )}
      {trip && dayTowns.length === 0 && (
        <p className="text-[11px] text-warn">Trip has no towns — edit in Admin</p>
      )}
      {isLegacy && (
        <p className="text-[11px] text-warn">Legacy towns — pick a named trip when ready</p>
      )}
    </div>
  );
}

function TruckCard({
  truck,
  td,
  trips,
  index,
  onUpdate,
  onTripChange,
  onDelete,
}: {
  truck: Truck;
  td?: TruckDay;
  trips: Trip[];
  index: number;
  onUpdate: (patch: Partial<Truck>) => void;
  onTripChange: (tripId: string | null) => void;
  onDelete: () => void;
}) {
  const trip = tripById(trips, td?.tripId);
  const dayTowns = townsForTruckDay(td, trips);
  const inactive = !truck.active;
  const isLegacy = !td?.tripId && (td?.areas?.length ?? 0) > 0;

  return (
    <div
      style={{ "--index": index } as React.CSSProperties}
      className={cn(
        "stagger-item space-y-3 rounded-xl border border-border bg-panel-2/40 p-4",
        inactive && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <label className="flex items-center gap-3">
          <Checkbox
            checked={truck.active}
            onCheckedChange={(v) => onUpdate({ active: !!v })}
            className="size-5"
          />
          <span className="text-sm font-medium">Active</span>
        </label>
        <TruckStatusBadge inactive={inactive} dayTowns={dayTowns} />
      </div>

      <FormField label="Truck name">
        <Input
          value={truck.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="h-10"
        />
      </FormField>

      <FormField label="Max kg">
        <Input
          type="number"
          value={truck.maxWeight}
          onChange={(e) => onUpdate({ maxWeight: Number(e.target.value) })}
          className="metric-mono h-10"
        />
      </FormField>

      <FormField label="Today's trip">
        <TripSelect
          trips={trips}
          inactive={inactive}
          tripId={td?.tripId}
          dayTowns={dayTowns}
          trip={trip}
          isLegacy={isLegacy}
          onChange={onTripChange}
          fullWidth
        />
      </FormField>

      <Button
        type="button"
        variant="outline"
        className="w-full text-muted-foreground hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
        Delete truck
      </Button>
    </div>
  );
}
