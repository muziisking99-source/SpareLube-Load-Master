import { useMemo, useState } from "react";
import { ArrowRight, Ban, Play, RotateCcw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { areaColor } from "@/lib/colors";
import { truckWeight } from "@/lib/allocation";
import type { Invoice, Truck } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScreenHeader } from "./ui/ScreenHeader";
import { EmptyState } from "./ui/EmptyState";
import { FormField } from "./ui/FormField";

export function AllocateScreen({ mode }: { mode: "allocate" | "adjust" }) {
  const plan = useStore((s) => s.plans[s.currentDate])!;
  const trucks = useStore((s) => s.trucks);
  const runAllocation = useStore((s) => s.runAllocation);
  const moveInvoice = useStore((s) => s.moveInvoice);
  const bulkMove = useStore((s) => s.bulkMove);
  const undo = useStore((s) => s.undo);
  const undoStack = useStore((s) => s.undoStack);
  const setStep = useStore((s) => s.setStep);

  const [selected, setSelected] = useState<string[]>([]);
  const [moveTarget, setMoveTarget] = useState<{
    inv: Invoice | null;
    bulk?: boolean;
  } | null>(null);

  const activeTrucks = trucks.filter((t) => t.active);
  const dayAreas = new Map(plan.truckDay.map((td) => [td.truckId, td.areas ?? []]));
  const inv = plan.invoices;
  const allocated = inv.filter((i) => i.truckId);
  const unallocated = inv.filter((i) => !i.truckId);
  const byArea = useMemo(() => {
    const m = new Map<string, Invoice[]>();
    for (const i of inv) {
      const key = i.area || "—";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(i);
    }
    return m;
  }, [inv]);

  function toggleSelect(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  function clearSel() {
    setSelected([]);
  }

  return (
    <div className="space-y-5">
      <div className="panel sticky top-[7.5rem] z-20 flex flex-wrap items-center gap-3 p-4 no-print">
        {mode === "allocate" ? (
          <>
            <Button
              onClick={() => {
                runAllocation();
                toast.success("Allocation complete");
              }}
            >
              <Play className="size-4" />
              Run Allocation (Even Balance)
            </Button>
            <Button
              variant="outline"
              onClick={() => setStep("adjust")}
              disabled={allocated.length === 0}
            >
              Review and Adjust
              <ArrowRight className="size-4" />
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={undo} disabled={undoStack.length === 0}>
              <Undo2 className="size-4" />
              Undo{undoStack[0] ? ` (${undoStack[0].label})` : ""}
            </Button>
            {selected.length > 0 && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">{selected.length} selected</span>
                <Button size="sm" variant="secondary" onClick={() => setMoveTarget({ inv: null, bulk: true })}>
                  Move Selected
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    bulkMove(selected, null);
                    clearSel();
                  }}
                >
                  Move to Unallocated
                </Button>
                <Button size="sm" variant="ghost" onClick={clearSel}>
                  Clear
                </Button>
              </div>
            )}
            <Button className="ml-auto" onClick={() => setStep("lock")}>
              Proceed to Lock
              <ArrowRight className="size-4" />
            </Button>
          </>
        )}
      </div>

      <div>
        <ScreenHeader title="Area Summary" className="mb-3" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[...byArea.entries()].map(([area, list], idx) => {
            const c = areaColor(area);
            const wt = list.reduce((s, i) => s + i.weight, 0);
            const trucksHere = activeTrucks.filter((t) =>
              (dayAreas.get(t.id) ?? []).includes(area),
            );
            return (
              <div
                key={area}
                style={{ "--index": idx } as React.CSSProperties}
                className="panel-2 stagger-item p-4"
              >
                <div className="text-sm font-semibold" style={{ color: c.text }}>
                  {area}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {list.length} invoices · <span className="metric-mono">{wt.toFixed(0)} kg</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Trucks: {trucksHere.length ? trucksHere.map((t) => t.name).join(", ") : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {activeTrucks.map((t, idx) => (
          <TruckCard
            key={t.id}
            truck={t}
            areas={dayAreas.get(t.id) ?? []}
            invoices={inv.filter((i) => i.truckId === t.id)}
            mode={mode}
            selected={selected}
            index={idx}
            onToggleSelect={toggleSelect}
            onMove={(i) => setMoveTarget({ inv: i })}
            onUnallocate={(i) => moveInvoice(i.id, null)}
            onClearSelected={clearSel}
          />
        ))}
      </div>

      {unallocated.length > 0 && (
        <section className="panel border-crit/50 p-4">
          <ScreenHeader
            title={`Unallocated (${unallocated.length})`}
            description={`${unallocated.reduce((s, i) => s + i.weight, 0).toFixed(0)} kg total`}
            className="mb-3"
          />
          <div className="flex flex-wrap gap-2">
            {unallocated.map((i) => (
              <InvoiceChip
                key={i.id}
                inv={i}
                mode={mode}
                selected={selected.includes(i.id)}
                onToggleSelect={() => toggleSelect(i.id)}
                onMove={() => setMoveTarget({ inv: i })}
              />
            ))}
          </div>
        </section>
      )}

      {moveTarget && (
        <MoveDialog
          plan={plan}
          trucks={activeTrucks}
          dayAreas={dayAreas}
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
      )}
    </div>
  );
}

function TruckCard({
  truck,
  areas,
  invoices,
  mode,
  selected,
  index,
  onToggleSelect,
  onMove,
  onUnallocate,
  onClearSelected,
}: {
  truck: Truck;
  areas: string[];
  invoices: Invoice[];
  mode: "allocate" | "adjust";
  selected: string[];
  index: number;
  onToggleSelect: (id: string) => void;
  onMove: (i: Invoice) => void;
  onUnallocate: (i: Invoice) => void;
  onClearSelected: () => void;
}) {
  const sendToSecondRound = useStore((s) => s.sendToSecondRound);
  const setInvoiceRound = useStore((s) => s.setInvoiceRound);

  const round1 = invoices.filter((i) => (i.round ?? 1) === 1);
  const round2 = invoices.filter((i) => (i.round ?? 1) === 2);
  const weight = round1.reduce((s, i) => s + i.weight, 0);
  const round2Weight = round2.reduce((s, i) => s + i.weight, 0);
  const pct = truck.maxWeight ? (weight / truck.maxWeight) * 100 : 0;
  const barTone = pct >= 95 ? "bg-crit" : pct >= 80 ? "bg-warn" : "bg-good";
  const countByArea = new Map<string, number>();
  for (const inv of invoices) {
    const key = inv.area || "—";
    countByArea.set(key, (countByArea.get(key) ?? 0) + 1);
  }

  const selectedOnTruck = selected.filter((id) => invoices.some((i) => i.id === id));
  const selectedRound1 = selectedOnTruck.filter((id) =>
    round1.some((i) => i.id === id),
  );
  const selectedRound2 = selectedOnTruck.filter((id) =>
    round2.some((i) => i.id === id),
  );

  function handleSecondRound() {
    const n = sendToSecondRound(
      truck.id,
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
    onClearSelected();
  }

  function handleBackToRound1() {
    if (selectedRound2.length === 0) return;
    setInvoiceRound(selectedRound2, 1);
    toast.success(`Restored ${selectedRound2.length} to Round 1`);
    onClearSelected();
  }

  return (
    <div
      style={{ "--index": index } as React.CSSProperties}
      className="panel stagger-item p-4 transition-transform hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold tracking-tight">{truck.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {areas.length === 0 ? (
              <span className="chip">no area</span>
            ) : (
              areas.map((area) => {
                const c = areaColor(area);
                const n = countByArea.get(area) ?? 0;
                return (
                  <span
                    key={area}
                    className="chip"
                    style={{ borderColor: c.border, color: c.text, background: c.bg }}
                  >
                    {area}
                    <span className="metric-mono opacity-80">{n}</span>
                  </span>
                );
              })
            )}
            <span>{invoices.length} invoices</span>
            {round2.length > 0 && (
              <span className="chip border-warn/40 text-warn">R2 · {round2.length}</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="metric-mono text-sm font-medium">
            {weight.toFixed(0)} / {truck.maxWeight} kg
          </div>
          <div className="text-xs text-muted-foreground metric-mono">{pct.toFixed(0)}%</div>
          {round2.length > 0 && (
            <div className="text-xs text-warn metric-mono">R2 {round2Weight.toFixed(0)} kg</div>
          )}
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-panel-2">
        <div
          className={`h-full transition-all duration-500 ${barTone}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>

      {mode === "adjust" && invoices.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
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
        </div>
      )}

      {invoices.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="No invoices assigned" className="w-full py-4" />
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <RoundGroup
            label="Round 1"
            list={round1}
            mode={mode}
            selected={selected}
            onToggleSelect={onToggleSelect}
            onMove={onMove}
            onUnallocate={onUnallocate}
          />
          {round2.length > 0 && (
            <RoundGroup
              label="Round 2"
              list={round2}
              mode={mode}
              selected={selected}
              onToggleSelect={onToggleSelect}
              onMove={onMove}
              onUnallocate={onUnallocate}
              accent
            />
          )}
        </div>
      )}
    </div>
  );
}

function RoundGroup({
  label,
  list,
  mode,
  selected,
  onToggleSelect,
  onMove,
  onUnallocate,
  accent,
}: {
  label: string;
  list: Invoice[];
  mode: "allocate" | "adjust";
  selected: string[];
  onToggleSelect: (id: string) => void;
  onMove: (i: Invoice) => void;
  onUnallocate: (i: Invoice) => void;
  accent?: boolean;
}) {
  if (list.length === 0 && !accent) return null;
  return (
    <div>
      <div
        className={`mb-1.5 text-[11px] font-medium uppercase tracking-wider ${
          accent ? "text-warn" : "text-muted-foreground"
        }`}
      >
        {label}
        <span className="metric-mono ml-1.5 opacity-80">{list.length}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {list.map((i) => (
          <InvoiceChip
            key={i.id}
            inv={i}
            mode={mode}
            selected={selected.includes(i.id)}
            onToggleSelect={() => onToggleSelect(i.id)}
            onMove={() => onMove(i)}
            onUnallocate={() => onUnallocate(i)}
          />
        ))}
      </div>
    </div>
  );
}

function InvoiceChip({
  inv,
  mode,
  selected,
  onToggleSelect,
  onMove,
  onUnallocate,
}: {
  inv: Invoice;
  mode: "allocate" | "adjust";
  selected: boolean;
  onToggleSelect: () => void;
  onMove: () => void;
  onUnallocate?: () => void;
}) {
  const c = areaColor(inv.area || "—");
  return (
    <span
      className="chip transition-colors"
      style={{
        borderColor: selected ? "var(--primary)" : c.border,
        background: selected ? "color-mix(in oklab, var(--primary) 15%, transparent)" : c.bg,
      }}
    >
      {mode === "adjust" && (
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} className="mr-1" />
      )}
      <span className="metric-mono text-[11px]">{inv.doc}</span>
      <span className="max-w-[14ch] truncate opacity-80">{inv.customer}</span>
      <span className="metric-mono opacity-80">{inv.weight}kg</span>
      {mode === "adjust" && (
        <>
          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={onMove}>
            Move
          </Button>
          {inv.truckId && onUnallocate && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={onUnallocate}
              title="Move to unallocated"
            >
              <Ban className="size-3" />
            </Button>
          )}
        </>
      )}
    </span>
  );
}

function MoveDialog({
  plan,
  trucks,
  dayAreas,
  bulk,
  invoice,
  selectedIds,
  onClose,
  onSubmit,
}: {
  plan: import("@/lib/types").Plan;
  trucks: Truck[];
  dayAreas: Map<string, string[]>;
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
  const movingAreas = [...new Set(movingInvoices.map((i) => i.area).filter(Boolean))];

  const reasonFinal = reason === "Other" ? reasonText : reason;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="panel max-w-xl border-border">
        <DialogHeader>
          <DialogTitle>
            {bulk ? `Move ${selectedIds.length} invoices` : `Move ${invoice?.doc}`}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Moving <span className="metric-mono">{movingWeight.toFixed(0)} kg</span>
          {movingAreas.length > 0 && (
            <>
              {" "}
              · areas: <span className="text-foreground">{movingAreas.join(", ")}</span>
            </>
          )}
        </p>
        <div className="max-h-72 space-y-1 overflow-auto">
          {trucks.map((t) => {
            const currentWeight = truckWeight(plan.invoices, t.id, 1);
            const remaining = t.maxWeight - currentWeight;
            const fits = remaining >= movingWeight;
            const pct = ((currentWeight + movingWeight) / t.maxWeight) * 100;
            const truckAreas = dayAreas.get(t.id) ?? [];
            const crossArea =
              movingAreas.length > 0 &&
              movingAreas.some((a) => !truckAreas.includes(a));
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
                <div className="flex justify-between text-sm">
                  <span>
                    <b>{t.name}</b> · {truckAreas.join(", ") || "—"}
                  </span>
                  <span className="metric-mono">
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
                {crossArea && (
                  <div className="mt-1 text-xs text-warn">
                    Invoice area is not on this truck&apos;s route
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Reason">
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-panel-2 px-2 text-sm"
            >
              <option>Customer Request</option>
              <option>Weight Balance</option>
              <option>Route Optimisation</option>
              <option>Other</option>
            </select>
          </FormField>
          {reason === "Other" && (
            <FormField label="Detail">
              <Input value={reasonText} onChange={(e) => setReasonText(e.target.value)} />
            </FormField>
          )}
        </div>
        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button type="button" variant="ghost" className="text-muted-foreground" onClick={() => onSubmit(null, reasonFinal)}>
            Move to Unallocated
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" disabled={!target} onClick={() => onSubmit(target, reasonFinal)}>
              Move
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
