export type Truck = {
  id: string;
  name: string;
  maxWeight: number;
  active: boolean;
};

export type CustomerMemory = {
  /** Unique customer / account code from ERP or master list */
  code: string;
  name: string;
  defaultArea: string;
  /** 0 = unset; otherwise 1..n within defaultArea */
  loadingNumber: number;
  firstSeen: string;
  /** Customer typically collects — invoices default to collection (customer collects) */
  collection?: boolean;
};

export type InvoiceSource = "SYSTEM" | "ADHOC";

export type Invoice = {
  id: string;
  doc: string;
  customer: string;
  weight: number; // 0 means unset
  area: string; // "" means unset
  source: InvoiceSource;
  truckId: string | null; // null = unallocated
  /** 1 = first trip, 2 = second round for the same truck */
  round: number;
  /** Town not on today's trips, but delivering today anyway */
  exception?: boolean;
  /** Collection stop (not a normal delivery) */
  collection?: boolean;
  /** Credit note — stays in Credit notes until loaded on a truck; weight may be negative */
  creditNote?: boolean;
  /** Free-text note for Adjust / load sheet (this day only) */
  comment?: string;
};

/** Warehouse-scoped invoice waiting for a day when its town is on a trip */
export type HeldInvoice = {
  id: string;
  doc: string;
  customer: string;
  weight: number;
  area: string;
  source: InvoiceSource;
  heldAt: string;
  reason: "town_not_on_trips" | "manual" | "collection" | "credit_note";
  /** Marked as a collection (stays in Held until picked / cleared) */
  collection?: boolean;
  /** Credit note waiting in the held pool */
  creditNote?: boolean;
};

export type Trip = {
  id: string;
  name: string;
  /** Ordered town names from the area/town catalog */
  towns: string[];
  /** Customer key → load # for this trip only (overrides town Load #) */
  stopOrder: Record<string, number>;
};

export type TruckDay = {
  truckId: string;
  /** @deprecated use tripIds */
  tripId?: string | null;
  /** Assigned named trips for the day */
  tripIds?: string[];
  /** Which trip this truck's Round 2 run is for (from today's selected trips) */
  round2TripId?: string | null;
  /**
   * Legacy multi-select towns. Used only when no trips are assigned.
   * @deprecated prefer tripIds
   */
  areas?: string[];
};

export type Plan = {
  date: string; // YYYY-MM-DD (tomorrow by default)
  /** Towns derived from tripIds (or legacy truck assignments) */
  areas: string[];
  /** Trips selected for the day in Step 1 (before truck pairing) */
  tripIds: string[];
  truckDay: TruckDay[]; // per truck today's trip (assigned in Step 3)
  invoices: Invoice[];
  /**
   * Day-only stop order overrides from Adjust.
   * tripId → customerKey → load #. Does not mutate Admin trip templates.
   */
  dayStopOrder: Record<string, Record<string, number>>;
  /**
   * Day-only drag order from Adjust (customer keys).
   * Does not renumber Load # or touch Admin trip templates.
   */
  dayStopSequence: Record<string, string[]>;
  locked: boolean;
  createdAt: string;
  step: PlanStep;
};

/** Normalize plan.dayStopOrder from JSON / legacy plans. */
export function normalizeDayStopOrder(
  raw: unknown,
): Record<string, Record<string, number>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, Record<string, number>> = {};
  for (const [tripId, map] of Object.entries(raw as Record<string, unknown>)) {
    if (!tripId || !map || typeof map !== "object" || Array.isArray(map)) continue;
    const stopOrder: Record<string, number> = {};
    for (const [k, v] of Object.entries(map as Record<string, unknown>)) {
      const n = typeof v === "number" ? v : Number(v);
      if (k && Number.isFinite(n) && n >= 1) stopOrder[k] = Math.floor(n);
    }
    if (Object.keys(stopOrder).length) out[tripId] = stopOrder;
  }
  return out;
}

