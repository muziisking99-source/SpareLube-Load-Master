import type { CustomerMemory } from "./types";
import { findCustomer } from "./customers";

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

export function loadingNumberFor(
  customers: Record<string, CustomerMemory>,
  customerName: string,
  area: string,
): number {
  const c = findCustomer(customers, customerName);
  if (!c || !area || c.defaultArea !== area) return 0;
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

/** Compare invoices for truck sheets: load # lowest → highest, unset last. */
export function compareByLoadingNumber(
  customers: Record<string, CustomerMemory>,
  a: { customer: string; area: string; doc: string },
  b: { customer: string; area: string; doc: string },
): number {
  const la = loadingNumberFor(customers, a.customer, a.area);
  const lb = loadingNumberFor(customers, b.customer, b.area);
  const aUnset = la <= 0 ? 1 : 0;
  const bUnset = lb <= 0 ? 1 : 0;
  if (aUnset !== bUnset) return aUnset - bUnset;
  if (la !== lb) return la - lb;
  return a.doc.localeCompare(b.doc);
}
