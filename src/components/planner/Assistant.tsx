"use client";

import { useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { AnimatedNumber } from "./ui/AnimatedNumber";

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
    w: plan.invoices
      .filter((i) => i.truckId === t.id && (i.round ?? 1) === 1)
      .reduce((s, i) => s + i.weight, 0),
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

  const post =
    plan.step === "allocate" ||
    plan.step === "adjust" ||
    plan.step === "lock" ||
    plan.step === "print";

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="fixed right-0 top-1/2 z-30 h-auto -translate-y-1/2 rounded-l-xl rounded-r-none border-r-0 px-2 py-4 no-print"
      >
        <PanelRightOpen className="size-4" />
        <span className="sr-only">Open planner assistant</span>
      </Button>
    );
  }

  return (
    <aside className="panel sticky top-20 h-fit p-4 no-print">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold tracking-tight">Planning Assistant</h3>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} className="h-8 gap-1 px-2 text-xs text-muted-foreground">
          <PanelRightClose className="size-3.5" />
          Collapse
        </Button>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        Plan for <span className="font-medium text-foreground">{plan.date}</span>
      </p>

      <Section title="Overview">
        <Row label="Total invoices" value={plan.invoices.length} />
        <Row label="Total weight" value={`${totalWeight.toFixed(0)} kg`} />
        <Row label="Active trucks" value={active.length} />
        <Row label="Fleet capacity" value={`${cap} kg`} />
      </Section>

      <Separator className="my-3 bg-border/60" />

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
          <div className="space-y-1.5 py-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Fleet utilisation</span>
              <span className="metric-mono text-foreground">
                <AnimatedNumber value={Math.round(util)} suffix="%" />
              </span>
            </div>
            <Progress value={util} className="animate-breathe h-1.5" />
          </div>
          <Row label="Trucks at 90%+" value={above90} tone={above90 ? "warn" : undefined} />
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
    <div className="mb-1">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
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
      <span className={`metric-mono font-medium ${color}`}>{value}</span>
    </div>
  );
}