/** Normalize plan.dayStopSequence from JSON / legacy plans. */
export function normalizeDayStopSequence(
  raw: unknown,
): Record<string, string[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [tripId, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!tripId || !Array.isArray(list)) continue;
    const keys = list
      .map((k) => (typeof k === "string" ? k.trim() : ""))
      .filter(Boolean);
    if (keys.length) out[tripId] = keys;
  }
  return out;
}

export type PlanStep = "setup" | "import" | "allocate" | "adjust" | "lock" | "print";

export type AuditEntry = {
  id: string;
  ts: string;
  type: string;
  message: string;
  payload?: unknown;
};

/** Normalize TruckDay — supports legacy tripId, tripIds[], and areas[] */
export function normalizeTruckDay(raw: {
  truckId: string;
  tripId?: string | null;
  tripIds?: string[];
  round2TripId?: string | null;
  areas?: string[];
  area?: string;
}): TruckDay {
  let tripIds: string[] = [];
  if (Array.isArray(raw.tripIds) && raw.tripIds.length > 0) {
    tripIds = [...new Set(raw.tripIds.filter(Boolean))];
  } else if (raw.tripId) {
    tripIds = [raw.tripId];
  }
  let areas: string[] = [];
  if (Array.isArray(raw.areas)) {
    areas = raw.areas.filter(Boolean);
  } else if (typeof raw.area === "string" && raw.area) {
    areas = [raw.area];
  }
  return {
    truckId: raw.truckId,
    tripId: tripIds[0] ?? null,
    tripIds,
    round2TripId: raw.round2TripId ?? null,
    areas,
  };
}

export function normalizeCustomer(raw: Partial<CustomerMemory> & { name: string }): CustomerMemory {
  return {
    code: typeof raw.code === "string" ? raw.code.trim() : "",
    name: raw.name,
    defaultArea: raw.defaultArea ?? "",
    loadingNumber: typeof raw.loadingNumber === "number" ? raw.loadingNumber : 0,
    firstSeen: raw.firstSeen ?? new Date().toISOString(),
    collection: !!raw.collection,
  };
}

export function normalizeInvoice(raw: Partial<Invoice> & Pick<Invoice, "id" | "doc" | "customer">): Invoice {
  const onTruck = raw.truckId != null && raw.truckId !== "";
  const creditNote =
    raw.creditNote !== undefined
      ? !!raw.creditNote
      : !onTruck && typeof raw.weight === "number" && raw.weight < 0;
  return {
    id: raw.id,
    doc: raw.doc,
    customer: raw.customer,
    weight: raw.weight ?? 0,
    area: raw.area ?? "",
    source: raw.source ?? "SYSTEM",
    truckId: raw.truckId ?? null,
    round: raw.round === 2 ? 2 : 1,
    exception: !!raw.exception,
    collection: !!raw.collection,
    creditNote,
    comment: typeof raw.comment === "string" ? raw.comment : "",
  };
}

export function normalizeHeldInvoice(
  raw: Partial<HeldInvoice> & Pick<HeldInvoice, "id" | "doc" | "customer">,
): HeldInvoice {
  const creditNote =
    raw.creditNote !== undefined
      ? !!raw.creditNote
      : raw.reason === "credit_note" ||
        (typeof raw.weight === "number" && raw.weight < 0 && raw.creditNote !== false);
  const reason: HeldInvoice["reason"] =
    raw.reason === "manual"
      ? "manual"
      : raw.reason === "credit_note" || (creditNote && raw.reason !== "collection" && !raw.collection)
        ? "credit_note"
        : raw.reason === "collection" || raw.collection
          ? "collection"
          : "town_not_on_trips";
  return {
    id: raw.id,
    doc: raw.doc,
    customer: raw.customer,
    weight: raw.weight ?? 0,
    area: raw.area ?? "",
    source: raw.source ?? "SYSTEM",
    heldAt: raw.heldAt ?? new Date().toISOString(),
    reason,
    collection: reason === "collection" || !!raw.collection,
    creditNote: reason === "credit_note" || creditNote,
  };
}
