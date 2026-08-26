import type { CustomerMemory, Invoice, Plan, Trip, Truck } from "./types";
import { loadingNumberFor } from "./loadingOrder";
import { townsForTruckDay } from "./trips";

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
): Invoice[] {
  return [...list].sort((a, b) => {
    const la = loadingNumberFor(customers, a.customer, a.area, tripId, trips, dayStopOrder);
    const lb = loadingNumberFor(customers, b.customer, b.area, tripId, trips, dayStopOrder);
    const aUnset = la <= 0 ? 1 : 0;
    const bUnset = lb <= 0 ? 1 : 0;
    if (aUnset !== bUnset) return aUnset - bUnset;
    if (la !== lb) return la - lb;
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
): string[] {
  const r1 = sortForLoad(
    invoices.filter((i) => i.truckId === truckId && (i.round ?? 1) === 1),
    customers,
    tripId,
    trips,
    dayStopOrder,
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
  const tripByTruck = new Map(
    plan.truckDay.map((td) => [td.truckId, td.tripId] as const),
  );
  const dayStopOrder = plan.dayStopOrder ?? {};
  const invoices = plan.invoices.map((i) => ({
    ...i,
    truckId: null as string | null,
    round: 1,
  }));
  const weights = new Map<string, number>(activeTrucks.map((t) => [t.id, 0]));

  const byArea = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    // Customer-collects and credit notes stay on the plan but are never auto-allocated
    if (inv.collection || inv.creditNote) continue;
    const key = inv.area || "__NONE__";
    if (!byArea.has(key)) byArea.set(key, []);
    byArea.get(key)!.push(inv);
  }

  // Prefer trip order when exactly one trip covers this town today; else town fallback
  for (const [area, list] of byArea) {
    const tripIds = [
      ...new Set(
        [...tripByTruck.entries()]
          .filter(([truckId]) => (dayTowns.get(truckId) ?? []).includes(area))
          .map(([, tripId]) => tripId)
          .filter(Boolean),
      ),
    ] as string[];
    const tripId = tripIds.length === 1 ? tripIds[0] : null;
    byArea.set(area, sortForLoad(list, customers, tripId, trips, dayStopOrder));
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
      weights.set(chosen.id, (weights.get(chosen.id) ?? 0) + inv.weight);
    }
  }
  return { ...plan, invoices };
}
