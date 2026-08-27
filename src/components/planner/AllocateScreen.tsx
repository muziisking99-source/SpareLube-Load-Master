import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Ban,
  GripVertical,
  Play,
  RotateCcw,
  Undo2,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { truckWeight } from "@/lib/allocation";
import { customerKey, findCustomerKey } from "@/lib/customers";
import {
  compareByLoadingNumber,
  loadingNumberFor,
} from "@/lib/loadingOrder";
import { townsForTruckDay, tripById } from "@/lib/trips";
import type { Invoice, Truck } from "@/lib/types";
import { useRowHighlight } from "@/lib/useRowHighlight";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "./ui/EmptyState";
import { FormField } from "./ui/FormField";
import { ScreenHeader } from "./ui/ScreenHeader";
import { cn } from "@/lib/utils";

export function AllocateScreen({ mode }: { mode: "allocate" | "adjust" }) {
  const plan = useStore((s) => s.plans[s.currentDate])!;
  const trucks = useStore((s) => s.trucks);
  const trips = useStore((s) => s.trips);
  const runAllocation = useStore((s) => s.runAllocation);
  const moveInvoice = useStore((s) => s.moveInvoice);
  const bulkMove = useStore((s) => s.bulkMove);
  const undo = useStore((s) => s.undo);
  const undoStack = useStore((s) => s.undoStack);
  const setStep = useStore((s) => s.setStep);
  const updateTruck = useStore((s) => s.updateTruck);
  const setTruckDayTrip = useStore((s) => s.setTruckDayTrip);
  const ensureTruckDay = useStore((s) => s.ensureTruckDay);

  const [selected, setSelected] = useState<string[]>([]);
  const [moveTarget, setMoveTarget] = useState<{
    inv: Invoice | null;
    bulk?: boolean;
  } | null>(null);

  useEffect(() => {
    if (mode === "allocate") ensureTruckDay();
  }, [mode, ensureTruckDay, trucks.length]);

  const activeTrucks = trucks.filter((t) => t.active);
  const dayTowns = new Map(
    plan.truckDay.map((td) => [td.truckId, townsForTruckDay(td, trips)]),
  );
  const dayTripName = new Map(
    plan.truckDay.map((td) => {
      const trip = tripById(trips, td.tripId);
      return [td.truckId, trip?.name ?? null] as const;
    }),
  );
  const inv = plan.invoices;
  const allocatable = inv.filter((i) => !i.collection && !i.creditNote);
  const allocated = allocatable.filter((i) => i.truckId);
  const unallocated = allocatable.filter((i) => !i.truckId);
  const collections = inv.filter((i) => i.collection);
  const creditNotes = inv.filter((i) => i.creditNote);

  const planTripIds = plan.tripIds ?? [];
  const planTrips = useMemo(
    () =>
      planTripIds
        .map((id) => tripById(trips, id))
        .filter((t): t is NonNullable<typeof t> => !!t),
    [planTripIds, trips],
  );

  const weightByTown = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of allocatable) {
      if (!i.area) continue;
      m.set(i.area, (m.get(i.area) ?? 0) + (i.weight || 0));
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [allocatable]);

  const weightByTrip = useMemo(() => {
    return planTrips.map((trip) => {
      const townSet = new Set(trip.towns);
      const weight = allocatable
        .filter((i) => i.area && townSet.has(i.area))
        .reduce((s, i) => s + (i.weight || 0), 0);
      const truckIds = plan.truckDay
        .filter((td) => td.tripId === trip.id)
        .map((td) => td.truckId);
      const truckCap = trucks
        .filter((t) => t.active && truckIds.includes(t.id))
        .reduce((s, t) => s + t.maxWeight, 0);
      return { trip, weight, truckCap, truckCount: truckIds.filter((id) => trucks.find((t) => t.id === id)?.active).length };
    });
  }, [planTrips, allocatable, plan.truckDay, trucks]);

  const tripsMissingTrucks = weightByTrip.filter((r) => r.truckCount === 0);
  const canRunAllocation =
    planTrips.length > 0 &&
    tripsMissingTrucks.length === 0 &&
    activeTrucks.some((t) => {
      const td = plan.truckDay.find((d) => d.truckId === t.id);
      return !!td?.tripId;
    });

  function toggleSelect(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  function clearSel() {
    setSelected([]);
  }

  const moveDialog = moveTarget ? (
    <MoveDialog
      plan={plan}
      trucks={activeTrucks}
      dayTowns={dayTowns}
      dayTripName={dayTripName}
      bulk={moveTarget.bulk}
      selectedIds={selected}
      invoice={moveTarget.inv ?? undefined}
      onClose={() => setMoveTarget(null)}
      onSubmit={(truckId, reason) => {
        if (moveTarget.bulk) {
          bulkMove(selected, truckId);
          clearSel();
        } else if (moveTarget.inv) {
          moveInvoice(moveTarget.inv.id, truckId, reason);
        }
        setMoveTarget(null);
      }}
    />
  ) : null;

  const truckDayById = new Map(plan.truckDay.map((td) => [td.truckId, td]));

  return (
    <>
      {mode === "allocate" && (
        <div className="mb-4 space-y-4">
          <section className="panel p-4 sm:p-5">
            <ScreenHeader
              title="Weight by area"
              description="Review how much weight each town and trip is carrying before choosing trucks."
              className="mb-4"
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="overflow-hidden rounded-xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-panel-2 hover:bg-panel-2">
                      <TableHead>Town</TableHead>
                      <TableHead className="text-right">Weight</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weightByTown.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-muted-foreground">
                          No invoice weights yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      weightByTown.map(([town, w]) => (
                        <TableRow key={town}>
                          <TableCell>{town}</TableCell>
                          <TableCell className="metric-mono text-right">
                            {w.toFixed(0)} kg
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="overflow-hidden rounded-xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-panel-2 hover:bg-panel-2">
                      <TableHead>Trip</TableHead>
                      <TableHead className="text-right">Weight</TableHead>
                      <TableHead className="text-right">Truck cap</TableHead>
                      <TableHead>Trucks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weightByTrip.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-muted-foreground">
                          No trips selected in Setup
                        </TableCell>
                      </TableRow>
                    ) : (
                      weightByTrip.map(({ trip, weight, truckCap, truckCount }) => (
                        <TableRow key={trip.id}>
                          <TableCell className="font-medium">{trip.name}</TableCell>
                          <TableCell className="metric-mono text-right">
                            {weight.toFixed(0)} kg
                          </TableCell>
                          <TableCell className="metric-mono text-right">
                            {truckCap > 0 ? `${truckCap.toFixed(0)} kg` : "—"}
                          </TableCell>
                          <TableCell>
                            {truckCount === 0 ? (
                              <Badge variant="warn">Needs truck</Badge>
                            ) : (
                              <Badge variant="good">{truckCount}</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
            {collections.length > 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                {collections.length} collection invoice
                {collections.length === 1 ? "" : "s"} excluded from truck allocation
                (customer collects).
              </p>
            )}
            {creditNotes.length > 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                {creditNotes.length} credit note
                {creditNotes.length === 1 ? "" : "s"} excluded until marked Load on truck
                on Enter.
              </p>
            )}
          </section>

          <section className="panel p-4 sm:p-5">
            <ScreenHeader
              title="Assign trucks to trips"
              description="Activate trucks for today and pair each one to a selected trip."
              className="mb-4"
            />
            {trucks.length === 0 ? (
              <EmptyState
                title="No trucks"
                description="Add trucks in Admin → Trucks, then return here."
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-panel-2 hover:bg-panel-2">
                      <TableHead className="w-16">Active</TableHead>
                      <TableHead>Truck</TableHead>
                      <TableHead className="w-28">Max kg</TableHead>
                      <TableHead>Today&apos;s trip</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trucks.map((t) => {
                      const td = truckDayById.get(t.id);
                      return (
                        <TableRow key={t.id} className={cn(!t.active && "opacity-50")}>
                          <TableCell>
                            <Checkbox
                              checked={t.active}
                              onCheckedChange={(v) => updateTruck(t.id, { active: !!v })}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{t.name}</TableCell>
                          <TableCell className="metric-mono">{t.maxWeight}</TableCell>
                          <TableCell>
                            <select
                              disabled={!t.active || planTrips.length === 0}
                              className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-2 text-sm"
                              value={td?.tripId ?? ""}
                              onChange={(e) =>
                                setTruckDayTrip(t.id, e.target.value || null)
                              }
                            >
                              <option value="">Unassigned</option>
                              {planTrips.map((tr) => (
                                <option key={tr.id} value={tr.id}>
                                  {tr.name}
                                </option>
                              ))}
                            </select>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            {tripsMissingTrucks.length > 0 && (
              <p className="mt-3 text-sm text-warn">
                Assign at least one active truck to:{" "}
                {tripsMissingTrucks.map((r) => r.trip.name).join(", ")}
              </p>
            )}
          </section>
        </div>
      )}

      <TruckWorkbench
        mode={mode}
        planInvoices={inv}
        activeTrucks={activeTrucks}
        dayTowns={dayTowns}
        dayTripName={dayTripName}
        planTruckDay={plan.truckDay}
        selected={selected}
        undoStack={undoStack}
        unallocated={unallocated}
        allocatedCount={allocated.length}
        canRunAllocation={canRunAllocation}
        onRunAllocation={() => {
          if (!canRunAllocation) {
            toast.error("Assign an active truck to every selected trip first");
            return;
          }
          runAllocation();
          toast.success("Allocation complete");
        }}
        onReview={() => setStep("adjust")}
        onUndo={undo}
        onToggleSelect={toggleSelect}
        onClearSel={clearSel}
        onMoveSelected={() => setMoveTarget({ inv: null, bulk: true })}
        onBulkUnallocate={() => {
          bulkMove(selected, null);
          clearSel();
        }}
        onMoveInvoice={(i) => setMoveTarget({ inv: i })}
        onUnallocate={(i) => moveInvoice(i.id, null)}
        onLock={() => setStep("lock")}
      />
      {moveDialog}
    </>
  );
}

/* ─── Shared table-first workbench (Allocate + Adjust) ─────────────── */

function TruckWorkbench({
  mode,
  planInvoices,
  activeTrucks,
  dayTowns,
  dayTripName,
  planTruckDay,
  selected,
  undoStack,
  unallocated,
  allocatedCount,
  canRunAllocation = true,
  onRunAllocation,
  onReview,
  onUndo,
  onToggleSelect,
  onClearSel,
  onMoveSelected,
  onBulkUnallocate,
  onMoveInvoice,
  onUnallocate,
  onLock,
}: {
  mode: "allocate" | "adjust";
  planInvoices: Invoice[];
  activeTrucks: Truck[];
  dayTowns: Map<string, string[]>;
  dayTripName: Map<string, string | null>;
  planTruckDay: { truckId: string; tripId: string | null }[];
  selected: string[];
  undoStack: { label: string }[];
  unallocated: Invoice[];
  allocatedCount: number;
  canRunAllocation?: boolean;
  onRunAllocation: () => void;
  onReview: () => void;
  onUndo: () => void;
  onToggleSelect: (id: string) => void;
  onClearSel: () => void;
  onMoveSelected: () => void;
  onBulkUnallocate: () => void;
  onMoveInvoice: (i: Invoice) => void;
  onUnallocate: (i: Invoice) => void;
  onLock: () => void;
}) {
  const isAdjust = mode === "adjust";
  const customers = useStore((s) => s.customers);
  const trips = useStore((s) => s.trips);
  const dayStopOrder = useStore((s) => s.plans[s.currentDate]?.dayStopOrder ?? {});
  const dayStopSequence = useStore(
    (s) => s.plans[s.currentDate]?.dayStopSequence ?? {},
  );
  const sendToSecondRound = useStore((s) => s.sendToSecondRound);
  const setInvoiceRound = useStore((s) => s.setInvoiceRound);
  const setDayTripStopSequence = useStore((s) => s.setDayTripStopSequence);
  const setDayTripCustomerLoadNumber = useStore((s) => s.setDayTripCustomerLoadNumber);
  const { highlightProps } = useRowHighlight();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const defaultFocus =
    activeTrucks.find((t) => planInvoices.some((i) => i.truckId === t.id))?.id ??
    activeTrucks[0]?.id ??
    "";

  const [focusId, setFocusId] = useState(defaultFocus);

  useEffect(() => {
    if (!focusId || !activeTrucks.some((t) => t.id === focusId)) {
      setFocusId(defaultFocus);
    }
  }, [activeTrucks, defaultFocus, focusId]);

  const focusTruck = activeTrucks.find((t) => t.id === focusId) ?? activeTrucks[0];
  const tripId =
    planTruckDay.find((td) => td.truckId === focusTruck?.id)?.tripId ?? null;
  const tripName = focusTruck ? dayTripName.get(focusTruck.id) : null;
  const towns = focusTruck ? dayTowns.get(focusTruck.id) ?? [] : [];

  const truckInvoices = useMemo(() => {
    if (!focusTruck) return [];
    return planInvoices
      .filter((i) => i.truckId === focusTruck.id)
      .sort((a, b) =>
        compareByLoadingNumber(
          customers,
          a,
          b,
          tripId,
          trips,
          dayStopOrder,
          dayStopSequence,
        ),
      );
  }, [
    planInvoices,
    focusTruck,
    customers,
    tripId,
    trips,
    dayStopOrder,
    dayStopSequence,
  ]);

  const round1 = truckInvoices.filter((i) => (i.round ?? 1) === 1);
  const round2 = truckInvoices.filter((i) => (i.round ?? 1) === 2);
  const weight = round1.reduce((s, i) => s + i.weight, 0);
  const pct = focusTruck?.maxWeight ? (weight / focusTruck.maxWeight) * 100 : 0;
  const barTone = pct >= 95 ? "bg-crit" : pct >= 80 ? "bg-warn" : "bg-good";

  const selectedOnTruck = selected.filter((id) =>
    truckInvoices.some((i) => i.id === id),
  );
  const selectedRound1 = selectedOnTruck.filter((id) =>
    round1.some((i) => i.id === id),
  );
  const selectedRound2 = selectedOnTruck.filter((id) =>
    round2.some((i) => i.id === id),
  );

  function customerKeyFor(inv: Invoice) {
    return (
      findCustomerKey(customers, inv.customer) ||
      customerKey({ code: "", name: inv.customer }) ||
      inv.customer
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !tripId || active.id === over.id) return;
    const oldIndex = truckInvoices.findIndex((i) => i.id === active.id);
    const newIndex = truckInvoices.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(truckInvoices, oldIndex, newIndex);
    const nextKeys: string[] = [];
    const seen = new Set<string>();
    for (const inv of reordered) {
      const key = customerKeyFor(inv);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      nextKeys.push(key);
    }
    setDayTripStopSequence(tripId, nextKeys);
  }

  function handleSecondRound() {
    if (!focusTruck) return;
    const n = sendToSecondRound(
      focusTruck.id,
      selectedRound1.length > 0 ? selectedRound1 : undefined,
    );
    if (n === 0) {
      toast.message(
        selectedRound1.length > 0
          ? "No selected invoices to send to Round 2"
          : "Nothing overflows capacity — select invoices or add more weight",
      );
      return;
    }
    toast.success(
      selectedRound1.length > 0
        ? `Moved ${n} invoice${n === 1 ? "" : "s"} to Round 2`
        : `Sent ${n} overflow invoice${n === 1 ? "" : "s"} to Round 2`,
    );
    onClearSel();
  }

  function handleBackToRound1() {
    if (selectedRound2.length === 0) return;
    setInvoiceRound(selectedRound2, 1);
    toast.success(`Restored ${selectedRound2.length} to Round 1`);
    onClearSel();
  }

  return (
    <div className="space-y-4">
      <div className="panel sticky top-14 z-20 flex flex-col gap-2 p-3 no-print sm:top-[7.5rem] sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:p-4">
        {isAdjust ? (
          <>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={onUndo}
              disabled={undoStack.length === 0}
            >
              <Undo2 className="size-4" />
              Undo{undoStack[0] ? ` (${undoStack[0].label})` : ""}
            </Button>
            {selected.length > 0 && (
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                <span className="text-sm text-muted-foreground">{selected.length} selected</span>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-10 w-full sm:h-8 sm:w-auto"
                  onClick={onMoveSelected}
                >
                  Move Selected
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10 w-full sm:h-8 sm:w-auto"
                  onClick={onBulkUnallocate}
                >
                  Move to Unallocated
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-10 w-full sm:h-8 sm:w-auto"
                  onClick={onClearSel}
                >
                  Clear
                </Button>
              </div>
            )}
            <Button className="w-full sm:ml-auto sm:w-auto" onClick={onLock}>
              Proceed to Lock
              <ArrowRight className="size-4" />
            </Button>
          </>
        ) : (
          <>
            <Button
              className="w-full sm:w-auto"
              onClick={onRunAllocation}
              disabled={!canRunAllocation}
            >
              <Play className="size-4" />
              <span className="sm:hidden">Run Allocation</span>
              <span className="hidden sm:inline">Run Allocation (Even Balance)</span>
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-auto sm:ml-auto"
              onClick={onReview}
              disabled={allocatedCount === 0}
            >
              <span className="sm:hidden">Review</span>
              <span className="hidden sm:inline">Review and Adjust</span>
              <ArrowRight className="size-4" />
            </Button>
          </>
        )}
      </div>

      {/* Truck focus strip */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {activeTrucks.map((t) => {
          const tInv = planInvoices.filter((i) => i.truckId === t.id);
          const r1 = tInv.filter((i) => (i.round ?? 1) === 1);
          const w = r1.reduce((s, i) => s + i.weight, 0);
          const p = t.maxWeight ? (w / t.maxWeight) * 100 : 0;
          const tone = p >= 95 ? "bg-crit" : p >= 80 ? "bg-warn" : "bg-good";
          const active = t.id === focusTruck?.id;
          const tName = dayTripName.get(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setFocusId(t.id)}
              className={cn(
                "min-w-[9.5rem] shrink-0 rounded-xl border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-primary bg-primary/5"
                  : "border-border bg-panel hover:bg-panel-2",
              )}
            >
              <div className="truncate text-sm font-semibold tracking-tight">{t.name}</div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {tName ?? "No trip"} · {tInv.length} inv
              </div>
              <div className="mt-1.5 metric-mono text-[11px] text-muted-foreground">
                {w.toFixed(0)}/{t.maxWeight} · {p.toFixed(0)}%
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
                <div className={cn("h-full", tone)} style={{ width: `${Math.min(100, p)}%` }} />
              </div>
            </button>
          );
        })}
      </div>

      {!focusTruck ? (
        <EmptyState title="No active trucks" description="Activate trucks on Setup first." />
      ) : (
        <section className="panel overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h3 className="font-semibold tracking-tight">{focusTruck.name}</h3>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {tripName ?? "No trip assigned"}
                {towns.length > 0 ? ` · ${towns.join(" · ")}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="metric-mono text-sm">
                {weight.toFixed(0)} / {focusTruck.maxWeight} kg
                <span className="ml-2 text-muted-foreground">{pct.toFixed(0)}%</span>
              </div>
              {isAdjust && (
                <>
                  <Button type="button" size="sm" variant="secondary" onClick={handleSecondRound}>
                    <RotateCcw className="size-3.5" />
                    Second Round
                    {selectedRound1.length > 0 ? ` (${selectedRound1.length})` : ""}
                  </Button>
                  {selectedRound2.length > 0 && (
                    <Button type="button" size="sm" variant="outline" onClick={handleBackToRound1}>
                      Back to Round 1 ({selectedRound2.length})
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="h-1.5 bg-panel-2">
            <div
              className={cn("h-full transition-all duration-500", barTone)}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>

          {truckInvoices.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No invoices on this truck" className="w-full py-6" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={isAdjust && tripId ? handleDragEnd : undefined}
              >
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {isAdjust && <TableHead className="w-14" />}
                      <TableHead className="w-28">Load #</TableHead>
                      <TableHead>Doc</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Town</TableHead>
                      <TableHead className="w-24 text-right">Weight</TableHead>
                      <TableHead className="w-16">Round</TableHead>
                      {isAdjust && (
                        <TableHead className="w-28 text-right">Actions</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <SortableContext
                    items={truckInvoices.map((i) => i.id)}
                    strategy={verticalListSortingStrategy}
                    disabled={!isAdjust || !tripId}
                  >
                    <TableBody>
                      {truckInvoices.map((i) => (
                        <SortableTruckInvoiceRow
                          key={i.id}
                          inv={i}
                          isAdjust={isAdjust}
                          tripId={tripId}
                          customers={customers}
                          trips={trips}
                          dayStopOrder={dayStopOrder}
                          checked={selected.includes(i.id)}
                          highlightProps={highlightProps(i.id)}
                          onToggleSelect={() => onToggleSelect(i.id)}
                          onSetLoad={(key, n) =>
                            tripId && setDayTripCustomerLoadNumber(tripId, key, n)
                          }
                          customerKeyFor={customerKeyFor}
                          onMoveInvoice={() => onMoveInvoice(i)}
                          onUnallocate={() => onUnallocate(i)}
                        />
                      ))}
                    </TableBody>
                  </SortableContext>
                </Table>
              </DndContext>
            </div>
          )}
          {isAdjust && tripId && truckInvoices.length > 0 && (
            <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
              Drag rows to reorder this day only (Load # stays as typed). Admin → Trips is
              unchanged.
            </p>
          )}
        </section>
      )}

      {unallocated.length > 0 && (
        <section className="panel overflow-hidden">
          <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
            <h3 className="font-semibold tracking-tight text-crit">
              Unallocated ({unallocated.length})
            </h3>
            <span className="metric-mono text-sm text-muted-foreground">
              {unallocated.reduce((s, i) => s + i.weight, 0).toFixed(0)} kg
            </span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {isAdjust && <TableHead className="w-10" />}
                  <TableHead>Doc</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Town</TableHead>
                  <TableHead className="w-24 text-right">Weight</TableHead>
                  {isAdjust && (
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {unallocated.map((i) => {
                  const checked = selected.includes(i.id);
                  return (
                    <TableRow
                      key={i.id}
                      className={cn(
                        "hover:bg-panel-2/80",
                        isAdjust && checked && "bg-primary/5",
                      )}
                      {...highlightProps(i.id)}
                    >
                      {isAdjust && (
                        <TableCell>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => onToggleSelect(i.id)}
                          />
                        </TableCell>
                      )}
                      <TableCell className="metric-mono text-sm font-medium">
                        {i.doc}
                        <span className="ml-1.5 inline-flex gap-1">
                          {i.exception && (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                              Exception
                            </Badge>
                          )}
                          {i.collection && (
                            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
                              Collection
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[14rem] truncate">{i.customer}</TableCell>
                      <TableCell className="text-muted-foreground">{i.area || "—"}</TableCell>
                      <TableCell className="metric-mono text-right">
                        {i.weight.toFixed(0)}
                      </TableCell>
                      {isAdjust && (
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => onMoveInvoice(i)}
                          >
                            Move
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}

function SortableTruckInvoiceRow({
  inv,
  isAdjust,
  tripId,
  customers,
  trips,
  dayStopOrder,
  checked,
  highlightProps,
  onToggleSelect,
  onSetLoad,
  customerKeyFor,
  onMoveInvoice,
  onUnallocate,
}: {
  inv: Invoice;
  isAdjust: boolean;
  tripId: string | null;
  customers: Record<string, import("@/lib/types").CustomerMemory>;
  trips: import("@/lib/types").Trip[];
  dayStopOrder: Record<string, Record<string, number>>;
  checked: boolean;
  highlightProps: {
    "data-state"?: "selected";
    onClick: (e: React.MouseEvent) => void;
  };
  onToggleSelect: () => void;
  onSetLoad: (key: string, n: number) => void;
  customerKeyFor: (inv: Invoice) => string;
  onMoveInvoice: () => void;
  onUnallocate: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: inv.id, disabled: !isAdjust || !tripId });

  const key = customerKeyFor(inv);
  const loadNo = loadingNumberFor(
    customers,
    inv.customer,
    inv.area,
    tripId,
    trips,
    dayStopOrder,
  );

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(
        "hover:bg-panel-2/80",
        isAdjust && checked && "bg-primary/5",
      )}
      {...highlightProps}
    >
      {isAdjust && (
        <TableCell>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="inline-flex size-7 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
              aria-label="Drag to reorder"
              data-no-row-highlight
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-3.5" />
            </button>
            <Checkbox checked={checked} onCheckedChange={onToggleSelect} />
          </div>
        </TableCell>
      )}
      <TableCell>
        {isAdjust && tripId ? (
          <Input
            type="number"
            min={0}
            value={loadNo || ""}
            onChange={(e) => {
              const n = Number(e.target.value);
              onSetLoad(key, Number.isFinite(n) ? n : 0);
            }}
            className="metric-mono h-8 w-14"
            title="Load # (this day only)"
            data-no-row-highlight
          />
        ) : (
          <span className="metric-mono text-muted-foreground">
            {loadNo > 0 ? loadNo : "—"}
          </span>
        )}
      </TableCell>
      <TableCell className="metric-mono text-sm font-medium">
        {inv.doc}
        <span className="ml-1.5 inline-flex gap-1">
          {inv.exception && (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
              Exception
            </Badge>
          )}
          {inv.collection && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
              Collection
            </Badge>
          )}
        </span>
      </TableCell>
      <TableCell className="max-w-[14rem] truncate">{inv.customer}</TableCell>
      <TableCell className="text-muted-foreground">{inv.area || "—"}</TableCell>
      <TableCell className="metric-mono text-right">{inv.weight.toFixed(0)}</TableCell>
      <TableCell>
        <span
          className={cn(
            "metric-mono text-xs",
            (inv.round ?? 1) === 2 ? "text-warn" : "text-muted-foreground",
          )}
        >
          R{inv.round ?? 1}
        </span>
      </TableCell>
      {isAdjust && (
        <TableCell className="text-right">
          <div className="inline-flex items-center justify-end gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={onMoveInvoice}
            >
              Move
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-destructive"
              onClick={onUnallocate}
              title="Move to unallocated"
            >
              <Ban className="size-3.5" />
            </Button>
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}

function MoveDialog({
  plan,
  trucks,
  dayTowns,
  dayTripName,
  bulk,
  invoice,
  selectedIds,
  onClose,
  onSubmit,
}: {
  plan: import("@/lib/types").Plan;
  trucks: Truck[];
  dayTowns: Map<string, string[]>;
  dayTripName: Map<string, string | null>;
  bulk?: boolean;
  invoice?: Invoice;
  selectedIds: string[];
  onClose: () => void;
  onSubmit: (truckId: string | null, reason?: string) => void;
}) {
  const [target, setTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("Weight Balance");
  const [reasonText, setReasonText] = useState("");

  const movingInvoices = bulk
    ? plan.invoices.filter((i) => selectedIds.includes(i.id))
    : invoice
      ? [invoice]
      : [];
  const movingWeight = movingInvoices.reduce((s, i) => s + i.weight, 0);
  const movingTowns = [...new Set(movingInvoices.map((i) => i.area).filter(Boolean))];

  const reasonFinal = reason === "Other" ? reasonText : reason;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="panel max-h-[90dvh] max-w-xl overflow-y-auto border-border">
        <DialogHeader>
          <DialogTitle>
            {bulk ? `Move ${selectedIds.length} invoices` : `Move ${invoice?.doc}`}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Moving <span className="metric-mono">{movingWeight.toFixed(0)} kg</span>
          {movingTowns.length > 0 && (
            <>
              {" "}
              · towns: <span className="text-foreground">{movingTowns.join(", ")}</span>
            </>
          )}
        </p>
        <div className="max-h-[40dvh] space-y-1 overflow-auto sm:max-h-72">
          {trucks.map((t) => {
            const currentWeight = truckWeight(plan.invoices, t.id, 1);
            const remaining = t.maxWeight - currentWeight;
            const fits = remaining >= movingWeight;
            const pct = ((currentWeight + movingWeight) / t.maxWeight) * 100;
            const truckTowns = dayTowns.get(t.id) ?? [];
            const tripLabel = dayTripName.get(t.id);
            const crossTown =
              movingTowns.length > 0 &&
              movingTowns.some((a) => !truckTowns.includes(a));
            return (
              <button
                key={t.id}
                type="button"
                disabled={!fits}
                onClick={() => setTarget(t.id)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  target === t.id ? "border-primary bg-primary/5" : "border-border hover:bg-panel-2"
                } ${!fits ? "opacity-40" : ""}`}
              >
                <div className="flex flex-col gap-1 text-sm sm:flex-row sm:justify-between">
                  <span>
                    <b>{t.name}</b>
                    {tripLabel ? ` · ${tripLabel}` : ""}
                    {" · "}
                    {truckTowns.join(", ") || "—"}
                  </span>
                  <span className="metric-mono shrink-0">
                    {currentWeight.toFixed(0)} / {t.maxWeight} kg
                  </span>
                </div>
                {!fits && (
                  <div className="text-xs text-crit">
                    Exceeds max by {(movingWeight - remaining).toFixed(0)} kg
                  </div>
                )}
                {fits && (
                  <div className="text-xs text-muted-foreground">After move: {pct.toFixed(0)}%</div>
                )}
                {crossTown && (
                  <div className="mt-1 text-xs text-warn">
                    Invoice town is not on this truck&apos;s trip
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Reason">
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-panel-2 px-2 text-sm sm:h-9"
            >
              <option>Customer Request</option>
              <option>Weight Balance</option>
              <option>Route Optimisation</option>
              <option>Other</option>
            </select>
          </FormField>
          {reason === "Other" && (
            <FormField label="Detail">
              <Input
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                className="h-10 sm:h-9"
              />
            </FormField>
          )}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="w-full text-muted-foreground sm:w-auto"
            onClick={() => onSubmit(null, reasonFinal)}
          >
            Move to Unallocated
          </Button>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1 sm:flex-none"
              disabled={!target}
              onClick={() => onSubmit(target, reasonFinal)}
            >
              Move
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
