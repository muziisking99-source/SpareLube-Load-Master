import type { Trip, TruckDay } from "./types";

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

export function tripById(trips: Trip[], id: string | null | undefined): Trip | undefined {
  if (!id) return undefined;
  return trips.find((t) => t.id === id);
}

export function normalizeTrip(raw: Partial<Trip> & { id: string; name: string }): Trip {
  return {
    id: raw.id,
    name: raw.name.trim() || "Untitled trip",
    towns: Array.isArray(raw.towns) ? raw.towns.filter(Boolean) : [],
  };
}
