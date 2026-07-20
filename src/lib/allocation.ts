import type { Invoice, Plan, Truck } from "./types";

export function truckWeight(inv: Invoice[], truckId: string) {
  return inv.filter((i) => i.truckId === truckId).reduce((s, i) => s + (i.weight || 0), 0);
}

export function allocate(plan: Plan, trucks: Truck[]): Plan {
  const activeTrucks = trucks.filter((t) => t.active);
  const dayArea = new Map(plan.truckDay.map((t) => [t.truckId, t.area]));
  // reset all
  const invoices = plan.invoices.map((i) => ({ ...i, truckId: null as string | null }));
  const weights = new Map<string, number>(activeTrucks.map((t) => [t.id, 0]));

  // group invoices by area, sort heaviest first for better packing
  const byArea = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    const key = inv.area || "__NONE__";
    if (!byArea.has(key)) byArea.set(key, []);
    byArea.get(key)!.push(inv);
  }
  for (const list of byArea.values()) list.sort((a, b) => b.weight - a.weight);

  for (const [area, list] of byArea) {
    for (const inv of list) {
      const candidates = activeTrucks.filter((t) => {
        if (dayArea.get(t.id) !== area) return false;
        const w = weights.get(t.id) ?? 0;
        return w + inv.weight <= t.maxWeight;
      });
      if (candidates.length === 0) continue;
      // choose lowest utilisation %
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
