import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { areaColor } from "@/lib/colors";
import { truckWeight } from "@/lib/allocation";
import type { Invoice, Truck } from "@/lib/types";

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
  const dayArea = new Map(plan.truckDay.map((td) => [td.truckId, td.area]));
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

  const totalCap = activeTrucks.reduce((s, t) => s + t.maxWeight, 0);
  const totalWeight = allocated.reduce((s, i) => s + i.weight, 0);
  const fleetUtil = totalCap ? (totalWeight / totalCap) * 100 : 0;

  function toggleSelect(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  function clearSel() { setSelected([]); }

  return (
    <div className="space-y-5">
      <div className="panel p-4 flex flex-wrap items-center gap-3">
        {mode === "allocate" ? (
          <>
            <button
              onClick={runAllocation}
              className="px-4 py-2 rounded bg-primary text-primary-foreground font-semibold"
            >
              ▶ Run Allocation (Even Balance)
            </button>
            <button
              onClick={() => setStep("adjust")}
              disabled={allocated.length === 0}
              className="px-4 py-2 rounded border border-border hover:bg-panel-2 disabled:opacity-40"
            >
              Review & Adjust →
            </button>
          </>
        ) : (
          <>
            <button
              onClick={undo}
              disabled={undoStack.length === 0}
              className="px-4 py-2 rounded border border-border hover:bg-panel-2 disabled:opacity-40"
            >
              ↶ Undo{undoStack[0] ? ` (${undoStack[0].label})` : ""}
            </button>
            {selected.length > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selected.length} selected
                </span>
                <button
                  onClick={() => setMoveTarget({ inv: null, bulk: true })}
                  className="px-3 py-1.5 rounded bg-secondary text-secondary-foreground text-sm"
                >
                  Move Selected
                </button>
                <button
                  onClick={() => {
                    bulkMove(selected, null);
                    clearSel();
                  }}
                  className="px-3 py-1.5 rounded border border-border text-sm"
                >
                  Move to Unallocated
                </button>
                <button onClick={clearSel} className="text-xs text-muted-foreground">
                  clear
                </button>
              </div>
            )}
            <button
              onClick={() => setStep("lock")}
              className="ml-auto px-4 py-2 rounded bg-primary text-primary-foreground font-semibold"
            >
              Proceed to Lock →
            </button>
          </>
        )}
      </div>

      {/* Area summary */}
      <div>
        <h3 className="text-sm text-muted-foreground mb-2">Area Summary</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[...byArea.entries()].map(([area, list]) => {
            const c = areaColor(area);
            const wt = list.reduce((s, i) => s + i.weight, 0);
            const trucksHere = activeTrucks.filter((t) => dayArea.get(t.id) === area);
            return (
              <div
                key={area}
                className="panel-2 p-3"
                style={{ borderColor: c.border }}
              >
                <div className="text-sm font-semibold" style={{ color: c.text }}>
                  {area}
                </div>
                <div className="text-xs text-muted-foreground">
                  {list.length} invoices · {wt.toFixed(0)} kg
                </div>
                <div className="text-xs mt-1">
                  Trucks: {trucksHere.length ? trucksHere.map((t) => t.name).join(", ") : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Trucks */}
      <div className="grid gap-4 lg:grid-cols-2">
        {activeTrucks.map((t) => (
          <TruckCard
            key={t.id}
            truck={t}
            area={dayArea.get(t.id) ?? ""}
            invoices={inv.filter((i) => i.truckId === t.id)}
            mode={mode}
            selected={selected}
            onToggleSelect={toggleSelect}
            onMove={(i) => setMoveTarget({ inv: i })}
            onUnallocate={(i) => moveInvoice(i.id, null)}
          />
        ))}
      </div>

      {/* Unallocated */}
      {unallocated.length > 0 && (
        <section className="panel p-4 border-crit" style={{ borderColor: "var(--crit)" }}>
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-crit">
              Unallocated ({unallocated.length})
            </div>
            <div className="text-xs text-muted-foreground">
              {unallocated.reduce((s, i) => s + i.weight, 0).toFixed(0)} kg total
            </div>
          </div>
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

      {/* Move dialog */}
      {moveTarget && (
        <MoveDialog
          plan={plan}
          trucks={activeTrucks}
          dayArea={dayArea}
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
  area,
  invoices,
  mode,
  selected,
  onToggleSelect,
  onMove,
  onUnallocate,
}: {
  truck: Truck;
  area: string;
  invoices: Invoice[];
  mode: "allocate" | "adjust";
  selected: string[];
  onToggleSelect: (id: string) => void;
  onMove: (i: Invoice) => void;
  onUnallocate: (i: Invoice) => void;
}) {
  const weight = invoices.reduce((s, i) => s + i.weight, 0);
  const pct = truck.maxWeight ? (weight / truck.maxWeight) * 100 : 0;
  const barColor =
    pct >= 95 ? "var(--crit)" : pct >= 80 ? "var(--warn)" : "var(--good)";
  const c = areaColor(area || "—");
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between sticky top-0 bg-panel py-1">
        <div>
          <div className="font-semibold">{truck.name}</div>
          <div className="text-xs text-muted-foreground">
            <span
              className="chip mr-2"
              style={{ borderColor: c.border, color: c.text, background: c.bg }}
            >
              {area || "no area"}
            </span>
            {invoices.length} invoices
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono">
            {weight.toFixed(0)} / {truck.maxWeight} kg
          </div>
          <div className="text-xs text-muted-foreground">{pct.toFixed(0)}%</div>
        </div>
      </div>
      <div className="mt-2 h-2 bg-panel-2 rounded overflow-hidden">
        <div
          className="h-full transition-all"
          style={{ width: `${Math.min(100, pct)}%`, background: barColor }}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {invoices.length === 0 && (
          <span className="text-xs text-muted-foreground">No invoices assigned.</span>
        )}
        {invoices.map((i) => (
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
      className="chip"
      style={{
        borderColor: selected ? "var(--primary)" : c.border,
        background: selected ? "color-mix(in oklab, var(--primary) 20%, transparent)" : c.bg,
      }}
    >
      {mode === "adjust" && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="mr-1"
        />
      )}
      <span className="font-mono text-[11px]">{inv.doc}</span>
      <span className="opacity-80 truncate max-w-[14ch]">{inv.customer}</span>
      <span className="font-mono opacity-80">{inv.weight}kg</span>
      {mode === "adjust" && (
        <>
          <button
            onClick={onMove}
            className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/20 hover:bg-primary/30"
          >
            Move
          </button>
          {inv.truckId && onUnallocate && (
            <button
              onClick={onUnallocate}
              className="text-[10px] px-1 py-0.5 rounded hover:bg-panel"
              title="Move to unallocated"
            >
              ⊘
            </button>
          )}
        </>
      )}
    </span>
  );
}

function MoveDialog({
  plan,
  trucks,
  dayArea,
  bulk,
  invoice,
  selectedIds,
  onClose,
  onSubmit,
}: {
  plan: import("@/lib/types").Plan;
  trucks: Truck[];
  dayArea: Map<string, string>;
  bulk?: boolean;
  invoice?: Invoice;
  selectedIds: string[];
  onClose: () => void;
  onSubmit: (truckId: string | null, reason?: string) => void;
}) {
  const [target, setTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("Weight Balance");
  const [reasonText, setReasonText] = useState("");

  const movingWeight = bulk
    ? plan.invoices
        .filter((i) => selectedIds.includes(i.id))
        .reduce((s, i) => s + i.weight, 0)
    : invoice?.weight ?? 0;

  const reasonFinal = reason === "Other" ? reasonText : reason;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="panel p-5 w-full max-w-xl">
        <h3 className="text-lg font-semibold mb-2">
          {bulk ? `Move ${selectedIds.length} invoices` : `Move ${invoice?.doc}`}
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Moving {movingWeight.toFixed(0)} kg
        </p>
        <div className="space-y-1 max-h-72 overflow-auto mb-3">
          {trucks.map((t) => {
            const currentWeight = truckWeight(plan.invoices, t.id);
            const remaining = t.maxWeight - currentWeight;
            const fits = remaining >= movingWeight;
            const pct = ((currentWeight + movingWeight) / t.maxWeight) * 100;
            return (
              <button
                key={t.id}
                disabled={!fits}
                onClick={() => setTarget(t.id)}
                className={`w-full text-left p-2 rounded border ${
                  target === t.id ? "border-primary" : "border-border"
                } ${!fits ? "opacity-40" : "hover:bg-panel-2"}`}
              >
                <div className="flex justify-between text-sm">
                  <span>
                    <b>{t.name}</b> · {dayArea.get(t.id) || "—"}
                  </span>
                  <span className="font-mono">
                    {currentWeight.toFixed(0)} / {t.maxWeight} kg
                  </span>
                </div>
                {!fits && (
                  <div className="text-xs text-crit">
                    Exceeds max by {(movingWeight - remaining).toFixed(0)} kg
                  </div>
                )}
                {fits && (
                  <div className="text-xs text-muted-foreground">
                    After move: {pct.toFixed(0)}%
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="text-sm">
            Reason
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full bg-panel-2 border border-border rounded px-2 py-1.5"
            >
              <option>Customer Request</option>
              <option>Weight Balance</option>
              <option>Route Optimisation</option>
              <option>Other</option>
            </select>
          </label>
          {reason === "Other" && (
            <label className="text-sm">
              Detail
              <input
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                className="mt-1 w-full bg-panel-2 border border-border rounded px-2 py-1.5"
              />
            </label>
          )}
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={() => onSubmit(null, reasonFinal)}
            className="text-sm text-muted-foreground hover:text-crit"
          >
            Move to Unallocated
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-border"
            >
              Cancel
            </button>
            <button
              disabled={!target}
              onClick={() => onSubmit(target, reasonFinal)}
              className="px-4 py-1.5 rounded bg-primary text-primary-foreground font-medium disabled:opacity-40"
            >
              Move
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
