"use client";

import { useState } from "react";
import { BarChart3, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { AnimatedNumber } from "./ui/AnimatedNumber";
import { findCustomer } from "@/lib/customers";
import { townsForTruckDay } from "@/lib/trips";
import type { PlanStep } from "@/lib/types";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

export function Assistant({
  desktopOpen,
  onDesktopOpenChange,
}: {
  desktopOpen?: boolean;
  onDesktopOpenChange?: (open: boolean) => void;
}) {
  const plan = useStore((s) => s.plans[s.currentDate])!;
  const trucks = useStore((s) => s.trucks);
  const trips = useStore((s) => s.trips);
  const customers = useStore((s) => s.customers);
  const heldInvoices = useStore((s) => s.heldInvoices);
  const [internalOpen, setInternalOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const isControlled = desktopOpen !== undefined;
  const sidebarOpen = isControlled ? desktopOpen : internalOpen;
  const setSidebarOpen = isControlled ? onDesktopOpenChange! : setInternalOpen;

  if (!plan) return null;

  const active = trucks.filter((t) => t.active);
  const cap = active.reduce((s, t) => s + t.maxWeight, 0);
  const totalWeight = plan.invoices.reduce((s, i) => s + i.weight, 0);
  const allocated = plan.invoices.filter((i) => i.truckId);
  const unallocated = plan.invoices.filter((i) => !i.truckId);
  const util = cap ? (allocated.reduce((s, i) => s + i.weight, 0) / cap) * 100 : 0;
  const remaining = cap - allocated.reduce((s, i) => s + i.weight, 0);

  const known = plan.invoices.filter((i) => !!findCustomer(customers, i.customer)).length;
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

  const trucksWithTrip = active.filter((t) => {
    const td = plan.truckDay.find((d) => d.truckId === t.id);
    return townsForTruckDay(td, trips).length > 0;
  }).length;
  const tripsSelected = (plan.tripIds ?? []).length;
  const missingWeights = plan.invoices.filter((i) => !i.weight).length;
  const missingTowns = plan.invoices.filter((i) => !i.area).length;
  const needsTruck = plan.invoices.filter((i) => !i.truckId && !i.collection && !i.creditNote);

  const body = (
    <AssistantBody
      step={plan.step}
      planDate={plan.date}
      blockersOnly={plan.step === "lock" || plan.step === "print"}
      invoiceCount={plan.invoices.length}
      totalWeight={totalWeight}
      activeCount={active.length}
      cap={cap}
      tripsAssigned={trucksWithTrip}
      tripsSelected={tripsSelected}
      tripCatalog={trips.length}
      known={known}
      newly={newly}
      duplicates={duplicates}
      missingWeights={missingWeights}
      missingTowns={missingTowns}
      heldCount={heldInvoices.length}
      remaining={remaining}
      allocatedCount={allocated.length}
      unallocatedCount={unallocated.length}
      needsTruckCount={needsTruck.length}
      util={util}
      above90={above90}
      heaviest={heaviest ? `${heaviest.t.name} (${heaviest.w.toFixed(0)}kg)` : null}
      lightest={lightest ? `${lightest.t.name} (${lightest.w.toFixed(0)}kg)` : null}
      topTown={areaSorted[0] ? `${areaSorted[0][0]} (${areaSorted[0][1].toFixed(0)}kg)` : null}
      lowTown={
        areaSorted.length > 1
          ? `${areaSorted[areaSorted.length - 1][0]} (${areaSorted[areaSorted.length - 1][1].toFixed(0)}kg)`
          : null
      }
      reducedMotion={reducedMotion}
    />
  );

  return (
    <>
      <div className="no-print lg:hidden">
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => setMobileOpen(true)}
          className="fixed bottom-4 right-4 z-30 gap-2 rounded-full px-4 py-6 shadow-lg"
          style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <BarChart3 className="size-4" />
          Day snapshot
        </Button>
        <Drawer open={mobileOpen} onOpenChange={setMobileOpen}>
          <DrawerContent className="max-h-[85dvh] pb-[env(safe-area-inset-bottom,0px)]">
            <DrawerHeader className="text-left">
              <DrawerTitle>Day snapshot</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-6">{body}</div>
          </DrawerContent>
        </Drawer>
      </div>

      {!sidebarOpen ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => setSidebarOpen(true)}
          className="fixed right-0 top-1/2 z-30 hidden h-auto -translate-y-1/2 rounded-l-xl rounded-r-none border-r-0 px-2 py-4 no-print lg:inline-flex"
        >
          <PanelRightOpen className="size-4" />
          <span className="sr-only">Open day snapshot</span>
        </Button>
      ) : (
        <aside className="panel sticky top-[6.5rem] hidden h-fit p-4 no-print lg:block">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold tracking-tight">Day snapshot</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(false)}
              className="h-8 gap-1 px-2 text-xs text-muted-foreground"
            >
              <PanelRightClose className="size-3.5" />
              Collapse
            </Button>
          </div>
          {body}
        </aside>
      )}
    </>
  );
}

