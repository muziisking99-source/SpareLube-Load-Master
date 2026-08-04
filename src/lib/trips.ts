import type { Plan, Trip, TruckDay } from "./types";

/** Towns for a truck today: prefer assigned trip, else legacy areas[]. */
export function townsForTruckDay(
  td: TruckDay | undefined,
  trips: Trip[],
): string[] {
  if (!td) return [];
  if (td.tripId) {
    const trip = trips.find((t) => t.id === td.tripId);
    if (trip) return [...trip.towns];
  }
  return [...(td.areas ?? [])].filter(Boolean);
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
