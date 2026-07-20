import { useState } from "react";
import { useStore } from "@/lib/store";

export function Assistant() {
  const plan = useStore((s) => s.plans[s.currentDate])!;
  const trucks = useStore((s) => s.trucks);
  const customers = useStore((s) => s.customers);
  const [open, setOpen] = useState(true);

  if (!plan) return null;

  const active = trucks.filter((t) => t.active);
  const cap = active.reduce((s, t) => s + t.maxWeight, 0);
  const totalWeight = plan.invoices.reduce((s, i) => s + i.weight, 0);
  const allocated = plan.invoices.filter((i) => i.truckId);
  const unallocated = plan.invoices.filter((i) => !i.truckId);
  const util = cap ? (allocated.reduce((s, i) => s + i.weight, 0) / cap) * 100 : 0;
  const remaining = cap - allocated.reduce((s, i) => s + i.weight, 0);

  const known = plan.invoices.filter((i) => customers[i.customer]).length;
  const newly = plan.invoices.length - known;

  const docCounts = new Map<string, number>();
  for (const i of plan.invoices) docCounts.set(i.doc, (docCounts.get(i.doc) ?? 0) + 1);
  const duplicates = [...docCounts.values()].filter((v) => v > 1).length;

  const truckWeights = active.map((t) => ({
    t,
    w: plan.invoices.filter((i) => i.truckId === t.id).reduce((s, i) => s + i.weight, 0),
  }));
  truckWeights.sort((a, b) => b.w - a.w);
  const heaviest = truckWeights[0];
  const lightest = truckWeights[truckWeights.length - 1];
  const above90 = truckWeights.filter((x) => x.w / x.t.maxWeight >= 0.9).length;

  const areaTotals = new Map<string, number>();
  for (const i of plan.invoices) {
    areaTotals.set(i.area || "—", (areaTotals.get(i.area || "—") ?? 0) + i.weight);
  }
  const areaSorted = [...areaTotals.entries()].sort((a, b) => b[1] - a[1]);

  const post = plan.step === "allocate" || plan.step === "adjust" || plan.step === "lock" || plan.step === "print";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed right-0 top-1/2 -translate-y-1/2 bg-panel border border-border border-r-0 rounded-l px-2 py-3 text-xs no-print"
      >
        ‹ Planner
      </button>
    );
  }

  return (
    <aside className="panel p-4 sticky top-4 h-fit no-print">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Planning Assistant</h3>
        <button onClick={() => setOpen(false)} className="text-xs text-muted-foreground">
          collapse ›
        </button>
      </div>
      <div className="text-xs text-muted-foreground mb-3">
        Plan for <b className="text-foreground">{plan.date}</b>
      </div>
      <Section title="Overview">
        <Row label="Total invoices" value={plan.invoices.length} />
        <Row label="Total weight" value={`${totalWeight.toFixed(0)} kg`} />
        <Row label="Active trucks" value={active.length} />
        <Row label="Fleet capacity" value={`${cap} kg`} />
      </Section>

      {!post ? (
        <Section title="Import health">
          <Row label="Known customers" value={known} />
          <Row label="New customers" value={newly} tone={newly ? "warn" : undefined} />
          <Row label="Duplicate docs" value={duplicates} tone={duplicates ? "crit" : undefined} />
          <Row
            label="Missing weights"
            value={plan.invoices.filter((i) => !i.weight).length}
            tone="warn"
          />
          <Row
            label="Missing areas"
            value={plan.invoices.filter((i) => !i.area).length}
            tone="warn"
          />
          <Row label="Remaining capacity" value={`${remaining.toFixed(0)} kg`} />
        </Section>
      ) : (
        <Section title="Allocation">
          <Row label="Allocated" value={allocated.length} tone="good" />
          <Row
            label="Unallocated"
            value={unallocated.length}
            tone={unallocated.length ? "crit" : "good"}
          />
          <Row label="Fleet utilisation" value={`${util.toFixed(0)}%`} />
          <Row label="Trucks ≥ 90%" value={above90} tone={above90 ? "warn" : undefined} />
          {heaviest && (
            <Row label="Heaviest" value={`${heaviest.t.name} (${heaviest.w.toFixed(0)}kg)`} />
          )}
          {lightest && (
            <Row label="Lightest" value={`${lightest.t.name} (${lightest.w.toFixed(0)}kg)`} />
          )}
          {areaSorted[0] && (
            <Row label="Top area" value={`${areaSorted[0][0]} (${areaSorted[0][1].toFixed(0)}kg)`} />
          )}
          {areaSorted.length > 1 && (
            <Row
              label="Low area"
              value={`${areaSorted[areaSorted.length - 1][0]} (${areaSorted[areaSorted.length - 1][1].toFixed(0)}kg)`}
            />
          )}
        </Section>
      )}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "good" | "warn" | "crit";
}) {
  const color =
    tone === "good"
      ? "text-good"
      : tone === "warn"
        ? "text-warn"
        : tone === "crit"
          ? "text-crit"
          : "";
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${color}`}>{value}</span>
    </div>
  );
}
