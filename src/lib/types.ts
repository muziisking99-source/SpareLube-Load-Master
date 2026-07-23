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
};

export type Trip = {
  id: string;
  name: string;
  /** Ordered town names from the area/town catalog */
  towns: string[];
};

export type TruckDay = {
  truckId: string;
  /** Assigned named trip for the day */
  tripId: string | null;
  /**
   * Legacy multi-select towns. Used only when tripId is null.
   * @deprecated prefer tripId
   */
  areas?: string[];
};

export type Plan = {
  date: string; // YYYY-MM-DD (tomorrow by default)
  areas: string[];
  truckDay: TruckDay[]; // per truck today's trip
  invoices: Invoice[];
  locked: boolean;
  createdAt: string;
  step: PlanStep;
};

export type PlanStep = "setup" | "import" | "allocate" | "adjust" | "lock" | "print";

export type AuditEntry = {
  id: string;
  ts: string;
  type: string;
  message: string;
  payload?: unknown;
};

/** Normalize TruckDay — supports legacy area / areas and optional tripId */
export function normalizeTruckDay(raw: {
  truckId: string;
  tripId?: string | null;
  areas?: string[];
  area?: string;
}): TruckDay {
  const tripId = raw.tripId ?? null;
  let areas: string[] = [];
  if (Array.isArray(raw.areas)) {
    areas = raw.areas.filter(Boolean);
  } else if (typeof raw.area === "string" && raw.area) {
    areas = [raw.area];
  }
  return { truckId: raw.truckId, tripId, areas };
}

export function normalizeCustomer(raw: Partial<CustomerMemory> & { name: string }): CustomerMemory {
  return {
    code: typeof raw.code === "string" ? raw.code.trim() : "",
    name: raw.name,
    defaultArea: raw.defaultArea ?? "",
    loadingNumber: typeof raw.loadingNumber === "number" ? raw.loadingNumber : 0,
    firstSeen: raw.firstSeen ?? new Date().toISOString(),
  };
}

export function normalizeInvoice(raw: Partial<Invoice> & Pick<Invoice, "id" | "doc" | "customer">): Invoice {
  return {
    id: raw.id,
    doc: raw.doc,
    customer: raw.customer,
    weight: raw.weight ?? 0,
    area: raw.area ?? "",
    source: raw.source ?? "SYSTEM",
    truckId: raw.truckId ?? null,
    round: raw.round === 2 ? 2 : 1,
  };
}
