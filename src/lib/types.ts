export type Truck = {
  id: string;
  name: string;
  maxWeight: number;
  active: boolean;
};

export type CustomerMemory = {
  name: string;
  defaultArea: string;
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
};

export type TruckDay = {
  truckId: string;
  area: string;
};

export type Plan = {
  date: string; // YYYY-MM-DD (tomorrow by default)
  areas: string[];
  truckDay: TruckDay[]; // per truck today's area
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
