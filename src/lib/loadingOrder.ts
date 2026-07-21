import type { CustomerMemory } from "./types";

export function customersInArea(
  customers: Record<string, CustomerMemory>,
  area: string,
): CustomerMemory[] {
  if (!area) return [];
  return Object.values(customers)
    .filter((c) => c.defaultArea === area && c.loadingNumber > 0)
    .sort((a, b) => a.loadingNumber - b.loadingNumber || a.name.localeCompare(b.name));
}

function renumberArea(
  customers: Record<string, CustomerMemory>,
  area: string,
): Record<string, CustomerMemory> {
  const next = { ...customers };
  const list = Object.values(next)
    .filter((c) => c.defaultArea === area && c.loadingNumber > 0)
    .sort((a, b) => a.loadingNumber - b.loadingNumber || a.name.localeCompare(b.name));
  list.forEach((c, i) => {
    next[c.name] = { ...c, loadingNumber: i + 1 };
  });
  return next;
}

/** Remove customer from their area sequence and compact numbers. */
export function clearCustomerArea(
  customers: Record<string, CustomerMemory>,
  name: string,
): Record<string, CustomerMemory> {
  const cur = customers[name];
  if (!cur) return customers;
  const oldArea = cur.defaultArea;
  let next = {
    ...customers,
    [name]: { ...cur, defaultArea: "", loadingNumber: 0 },
  };
  if (oldArea) next = renumberArea(next, oldArea);
  return next;
}

/**
 * Assign customer to an area at the end of that area's loading sequence.
 */
export function assignCustomerArea(
  customers: Record<string, CustomerMemory>,
  name: string,
  area: string,
): Record<string, CustomerMemory> {
  const cur = customers[name];
  if (!cur) return customers;
  if (!area) return clearCustomerArea(customers, name);

  let next = customers;
  if (cur.defaultArea && cur.defaultArea !== area) {
    next = clearCustomerArea(next, name);
  }
  const existing = next[name] ?? cur;
  if (existing.defaultArea === area && existing.loadingNumber > 0) {
    return next;
  }
  const max = customersInArea(next, area).length;
  return {
    ...next,
    [name]: {
      ...existing,
      defaultArea: area,
      loadingNumber: max + 1,
    },
  };
}

/**
 * Insert customer at loadingNumber within area (1-based).
 * Existing customers at >= newNumber shift up by 1.
 * If already in the same area, remove first then insert.
 */
export function setCustomerLoadingNumber(
  customers: Record<string, CustomerMemory>,
  name: string,
  area: string,
  newNumber: number,
): Record<string, CustomerMemory> {
  const cur = customers[name];
  if (!cur || !area) return customers;

  let next = customers;
  // Leave current slot if moving within same area
  if (cur.defaultArea === area && cur.loadingNumber > 0) {
    next = {
      ...next,
      [name]: { ...cur, loadingNumber: 0 },
    };
    next = renumberArea(next, area);
  } else if (cur.defaultArea && cur.defaultArea !== area) {
    next = clearCustomerArea(next, name);
  }

  const count = customersInArea(next, area).length;
  const target = Math.max(1, Math.min(newNumber, count + 1));

  // Shift everyone at >= target
  const shifted: Record<string, CustomerMemory> = { ...next };
  for (const c of Object.values(shifted)) {
    if (c.defaultArea === area && c.loadingNumber >= target && c.name !== name) {
      shifted[c.name] = { ...c, loadingNumber: c.loadingNumber + 1 };
    }
  }

  const base = shifted[name] ?? cur;
  shifted[name] = {
    ...base,
    defaultArea: area,
    loadingNumber: target,
  };
  return renumberArea(shifted, area);
}

export function loadingNumberFor(
  customers: Record<string, CustomerMemory>,
  customerName: string,
  area: string,
): number {
  const c = customers[customerName];
  if (!c || !area || c.defaultArea !== area) return 0;
  return c.loadingNumber || 0;
}

/** Set loading numbers 1..n from an ordered name list within an area. */
export function reorderCustomersInArea(
  customers: Record<string, CustomerMemory>,
  area: string,
  orderedNames: string[],
): Record<string, CustomerMemory> {
  if (!area) return customers;
  const next = { ...customers };
  orderedNames.forEach((name, i) => {
    const cur = next[name];
    if (!cur) return;
    next[name] = {
      ...cur,
      defaultArea: area,
      loadingNumber: i + 1,
    };
  });
  return next;
}
