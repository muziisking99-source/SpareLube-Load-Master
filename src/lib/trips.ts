import type { Plan, Trip, TruckDay } from "./types";

/** Stored in TruckDay.areas when the truck explicitly covers no towns (empty [] = all). */
export const TOWN_FILTER_NONE = "__none__";

/** Trip ids assigned to a truck today (supports legacy single tripId). */
export function tripIdsForTruckDay(td: TruckDay | undefined): string[] {
  if (!td) return [];
  if (td.tripIds && td.tripIds.length > 0) return [...td.tripIds];
  if (td.tripId) return [td.tripId];
  return [];
}

/** Towns for a truck today: union of all assigned trips, else legacy areas[].
 * When trips are assigned and areas[] is non-empty, areas acts as an optional
 * town filter (intersection) — used to split a shared trip across trucks.
 * areas containing only TOWN_FILTER_NONE means intentionally no towns.
 */
export function townsForTruckDay(
  td: TruckDay | undefined,
  trips: Trip[],
): string[] {
  if (!td) return [];
  const ids = tripIdsForTruckDay(td);
  if (ids.length > 0) {
    const fromTrips: string[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      const trip = trips.find((t) => t.id === id);
      if (!trip) continue;
      for (const town of trip.towns) {
        if (!town || seen.has(town)) continue;
        seen.add(town);
        fromTrips.push(town);
      }
    }
    const filter = (td.areas ?? []).filter(Boolean);
    if (filter.length === 0) return fromTrips;
    if (filter.length === 1 && filter[0] === TOWN_FILTER_NONE) return [];
    const allow = new Set(filter.filter((a) => a !== TOWN_FILTER_NONE));
    return fromTrips.filter((t) => allow.has(t));
  }
  return [...(td.areas ?? [])].filter((a) => a && a !== TOWN_FILTER_NONE);
}

/** Trip ids that have 2+ active trucks assigned today. */
export function sharedTripIds(
  truckDay: TruckDay[],
  trucks: { id: string; active: boolean }[],
): string[] {
  const active = new Set(trucks.filter((t) => t.active).map((t) => t.id));
  const count = new Map<string, number>();
  for (const td of truckDay) {
    if (!active.has(td.truckId)) continue;
    for (const id of tripIdsForTruckDay(td)) {
      count.set(id, (count.get(id) ?? 0) + 1);
    }
  }
  return [...count.entries()].filter(([, n]) => n >= 2).map(([id]) => id);
}

/** Comma-separated trip names for a truck today. */
export function tripNamesForTruckDay(
  td: TruckDay | undefined,
  trips: Trip[],
): string | null {
  const names = tripIdsForTruckDay(td)
    .map((id) => tripById(trips, id)?.name)
    .filter(Boolean);
  return names.length > 0 ? names.join(", ") : null;
}

/**
 * Resolve which assigned trip an invoice belongs to (by town).
 * Falls back to sole assigned trip when area is empty or unmatched.
 */
export function tripIdForInvoice(
  invoice: { area: string },
  truckDay: TruckDay | undefined,
  trips: Trip[],
): string | null {
  const ids = tripIdsForTruckDay(truckDay);
  if (ids.length === 0) return null;
  if (invoice.area) {
    for (const id of ids) {
      const trip = tripById(trips, id);
      if (trip?.towns.includes(invoice.area)) return id;
    }
  }
  return ids.length === 1 ? ids[0] : null;
}

/** Unique towns for the plan day: prefer selected tripIds, else truck trips, else plan.areas. */
export function townsForPlan(plan: Plan | undefined, trips: Trip[]): string[] {
  if (!plan) return [];
  const set = new Set<string>();
  const tripIds = plan.tripIds ?? [];
  if (tripIds.length > 0) {
    for (const id of tripIds) {
      const trip = trips.find((t) => t.id === id);
      if (trip) for (const town of trip.towns) if (town) set.add(town);
    }
  } else {
    for (const td of plan.truckDay ?? []) {
      for (const town of townsForTruckDay(td, trips)) set.add(town);
    }
  }
  if (set.size === 0) {
    for (const a of plan.areas ?? []) {
      if (a) set.add(a);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Derive sorted unique town list from trip id list. */
export function townsFromTripIds(tripIds: string[], trips: Trip[]): string[] {
  const set = new Set<string>();
  for (const id of tripIds) {
    const trip = trips.find((t) => t.id === id);
    if (trip) for (const town of trip.towns) if (town) set.add(town);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function tripById(trips: Trip[], id: string | null | undefined): Trip | undefined {
  if (!id) return undefined;
  return trips.find((t) => t.id === id);
}

export function normalizeTrip(raw: Partial<Trip> & { id: string; name: string }): Trip {
  const stopOrder: Record<string, number> = {};
  if (raw.stopOrder && typeof raw.stopOrder === "object" && !Array.isArray(raw.stopOrder)) {
    for (const [k, v] of Object.entries(raw.stopOrder)) {
      const n = typeof v === "number" ? v : Number(v);
      if (k && Number.isFinite(n) && n >= 1) stopOrder[k] = Math.floor(n);
    }
  }
  return {
    id: raw.id,
    name: raw.name.trim() || "Untitled trip",
    towns: Array.isArray(raw.towns) ? raw.towns.filter(Boolean) : [],
    stopOrder,
  };
}
