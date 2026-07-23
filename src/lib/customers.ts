import type { CustomerMemory } from "./types";

/** Stable map key: prefer customer code, fall back to name. */
export function customerKey(c: Pick<CustomerMemory, "code" | "name">): string {
  return (c.code || c.name).trim();
}

/** Resolve a customer by code, map key, or exact name (case-insensitive). */
export function findCustomer(
  customers: Record<string, CustomerMemory>,
  query: string,
): CustomerMemory | undefined {
  const q = query.trim();
  if (!q) return undefined;
  if (customers[q]) return customers[q];
  const lower = q.toLowerCase();
  return Object.values(customers).find(
    (c) =>
      c.code.toLowerCase() === lower ||
      c.name.toLowerCase() === lower ||
      customerKey(c).toLowerCase() === lower,
  );
}

/** Map key for a query string, if a matching customer exists. */
export function findCustomerKey(
  customers: Record<string, CustomerMemory>,
  query: string,
): string | undefined {
  const c = findCustomer(customers, query);
  if (!c) return undefined;
  const key = customerKey(c);
  if (customers[key]) return key;
  return Object.keys(customers).find((k) => customers[k] === c);
}
