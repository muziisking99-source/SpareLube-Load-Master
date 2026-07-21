import type { CustomerMemory, Invoice, Plan, Truck } from "./types";
import { loadingNumberFor } from "./loadingOrder";

export function truckWeight(inv: Invoice[], truckId: string) {
  return inv.filter((i) => i.truckId === truckId).reduce((s, i) => s + (i.weight || 0), 0);
}

export function allocate(
  plan: Plan,
  trucks: Truck[],
  customers: Record<string, CustomerMemory> = {},
): Plan {
  const activeTrucks = trucks.filter((t) => t.active);
  const dayAreas = new Map(plan.truckDay.map((t) => [t.truckId, t.areas ?? []]));
  const invoices = plan.invoices.map((i) => ({ ...i, truckId: null as string | null }));
  const weights = new Map<string, number>(activeTrucks.map((t) => [t.id, 0]));

  const byArea = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    const key = inv.area || "__NONE__";
    if (!byArea.has(key)) byArea.set(key, []);
    byArea.get(key)!.push(inv);
  }

  // Within area: loading number ascending, then heavier first as tiebreak
  for (const [area, list] of byArea) {
    list.sort((a, b) => {
      const la = loadingNumberFor(customers, a.customer, area);
      const lb = loadingNumberFor(customers, b.customer, area);
      const aUnset = la <= 0 ? 1 : 0;
      const bUnset = lb <= 0 ? 1 : 0;
      if (aUnset !== bUnset) return aUnset - bUnset;
      if (la !== lb) return la - lb;
      return b.weight - a.weight;
    });
  }

  for (const [area, list] of byArea) {
    for (const inv of list) {
      const candidates = activeTrucks.filter((t) => {
        const areas = dayAreas.get(t.id) ?? [];
        if (!areas.includes(area)) return false;
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
