import { useStore } from "@/lib/store";
import { findCustomer } from "@/lib/customers";
import { townsForTruckDay } from "@/lib/trips";

export function useDaySnapshot() {
  const plan = useStore((s) => s.plans[s.currentDate]);
  const trucks = useStore((s) => s.trucks);
  const trips = useStore((s) => s.trips);
  const customers = useStore((s) => s.customers);
  const heldInvoices = useStore((s) => s.heldInvoices);

  if (!plan) return null;

  const active = trucks.filter((t) => t.active);
  const cap = active.reduce((s, t) => s + t.maxWeight, 0);
  const totalWeight = plan.invoices.reduce((s, i) => s + i.weight, 0);
  const allocated = plan.invoices.filter((i) => i.truckId);
  const unallocated = plan.invoices.filter((i) => !i.truckId);
  const util = cap ? (allocated.reduce((s, i) => s + i.weight, 0) / cap) * 100 : 0;

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

  // Credit notes are now treated like normal invoices during auto allocation.
  const needsTruck = plan.invoices.filter((i) => !i.truckId && !i.collection);

  return {
    plan,
    invoiceCount: plan.invoices.length,
    totalWeight,
    activeCount: active.length,
    cap,
    tripsAssigned: trucksWithTrip,
    tripsSelected: (plan.tripIds ?? []).length,
    tripCatalog: trips.length,
    known,
    newly,
    duplicates,
    missingWeights: plan.invoices.filter((i) => !i.weight).length,
    missingTowns: plan.invoices.filter((i) => !i.area).length,
    heldCount: heldInvoices.length,
    allocatedCount: allocated.length,
    unallocatedCount: unallocated.length,
    needsTruckCount: needsTruck.length,
    util,
    above90,
    heaviest: heaviest ? `${heaviest.t.name} (${heaviest.w.toFixed(0)}kg)` : null,
    lightest: lightest ? `${lightest.t.name} (${lightest.w.toFixed(0)}kg)` : null,
    topTown: areaSorted[0] ? `${areaSorted[0][0]} (${areaSorted[0][1].toFixed(0)}kg)` : null,
    lowTown:
      areaSorted.length > 1
        ? `${areaSorted[areaSorted.length - 1][0]} (${areaSorted[areaSorted.length - 1][1].toFixed(0)}kg)`
        : null,
  };
}
