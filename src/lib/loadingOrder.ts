import type { CustomerMemory, Trip } from "./types";
import { customerKey, findCustomer } from "./customers";
import { tripById } from "./trips";

/** Customers in an area, sorted by load # ascending (unset last). */
export function customersInArea(
  customers: Record<string, CustomerMemory>,
  area: string,
): CustomerMemory[] {
  if (!area) return [];
  return Object.values(customers)
    .filter((c) => c.defaultArea === area)
    .sort((a, b) => {
      const aUnset = a.loadingNumber <= 0 ? 1 : 0;
      const bUnset = b.loadingNumber <= 0 ? 1 : 0;
      if (aUnset !== bUnset) return aUnset - bUnset;
      if (a.loadingNumber !== b.loadingNumber) return a.loadingNumber - b.loadingNumber;
      return a.name.localeCompare(b.name);
    });
}

/** Clear area assignment; leaves other customers' load numbers untouched. */
export function clearCustomerArea(
  customers: Record<string, CustomerMemory>,
  name: string,
): Record<string, CustomerMemory> {
  const cur = customers[name];
  if (!cur) return customers;
  return {
    ...customers,
    [name]: { ...cur, defaultArea: "", loadingNumber: 0 },
  };
}

/**
 * Assign customer to an area only — does not invent a load #.
 * Load numbers are entered manually. Changing area clears the previous load #.
 */
export function assignCustomerArea(
  customers: Record<string, CustomerMemory>,
  name: string,
  area: string,
): Record<string, CustomerMemory> {
  const cur = customers[name];
  if (!cur) return customers;
  if (!area) return clearCustomerArea(customers, name);

  if (cur.defaultArea === area) {
    return customers;
  }

  return {
    ...customers,
    [name]: {
      ...cur,
      defaultArea: area,
      loadingNumber: 0,
    },
  };
}

/**
 * Set the exact load # the user typed. Does not renumber other customers.
 */
export function setCustomerLoadingNumber(
  customers: Record<string, CustomerMemory>,
  name: string,
  area: string,
  newNumber: number,
): Record<string, CustomerMemory> {
  const cur = customers[name];
  if (!cur || !area) return customers;

  const n = Math.floor(newNumber);
  if (!Number.isFinite(n) || n < 1) {
    return {
      ...customers,
      [name]: { ...cur, defaultArea: area, loadingNumber: 0 },
    };
  }

  return {
    ...customers,
    [name]: {
      ...cur,
      defaultArea: area,
      loadingNumber: n,
    },
  };
}

/**
 * Resolve load #: day plan override → trip stopOrder → town defaultArea loadingNumber.
 */
export function loadingNumberFor(
  customers: Record<string, CustomerMemory>,
  customerName: string,
  area: string,
  tripId?: string | null,
  trips?: Trip[],
  dayStopOrder?: Record<string, Record<string, number>>,
): number {
  const c = findCustomer(customers, customerName);
  if (!c) return 0;

  const key = customerKey(c);

  if (tripId && dayStopOrder) {
    const dayMap = dayStopOrder[tripId];
    if (dayMap) {
      const fromDay = dayMap[key] ?? dayMap[c.name];
      if (typeof fromDay === "number" && fromDay > 0) return fromDay;
    }
  }

  if (tripId && trips?.length) {
    const trip = tripById(trips, tripId);
    if (trip) {
      const fromTrip = trip.stopOrder?.[key] ?? trip.stopOrder?.[c.name];
      if (typeof fromTrip === "number" && fromTrip > 0) return fromTrip;
    }
  }

  if (!area || c.defaultArea !== area) return 0;
  return c.loadingNumber || 0;
}

/**
 * Optional: rewrite load numbers 1…n from a drag order.
 * Prefer manual entry; kept for explicit reorder actions.
 */
