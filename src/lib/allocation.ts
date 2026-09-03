import type { CustomerMemory, Invoice, Plan, Trip, Truck } from "./types";
import { compareByLoadingNumber } from "./loadingOrder";
import { townsForTruckDay, tripIdsForTruckDay } from "./trips";

export function truckWeight(inv: Invoice[], truckId: string, round?: number) {
  return inv
    .filter(
      (i) =>
        i.truckId === truckId && (round == null || (i.round ?? 1) === round),
    )
    .reduce((s, i) => s + (i.weight || 0), 0);
}

/** Sort invoices for packing / second-round overflow (load # then heavier). */
export function sortForLoad(
  list: Invoice[],
  customers: Record<string, CustomerMemory>,
  tripId?: string | null,
  trips?: Trip[],
  dayStopOrder?: Record<string, Record<string, number>>,
  dayStopSequence?: Record<string, string[]>,
): Invoice[] {
  return [...list].sort((a, b) => {
    const bySeq = compareByLoadingNumber(
      customers,
      a,
      b,
      tripId,
      trips,
      dayStopOrder,
      dayStopSequence,
    );
    if (bySeq !== 0) return bySeq;
    return b.weight - a.weight;
  });
}

/**
 * Invoices on a truck that exceed capacity when packed in load order —
 * candidates for a second round trip.
 */
export function overflowInvoiceIds(
  invoices: Invoice[],
  truckId: string,
  maxWeight: number,
  customers: Record<string, CustomerMemory>,
  tripId?: string | null,
  trips?: Trip[],
  dayStopOrder?: Record<string, Record<string, number>>,
  dayStopSequence?: Record<string, string[]>,
): string[] {
  const r1 = sortForLoad(
    invoices.filter((i) => i.truckId === truckId && (i.round ?? 1) === 1),
    customers,
    tripId,
    trips,
    dayStopOrder,
    dayStopSequence,
  );
  let w = 0;
  const overflow: string[] = [];
  for (const inv of r1) {
    if (w + (inv.weight || 0) <= maxWeight) w += inv.weight || 0;
    else overflow.push(inv.id);
  }
  return overflow;
}

export function allocate(
  plan: Plan,
  trucks: Truck[],
  customers: Record<string, CustomerMemory> = {},
  trips: Trip[] = [],
): Plan {
  const activeTrucks = trucks.filter((t) => t.active);
  const dayTowns = new Map(
    plan.truckDay.map((td) => [td.truckId, townsForTruckDay(td, trips)]),
  );
  const tripIdsByTruck = new Map(
    plan.truckDay.map((td) => [td.truckId, tripIdsForTruckDay(td)] as const),
  );
  const dayStopOrder = plan.dayStopOrder ?? {};
  const dayStopSequence = plan.dayStopSequence ?? {};
  const invoices = plan.invoices.map((i) => ({
    ...i,
    truckId: null as string | null,
    round: 1,
  }));
  const weights = new Map<string, number>(activeTrucks.map((t) => [t.id, 0]));

  const byArea = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    // Customer-collects stay on the plan (they are not loaded onto trucks by auto allocation).
    // Credit notes are allocatable too.
    if (inv.collection) continue;
    const key = inv.area || "__NONE__";
    if (!byArea.has(key)) byArea.set(key, []);
    byArea.get(key)!.push(inv);
  }

  // Prefer trip order when exactly one trip covers this town today; else town fallback
  for (const [area, list] of byArea) {
    const tripIds = [
      ...new Set(
        [...tripIdsByTruck.entries()]
          .filter(([truckId]) => (dayTowns.get(truckId) ?? []).includes(area))
          .flatMap(([, ids]) => ids),
      ),
    ] as string[];
    const tripId = tripIds.length === 1 ? tripIds[0] : null;
    byArea.set(
      area,
      sortForLoad(list, customers, tripId, trips, dayStopOrder, dayStopSequence),
    );
  }

  for (const [area, list] of byArea) {
    for (const inv of list) {
      const candidates = activeTrucks.filter((t) => {
        const towns = dayTowns.get(t.id) ?? [];
        if (!towns.includes(area)) return false;
        const w = weights.get(t.id) ?? 0;
        return w + inv.weight <= t.maxWeight;
      });
      if (candidates.length === 0) continue;
      candidates.sort((a, b) => {
        const ua = (weights.get(a.id) ?? 0) / a.maxWeight;
        const ub = (weights.get(b.id) ?? 0) / b.maxWeight;
        return ua - ub;
      });
      const chosen = candidates[0];
      inv.truckId = chosen.id;
      // Once on a truck, the invoice is loaded — no longer a "pending credit note".
      if (inv.creditNote) inv.creditNote = false;
      weights.set(chosen.id, (weights.get(chosen.id) ?? 0) + inv.weight);
    }
  }
  return { ...plan, invoices };
}
