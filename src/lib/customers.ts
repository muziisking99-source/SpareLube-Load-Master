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

/** Resolve strictly by customer / account code (case-insensitive). */
export function findCustomerByCode(
  customers: Record<string, CustomerMemory>,
  code: string,
): CustomerMemory | undefined {
  const q = code.trim();
  if (!q) return undefined;
  if (customers[q] && customers[q].code) return customers[q];
  const lower = q.toLowerCase();
  return Object.values(customers).find((c) => c.code.trim().toLowerCase() === lower);
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

/** Known labels for a customer: map key, code, and name (unique, original casing). */
export function customerAliases(
  id: string,
  c: Pick<CustomerMemory, "code" | "name">,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [id, c.code, c.name]) {
    const v = raw.trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

export function labelMatchesAliases(label: string, aliases: string[]): boolean {
  const q = label.trim().toLowerCase();
  if (!q) return false;
  return aliases.some((a) => a.trim().toLowerCase() === q);
}

/** Move a stop-order entry from any old key onto `toKey` without changing the number. */
export function remapStopOrderKeys(
  stopOrder: Record<string, number>,
  fromKeys: string[],
  toKey: string,
): Record<string, number> {
  const dest = toKey.trim();
  if (!dest) return stopOrder;
  const from = new Set(fromKeys.map((k) => k.trim()).filter(Boolean));
  if (from.size === 0) return stopOrder;
  const next = { ...stopOrder };
  let value: number | undefined;
  for (const k of Object.keys(next)) {
    if (!from.has(k)) continue;
    if (value === undefined) value = next[k];
    if (k !== dest) delete next[k];
  }
  if (value !== undefined && !(dest in next)) next[dest] = value;
  return next;
}

/** Replace old customer keys in a drag sequence, dropping duplicates. */
export function remapSequenceKeys(seq: string[], fromKeys: string[], toKey: string): string[] {
  const dest = toKey.trim();
  if (!dest) return seq;
  const from = new Set(fromKeys.map((k) => k.trim()).filter(Boolean));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of seq) {
    const mapped = from.has(k) ? dest : k;
    if (seen.has(mapped)) continue;
    seen.add(mapped);
    out.push(mapped);
  }
  return out;
}