export function reorderCustomersInArea(
  customers: Record<string, CustomerMemory>,
  area: string,
  orderedKeys: string[],
): Record<string, CustomerMemory> {
  if (!area) return customers;
  const next = { ...customers };
  orderedKeys.forEach((key, i) => {
    const cur = next[key];
    if (!cur) return;
    next[key] = {
      ...cur,
      defaultArea: area,
      loadingNumber: i + 1,
    };
  });
  return next;
}

/** Customers on a trip's towns, sorted by trip load # (fallback town #), unset last. */
export function customersForTrip(
  customers: Record<string, CustomerMemory>,
  trip: Trip,
): CustomerMemory[] {
  const townSet = new Set(trip.towns);
  const list = Object.values(customers).filter((c) => c.defaultArea && townSet.has(c.defaultArea));
  return list.sort((a, b) => {
    const la = loadingNumberFor(customers, a.name, a.defaultArea, trip.id, [trip]);
    const lb = loadingNumberFor(customers, b.name, b.defaultArea, trip.id, [trip]);
    const aUnset = la <= 0 ? 1 : 0;
    const bUnset = lb <= 0 ? 1 : 0;
    if (aUnset !== bUnset) return aUnset - bUnset;
    if (la !== lb) return la - lb;
    // Keep town order along the trip as secondary sort
    const ai = trip.towns.indexOf(a.defaultArea);
    const bi = trip.towns.indexOf(b.defaultArea);
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });
}

/** Compare invoices for truck sheets: load # lowest → highest, unset last. */
export function compareByLoadingNumber(
  customers: Record<string, CustomerMemory>,
  a: { customer: string; area: string; doc: string },
  b: { customer: string; area: string; doc: string },
  tripId?: string | null,
  trips?: Trip[],
  dayStopOrder?: Record<string, Record<string, number>>,
): number {
  const la = loadingNumberFor(customers, a.customer, a.area, tripId, trips, dayStopOrder);
  const lb = loadingNumberFor(customers, b.customer, b.area, tripId, trips, dayStopOrder);
  const aUnset = la <= 0 ? 1 : 0;
  const bUnset = lb <= 0 ? 1 : 0;
  if (aUnset !== bUnset) return aUnset - bUnset;
  if (la !== lb) return la - lb;
  return a.doc.localeCompare(b.doc);
}

/**
 * Rebuild trip stopOrder after reordering a subset of customers (e.g. those on a truck today).
 * Preserves relative order of customers not in the subset.
 */
export function mergePartialTripReorder(
  customers: Record<string, CustomerMemory>,
  trip: Trip,
  orderedSubsetKeys: string[],
): Record<string, number> {
  const all = customersForTrip(customers, trip);
  const allKeys = all.map((c) => customerKey(c));
  const subset = new Set(orderedSubsetKeys.filter(Boolean));
  const queue = [...orderedSubsetKeys.filter((k) => k && subset.has(k))];
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const key of allKeys) {
    if (subset.has(key)) {
      const next = queue.shift();
      if (next && !seen.has(next)) {
        merged.push(next);
        seen.add(next);
      }
    } else if (!seen.has(key)) {
      merged.push(key);
      seen.add(key);
    }
  }
  for (const key of queue) {
    if (!seen.has(key)) {
      merged.push(key);
      seen.add(key);
    }
  }

  const stopOrder: Record<string, number> = {};
  merged.forEach((key, i) => {
    stopOrder[key] = i + 1;
  });
  return stopOrder;
}

/**
 * Day-scoped partial reorder: uses existing day map if present, else trip template, then merges.
 */
export function mergePartialDayReorder(
  customers: Record<string, CustomerMemory>,
  trip: Trip,
  dayMap: Record<string, number> | undefined,
  orderedSubsetKeys: string[],
): Record<string, number> {
  const baseTrip: Trip = {
    ...trip,
    stopOrder:
      dayMap && Object.keys(dayMap).length > 0 ? dayMap : trip.stopOrder ?? {},
  };
  return mergePartialTripReorder(customers, baseTrip, orderedSubsetKeys);
}