function AssistantBody({
  step,
  planDate,
  blockersOnly,
  invoiceCount,
  totalWeight,
  activeCount,
  cap,
  tripsAssigned,
  tripsSelected,
  tripCatalog,
  known,
  newly,
  duplicates,
  missingWeights,
  missingTowns,
  heldCount,
  remaining,
  allocatedCount,
  unallocatedCount,
  needsTruckCount,
  util,
  above90,
  heaviest,
  lightest,
  topTown,
  lowTown,
  reducedMotion,
}: {
  step: PlanStep;
  planDate: string;
  blockersOnly?: boolean;
  invoiceCount: number;
  totalWeight: number;
  activeCount: number;
  cap: number;
  tripsAssigned: number;
  tripsSelected: number;
  tripCatalog: number;
  known: number;
  newly: number;
  duplicates: number;
  missingWeights: number;
  missingTowns: number;
  heldCount: number;
  remaining: number;
  allocatedCount: number;
  unallocatedCount: number;
  needsTruckCount: number;
  util: number;
  above90: number;
  heaviest: string | null;
  lightest: string | null;
  topTown: string | null;
  lowTown: string | null;
  reducedMotion: boolean;
}) {
  const isSetup = step === "setup";
  const isImport = step === "import";
  const isAllocate = step === "allocate" || step === "adjust";
  const isSummary = step === "lock" || step === "print";

  if (blockersOnly) {
    const blockers: { label: string; value: string | number; tone?: "good" | "warn" | "crit" }[] =
      [];
    if (needsTruckCount > 0) {
      blockers.push({ label: "Need truck", value: needsTruckCount, tone: "crit" });
    }
    if (unallocatedCount > 0) {
      blockers.push({ label: "Unallocated", value: unallocatedCount, tone: "crit" });
    }
    if (missingWeights > 0) {
      blockers.push({ label: "Missing weights", value: missingWeights, tone: "warn" });
    }
    if (missingTowns > 0) {
      blockers.push({ label: "Missing towns", value: missingTowns, tone: "warn" });
    }
    if (duplicates > 0) {
      blockers.push({ label: "Duplicate docs", value: duplicates, tone: "warn" });
    }
    return (
      <>
        <p className="mb-4 text-xs text-muted-foreground">
          Plan for <span className="font-medium text-foreground">{planDate}</span>
        </p>
        <Section title="Blockers">
          {blockers.length === 0 ? (
            <p className="text-sm text-good">No blockers — ready to lock or print</p>
          ) : (
            blockers.map((b) => (
              <Row key={b.label} label={b.label} value={b.value} tone={b.tone} />
            ))
          )}
        </Section>
      </>
    );
  }

  return (
    <>
      <p className="mb-4 text-xs text-muted-foreground">
        Plan for <span className="font-medium text-foreground">{planDate}</span>
      </p>

      {isSetup && (
        <Section title="Readiness">
          <Row label="Trips in catalog" value={tripCatalog} />
          <Row
            label="Trips selected"
            value={tripsSelected}
            tone={tripsSelected ? "good" : "warn"}
          />
          <Row label="Held for later" value={heldCount} tone={heldCount ? "warn" : undefined} />
        </Section>
      )}

      {isImport && (
        <>
          <Section title="Overview">
            <Row label="Total invoices" value={invoiceCount} />
            <Row label="Total weight" value={`${totalWeight.toFixed(0)} kg`} />
            <Row label="Trips selected" value={tripsSelected} />
            <Row label="Held for later" value={heldCount} tone={heldCount ? "warn" : undefined} />
          </Section>
          <Separator className="my-3 bg-border/60" />
          <Section title="Entry health">
            <Row label="Known customers" value={known} />
            <Row label="New customers" value={newly} tone={newly ? "warn" : undefined} />
            <Row label="Duplicate docs" value={duplicates} tone={duplicates ? "crit" : undefined} />
            <Row label="Missing weights" value={missingWeights} tone={missingWeights ? "warn" : undefined} />
            <Row label="Missing towns" value={missingTowns} tone={missingTowns ? "warn" : undefined} />
          </Section>
        </>
      )}

      {isAllocate && (
        <>
          <Section title="Overview">
            <Row label="Total invoices" value={invoiceCount} />
            <Row label="Total weight" value={`${totalWeight.toFixed(0)} kg`} />
            <Row label="Active trucks" value={activeCount} />
            <Row label="Fleet capacity" value={`${cap} kg`} />
            <Row
              label="Trucks with trip"
              value={`${tripsAssigned}/${activeCount || 0}`}
              tone={activeCount > 0 && tripsAssigned === activeCount ? "good" : "warn"}
            />
          </Section>
          <Separator className="my-3 bg-border/60" />
          <Section title="Allocation">
            <Row label="Allocated" value={allocatedCount} tone="good" />
            <Row
              label="Unallocated"
              value={unallocatedCount}
              tone={unallocatedCount ? "crit" : "good"}
            />
            <div className="space-y-1.5 py-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Fleet utilisation</span>
                <span className="metric-mono text-foreground">
                  {reducedMotion ? (
                    `${Math.round(util)}%`
                  ) : (
                    <AnimatedNumber value={Math.round(util)} suffix="%" />
                  )}
                </span>
              </div>
              <Progress
                value={util}
                className={reducedMotion ? "h-1.5" : "animate-breathe h-1.5"}
              />
            </div>
            <Row label="Trucks at 90%+" value={above90} tone={above90 ? "warn" : undefined} />
            {heaviest && <Row label="Heaviest" value={heaviest} />}
            {lightest && <Row label="Lightest" value={lightest} />}
            {topTown && <Row label="Top town" value={topTown} />}
            {lowTown && <Row label="Low town" value={lowTown} />}
          </Section>
        </>
      )}

      {isSummary && !blockersOnly && (
        <Section title="Summary">
          <Row label="Total invoices" value={invoiceCount} />
          <Row label="Total weight" value={`${totalWeight.toFixed(0)} kg`} />
          <Row label="Allocated" value={allocatedCount} tone="good" />
          <Row
            label="Unallocated"
            value={unallocatedCount}
            tone={unallocatedCount ? "crit" : "good"}
          />
          <Row label="Fleet utilisation" value={`${Math.round(util)}%`} />
          <Row label="Active trucks" value={activeCount} />
        </Section>
      )}
    </>
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
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`metric-mono shrink-0 font-medium ${color}`}>{value}</span>
    </div>
  );
}
