import type {
  AuditEntry,
  CustomerMemory,
  HeldInvoice,
  Plan,
  Trip,
  Truck,
  TruckDay,
} from "./types";
import { normalizeCustomer, normalizeDayStopOrder, normalizeDayStopSequence, normalizeHeldInvoice, normalizeInvoice, normalizeTruckDay } from "./types";
import { customerKey } from "./customers";
import { normalizeTrip } from "./trips";
import { getSupabase, isCloudConfigured } from "./supabase";
import { loadKey, saveKey } from "./db";

const MIGRATED_KEY = "lp:cloudMigrated";
const DIRTY_KEY = "lp:cloudDirty";
const LAST_SYNC_KEY = "lp:lastCloudSyncAt";
const PLAN_HYDRATE_DAYS = 60;
const PLAN_FULL_HYDRATE_DAYS = 7;
const AUDIT_KEEP_COUNT = 5000;
const UPSERT_CHUNK = 250;

export type CloudSnapshot = {
  trucks: Truck[];
  trips: Trip[];
  customers: Record<string, CustomerMemory>;
  areaHistory: string[];
  heldInvoices: HeldInvoice[];
  plans: Record<string, Plan>;
  audit: AuditEntry[];
  currentDate: string;
  adminPin: string;
};

export type CloudStatus = "offline" | "local" | "cloud" | "error";

export type DirtySlice =
  | "trucks"
  | "trips"
  | "customers"
  | "areas"
  | "plans"
  | "settings"
  | "audit";

type DirtyFlags = {
  slices: Set<DirtySlice>;
  planDates: Set<string>;
  deletedPlanDates: Set<string>;
  deletedTruckIds: Set<string>;
  deletedTripIds: Set<string>;
  deletedCustomerIds: Set<string>;
  pendingAuditIds: Set<string>;
  pruneAudit: boolean;
};

type DirtyPersisted = {
  slices: DirtySlice[];
  planDates: string[];
  deletedPlanDates: string[];
  deletedTruckIds: string[];
  deletedTripIds: string[];
  deletedCustomerIds: string[];
  pendingAuditIds: string[];
  pruneAudit: boolean;
};

function emptyDirty(): DirtyFlags {
  return {
    slices: new Set(),
    planDates: new Set(),
    deletedPlanDates: new Set(),
    deletedTruckIds: new Set(),
    deletedTripIds: new Set(),
    deletedCustomerIds: new Set(),
    pendingAuditIds: new Set(),
    pruneAudit: false,
  };
}

function dirtyHasWork(f: DirtyFlags): boolean {
  return (
    f.slices.size > 0 ||
    f.deletedPlanDates.size > 0 ||
    f.deletedTruckIds.size > 0 ||
    f.deletedTripIds.size > 0 ||
    f.deletedCustomerIds.size > 0 ||
    f.pendingAuditIds.size > 0 ||
    f.pruneAudit
  );
}

function serializeDirty(f: DirtyFlags): DirtyPersisted {
  return {
    slices: [...f.slices],
    planDates: [...f.planDates],
    deletedPlanDates: [...f.deletedPlanDates],
    deletedTruckIds: [...f.deletedTruckIds],
    deletedTripIds: [...f.deletedTripIds],
    deletedCustomerIds: [...f.deletedCustomerIds],
    pendingAuditIds: [...f.pendingAuditIds],
    pruneAudit: f.pruneAudit,
  };
}

function deserializeDirty(raw: DirtyPersisted | null | undefined): DirtyFlags {
  if (!raw) return emptyDirty();
  const f = emptyDirty();
  for (const s of raw.slices ?? []) f.slices.add(s);
  for (const d of raw.planDates ?? []) f.planDates.add(d);
  for (const d of raw.deletedPlanDates ?? []) f.deletedPlanDates.add(d);
  for (const id of raw.deletedTruckIds ?? []) f.deletedTruckIds.add(id);
  for (const id of raw.deletedTripIds ?? []) f.deletedTripIds.add(id);
  for (const id of raw.deletedCustomerIds ?? []) f.deletedCustomerIds.add(id);
  for (const id of raw.pendingAuditIds ?? []) f.pendingAuditIds.add(id);
  f.pruneAudit = !!raw.pruneAudit;
  return f;
}

let dirty = emptyDirty();
let queuedDirty = emptyDirty();
/** Flags currently being written to cloud — must stay in DIRTY_KEY until ack. */
let inFlightDirty = emptyDirty();
let dirtyPersistTail: Promise<void> = Promise.resolve();

function scheduleDirtyPersist(): void {
  const snapshot = serializeDirty(
    mergeDirty(mergeDirty(dirty, queuedDirty), inFlightDirty),
  );
  dirtyPersistTail = dirtyPersistTail.then(async () => {
    if (
      snapshot.slices.length === 0 &&
      snapshot.deletedPlanDates.length === 0 &&
      snapshot.deletedTruckIds.length === 0 &&
      snapshot.deletedTripIds.length === 0 &&
      snapshot.deletedCustomerIds.length === 0 &&
      snapshot.pendingAuditIds.length === 0 &&
      !snapshot.pruneAudit
    ) {
      await saveKey(DIRTY_KEY, null);
    } else {
      await saveKey(DIRTY_KEY, snapshot);
    }
  });
}

export function markDirty(
  slices: DirtySlice[],
  opts?: {
    planDate?: string;
    planDates?: string[];
    deletedPlanDate?: string;
    deletedTruckId?: string;
    deletedTripId?: string;
    deletedCustomerId?: string;
    auditId?: string;
    pruneAudit?: boolean;
  },
): void {
  for (const s of slices) dirty.slices.add(s);
  if (opts?.planDate) dirty.planDates.add(opts.planDate);
  if (opts?.planDates) for (const d of opts.planDates) dirty.planDates.add(d);
  if (opts?.deletedPlanDate) dirty.deletedPlanDates.add(opts.deletedPlanDate);
  if (opts?.deletedTruckId) dirty.deletedTruckIds.add(opts.deletedTruckId);
  if (opts?.deletedTripId) dirty.deletedTripIds.add(opts.deletedTripId);
  if (opts?.deletedCustomerId) dirty.deletedCustomerIds.add(opts.deletedCustomerId);
  if (opts?.auditId) dirty.pendingAuditIds.add(opts.auditId);
  if (opts?.pruneAudit) dirty.pruneAudit = true;
  scheduleDirtyPersist();
}

export function markAllDirty(snapshot?: CloudSnapshot): void {
  for (const s of [
    "trucks",
    "trips",
    "customers",
    "areas",
    "plans",
    "settings",
    "audit",
  ] as DirtySlice[]) {
    dirty.slices.add(s);
  }
  if (snapshot) {
    for (const d of Object.keys(snapshot.plans)) dirty.planDates.add(d);
    for (const a of snapshot.audit.slice(0, 5000)) dirty.pendingAuditIds.add(a.id);
  }
  scheduleDirtyPersist();
}

export function isPlanDeletePending(date: string): boolean {
  return (
    dirty.deletedPlanDates.has(date) ||
    queuedDirty.deletedPlanDates.has(date) ||
    inFlightDirty.deletedPlanDates.has(date)
  );
}

function takeDirty(): DirtyFlags {
  const taken = dirty;
  dirty = emptyDirty();
  // Do NOT persist here — caller merges into queuedDirty/inFlightDirty first,
  // otherwise DIRTY_KEY briefly loses delete tombstones mid-sync.
  return taken;
}

function mergeDirty(a: DirtyFlags, b: DirtyFlags): DirtyFlags {
  const out = emptyDirty();
  for (const s of a.slices) out.slices.add(s);
  for (const s of b.slices) out.slices.add(s);
  for (const d of a.planDates) out.planDates.add(d);
  for (const d of b.planDates) out.planDates.add(d);
  for (const d of a.deletedPlanDates) out.deletedPlanDates.add(d);
  for (const d of b.deletedPlanDates) out.deletedPlanDates.add(d);
  for (const id of a.deletedTruckIds) out.deletedTruckIds.add(id);
  for (const id of b.deletedTruckIds) out.deletedTruckIds.add(id);
  for (const id of a.deletedTripIds) out.deletedTripIds.add(id);
  for (const id of b.deletedTripIds) out.deletedTripIds.add(id);
  for (const id of a.deletedCustomerIds) out.deletedCustomerIds.add(id);
  for (const id of b.deletedCustomerIds) out.deletedCustomerIds.add(id);
  for (const id of a.pendingAuditIds) out.pendingAuditIds.add(id);
  for (const id of b.pendingAuditIds) out.pendingAuditIds.add(id);
  out.pruneAudit = a.pruneAudit || b.pruneAudit;
  return out;
}

function emptySnapshot(currentDate: string): CloudSnapshot {
  return {
    trucks: [],
    trips: [],
    customers: {},
    areaHistory: [],
    heldInvoices: [],
    plans: {},
    audit: [],
    currentDate,
    adminPin: "",
  };
}

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function loadLastSyncAt(): Promise<string | null> {
  return loadKey<string | null>(LAST_SYNC_KEY, null);
}

async function saveLastSyncAt(iso: string): Promise<void> {
  await saveKey(LAST_SYNC_KEY, iso);
}

async function clearLastSyncAt(): Promise<void> {
  await saveKey(LAST_SYNC_KEY, null);
}

function planHasBody(p: Plan): boolean {
  return p.invoices.length > 0 || p.areas.length > 0 || p.truckDay.length > 0;
}

function isPlanStub(p: Plan): boolean {
  return !planHasBody(p);
}

function mergePlanSafe(local: Plan | undefined, remote: Plan): Plan {
  if (local && planHasBody(local) && isPlanStub(remote)) return local;
  return remote;
}

function shouldLoadFullPlan(date: string, currentDate: string, activeDate: string): boolean {
  if (date === currentDate || date === activeDate) return true;
  return date >= daysAgoISO(PLAN_FULL_HYDRATE_DAYS);
}

function planStubFromRow(row: {
  date: string;
  locked?: boolean;
  created_at?: string;
  step?: Plan["step"];
}): Plan {
  return {
    date: row.date,
    areas: [],
    tripIds: [],
    truckDay: [],
    invoices: [],
    dayStopOrder: {},
    dayStopSequence: {},
    locked: !!row.locked,
    createdAt: row.created_at ?? new Date().toISOString(),
    step: row.step ?? "setup",
  };
}

function planFromFullRow(row: {
  date: string;
  areas?: string[];
  trip_ids?: string[];
  truck_day?: TruckDay[];
  invoices?: Plan["invoices"];
  locked?: boolean;
  created_at?: string;
  step?: Plan["step"];
  day_stop_order?: unknown;
  day_stop_sequence?: unknown;
}): Plan {
  return normalizePlans({
    [row.date]: {
      date: row.date,
      areas: row.areas ?? [],
      tripIds: Array.isArray(row.trip_ids) ? row.trip_ids ?? [] : [],
      truckDay: row.truck_day ?? [],
      invoices: row.invoices ?? [],
      dayStopOrder: normalizeDayStopOrder(row.day_stop_order),
      dayStopSequence: normalizeDayStopSequence(row.day_stop_sequence),
      locked: !!row.locked,
      createdAt: row.created_at ?? new Date().toISOString(),
      step: row.step ?? "setup",
    },
  })[row.date];
}

function mergeTrucksById(
  local: Truck[],
  remote: Truck[],
  remoteIds: Set<string>,
): Truck[] {
  const byId = new Map(local.map((t) => [t.id, t]));
  for (const t of remote) byId.set(t.id, t);
  return [...byId.values()].filter((t) => remoteIds.has(t.id));
}

function mergeTripsById(local: Trip[], remote: Trip[], remoteIds: Set<string>): Trip[] {
  const byId = new Map(local.map((t) => [t.id, t]));
  for (const t of remote) byId.set(t.id, normalizeTrip(t));
  return [...byId.values()].filter((t) => remoteIds.has(t.id)).map((t) => normalizeTrip(t));
}

function mergeCustomersById(
  local: Record<string, CustomerMemory>,
  remote: Record<string, CustomerMemory>,
  remoteIds: Set<string>,
): Record<string, CustomerMemory> {
  const out = { ...local };
  for (const [id, c] of Object.entries(remote)) {
    if (remoteIds.has(id)) out[id] = c;
  }
  for (const id of Object.keys(out)) {
    if (!remoteIds.has(id)) delete out[id];
  }
  return out;
}

function mergePlansByDate(
  local: Record<string, Plan>,
  remote: Record<string, Plan>,
  remoteIds: Set<string>,
  cutoff: string,
  currentDate: string,
): Record<string, Plan> {
  const out = { ...local };
  for (const [date, p] of Object.entries(remote)) {
    if (!remoteIds.has(date)) continue;
    out[date] = mergePlanSafe(out[date], p);
  }
  for (const date of Object.keys(out)) {
    if (date >= cutoff && date !== currentDate && !remoteIds.has(date)) {
      delete out[date];
    }
  }
  return out;
}

type PlanSelectTier = "full" | "stub";

const PLAN_SELECT_FULL =
  "date,areas,truck_day,invoices,locked,created_at,step,trip_ids,day_stop_order,day_stop_sequence";
const PLAN_SELECT_MID = "date,areas,truck_day,invoices,locked,created_at,step,trip_ids,day_stop_order";
const PLAN_SELECT_TRIP = "date,areas,truck_day,invoices,locked,created_at,step,trip_ids";
const PLAN_SELECT_BASE = "date,areas,truck_day,invoices,locked,created_at,step";
const PLAN_SELECT_STUB = "date,locked,created_at,step";

async function queryPlans(
  tier: PlanSelectTier,
  filters: {
    gteDate?: string;
    ltDate?: string;
    eqDate?: string;
    gtUpdatedAt?: string;
  } = {},
): Promise<unknown[]> {
  const sb = getSupabase()!;
  const selects =
    tier === "stub"
      ? [PLAN_SELECT_STUB]
      : [PLAN_SELECT_FULL, PLAN_SELECT_MID, PLAN_SELECT_TRIP, PLAN_SELECT_BASE];
  for (const sel of selects) {
    let q = sb.from("plans").select(sel);
    if (filters.gteDate) q = q.gte("date", filters.gteDate);
    if (filters.ltDate) q = q.lt("date", filters.ltDate);
    if (filters.eqDate) q = q.eq("date", filters.eqDate);
    if (filters.gtUpdatedAt) q = q.gt("updated_at", filters.gtUpdatedAt);
    const { data, error } = await q;
    if (!error) return data ?? [];
    if (!/day_stop_sequence|day_stop_order|trip_ids|schema cache|does not exist/i.test(error.message)) {
      throw error;
    }
  }
  return [];
}

function rowsToPlans(rows: unknown[], tier: PlanSelectTier): Record<string, Plan> {
  const plans: Record<string, Plan> = {};
  for (const row of rows) {
    const r = row as Parameters<typeof planFromFullRow>[0];
    plans[r.date] = tier === "stub" ? planStubFromRow(r) : planFromFullRow(r);
  }
  return plans;
}

function normalizePlans(raw: Record<string, Plan>): Record<string, Plan> {
  const plans: Record<string, Plan> = {};
  for (const [date, p] of Object.entries(raw ?? {})) {
    const tripIds = Array.isArray(p.tripIds)
      ? p.tripIds.filter((id): id is string => typeof id === "string" && !!id)
      : [];
    plans[date] = {
      ...p,
      date: p.date ?? date,
      tripIds,
      areas: Array.isArray(p.areas) ? p.areas : [],
      truckDay: (p.truckDay ?? []).map((td) =>
        normalizeTruckDay(td as TruckDay & { area?: string }),
      ),
      invoices: (p.invoices ?? []).map((i) =>
        normalizeInvoice(i as Parameters<typeof normalizeInvoice>[0]),
      ),
      dayStopOrder: normalizeDayStopOrder(
        (p as Plan & { day_stop_order?: unknown }).dayStopOrder ??
          (p as Plan & { day_stop_order?: unknown }).day_stop_order,
      ),
      dayStopSequence: normalizeDayStopSequence(
        (p as Plan & { day_stop_sequence?: unknown }).dayStopSequence ??
          (p as Plan & { day_stop_sequence?: unknown }).day_stop_sequence,
      ),
    };
  }
  return plans;
}

function normalizeCustomers(
  raw: Record<string, CustomerMemory>,
): Record<string, CustomerMemory> {
  const customers: Record<string, CustomerMemory> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    const c = normalizeCustomer({ ...v, name: v?.name ?? k, code: v?.code ?? "" });
    customers[customerKey(c) || k] = c;
  }
  return customers;
}

function normalizeHeldInvoices(raw: HeldInvoice[] | null | undefined): HeldInvoice[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h) => h && typeof h.doc === "string" && typeof h.customer === "string")
    .map((h) =>
      normalizeHeldInvoice({
        id: h.id || Math.random().toString(36).slice(2),
        doc: h.doc,
        customer: h.customer,
        weight: h.weight,
        area: h.area,
        source: h.source,
        heldAt: h.heldAt,
        reason: h.reason,
        collection: h.collection,
        creditNote: h.creditNote,
      }),
    );
}

async function upsertInChunks(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<void> {
  const sb = getSupabase();
  if (!sb || rows.length === 0) return;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await sb.from(table).upsert(chunk as never, { onConflict });
    if (error) throw error;
  }
}

/** Load snapshot from IndexedDB cache. */
export async function loadLocalSnapshot(): Promise<CloudSnapshot> {
  const [
    trucks,
    tripsRaw,
    customersRaw,
    areaHistory,
    heldRaw,
    plansRaw,
    audit,
    currentDate,
    adminPin,
  ] = await Promise.all([
    loadKey<Truck[]>("lp:trucks", []),
    loadKey<Trip[]>("lp:trips", []),
    loadKey<Record<string, CustomerMemory>>("lp:customers", {}),
    loadKey<string[]>("lp:areaHistory", []),
    loadKey<HeldInvoice[]>("lp:heldInvoices", []),
    loadKey<Record<string, Plan>>("lp:plans", {}),
    loadKey<AuditEntry[]>("lp:audit", []),
    loadKey<string>("lp:currentDate", tomorrowISO()),
    loadKey<string>("lp:adminPin", ""),
  ]);
  return {
    trucks,
    trips: (tripsRaw ?? []).map((t) => normalizeTrip(t)),
    customers: normalizeCustomers(customersRaw),
    areaHistory,
    heldInvoices: normalizeHeldInvoices(heldRaw),
    plans: normalizePlans(plansRaw),
    audit,
    currentDate,
    adminPin,
  };
}

/** Write snapshot to IndexedDB cache. */
export async function saveLocalSnapshot(s: CloudSnapshot): Promise<void> {
  await Promise.all([
    saveKey("lp:trucks", s.trucks),
    saveKey("lp:trips", s.trips),
    saveKey("lp:customers", s.customers),
    saveKey("lp:areaHistory", s.areaHistory),
    saveKey("lp:heldInvoices", s.heldInvoices ?? []),
    saveKey("lp:plans", s.plans),
    saveKey("lp:audit", s.audit),
    saveKey("lp:currentDate", s.currentDate),
    saveKey("lp:adminPin", s.adminPin),
  ]);
}

function snapshotHasData(s: CloudSnapshot): boolean {
  return (
    s.trucks.length > 0 ||
    s.trips.length > 0 ||
    Object.keys(s.customers).length > 0 ||
    s.areaHistory.length > 0 ||
    (s.heldInvoices?.length ?? 0) > 0 ||
    Object.keys(s.plans).length > 0
  );
}

function cloudHasData(s: CloudSnapshot): boolean {
  return snapshotHasData(s);
}

/** Fetch a single plan day from cloud (older dates outside hydrate window). */
export async function fetchPlanFromCloud(date: string): Promise<Plan | null> {
  const sb = getSupabase();
  if (!sb) return null;
  let { data, error } = await sb
    .from("plans")
    .select(
      "date,areas,truck_day,invoices,locked,created_at,step,trip_ids,day_stop_order,day_stop_sequence",
    )
    .eq("date", date)
    .maybeSingle();
  if (error && /day_stop_sequence|schema cache|does not exist/i.test(error.message)) {
    const mid = await sb
      .from("plans")
      .select("date,areas,truck_day,invoices,locked,created_at,step,trip_ids,day_stop_order")
      .eq("date", date)
      .maybeSingle();
    data = mid.data as typeof data;
    error = mid.error;
  }
  if (error && /day_stop_order|schema cache|does not exist/i.test(error.message)) {
    const mid = await sb
      .from("plans")
      .select("date,areas,truck_day,invoices,locked,created_at,step,trip_ids")
      .eq("date", date)
      .maybeSingle();
    data = mid.data as typeof data;
    error = mid.error;
  }
  if (error && /trip_ids|schema cache|does not exist/i.test(error.message)) {
    const fallback = await sb
      .from("plans")
      .select("date,areas,truck_day,invoices,locked,created_at,step")
      .eq("date", date)
      .maybeSingle();
    data = fallback.data as typeof data;
    error = fallback.error;
  }
  if (error || !data) return null;
  const row = data as {
    date: string;
    areas?: string[];
    trip_ids?: string[];
    truck_day?: TruckDay[];
    invoices?: Plan["invoices"];
    locked?: boolean;
    created_at?: string;
    step?: Plan["step"];
    day_stop_order?: unknown;
    day_stop_sequence?: unknown;
  };
  return normalizePlans({
    [date]: {
      date: row.date,
      areas: row.areas ?? [],
      tripIds: Array.isArray(row.trip_ids) ? row.trip_ids ?? [] : [],
      truckDay: row.truck_day ?? [],
      invoices: row.invoices ?? [],
      dayStopOrder: normalizeDayStopOrder(row.day_stop_order),
      dayStopSequence: normalizeDayStopSequence(row.day_stop_sequence),
      locked: !!row.locked,
      createdAt: row.created_at ?? new Date().toISOString(),
      step: row.step ?? "setup",
    },
  })[date];
}

/** Lightweight plan index for Admin Plans (no invoices JSON). */
export async function listPlanIndexFromCloud(): Promise<
  { date: string; locked: boolean; createdAt: string; step: Plan["step"] }[]
> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("plans")
    .select("date,locked,created_at,step")
    .order("date", { ascending: false });
  if (error || !data) return [];
  return data.map((row) => ({
    date: row.date,
    locked: !!row.locked,
    createdAt: row.created_at ?? new Date().toISOString(),
    step: (row.step as Plan["step"]) ?? "setup",
  }));
}

type HydratePhase = "A" | "B" | "all";

type HydrateFromCloudOpts = {
  force?: boolean;
  phase?: HydratePhase;
  base?: CloudSnapshot;
  local?: CloudSnapshot;
};

async function fetchTripsFromCloud(lastSync: string | null, force: boolean) {
  const sb = getSupabase()!;
  let tripsRes = await sb.from("trips").select("id,name,towns,stop_order,updated_at");
  if (tripsRes.error && /stop_order|schema cache|does not exist/i.test(tripsRes.error.message)) {
    let q = sb.from("trips").select("id,name,towns,updated_at");
    if (lastSync && !force) q = q.gt("updated_at", lastSync);
    tripsRes = await q;
  } else if (lastSync && !force) {
    tripsRes = await sb
      .from("trips")
      .select("id,name,towns,stop_order,updated_at")
      .gt("updated_at", lastSync);
  }
  return tripsRes;
}

async function fetchPlansForHydrate(
  currentDate: string,
  activeDate: string,
  lastSync: string | null,
  force: boolean,
): Promise<Record<string, Plan>> {
  const cutoff = daysAgoISO(PLAN_HYDRATE_DAYS);
  const fullCutoff = daysAgoISO(PLAN_FULL_HYDRATE_DAYS);

  if (lastSync && !force) {
    const changed = await queryPlans("full", { gtUpdatedAt: lastSync });
    const plans: Record<string, Plan> = {};
    for (const row of changed) {
      const r = row as Parameters<typeof planFromFullRow>[0];
      if (shouldLoadFullPlan(r.date, currentDate, activeDate)) {
        plans[r.date] = planFromFullRow(r);
      } else if (r.date >= cutoff) {
        plans[r.date] = planStubFromRow(r);
      }
    }
    return plans;
  }

  const [fullRows, stubRows] = await Promise.all([
    queryPlans("full", { gteDate: fullCutoff }),
    queryPlans("stub", { gteDate: cutoff, ltDate: fullCutoff }),
  ]);

  const plans = {
    ...rowsToPlans(stubRows, "stub"),
    ...rowsToPlans(fullRows, "full"),
  };

  const needExtra = new Set<string>();
  if (activeDate < cutoff || !plans[activeDate]) needExtra.add(activeDate);
  if (!plans[currentDate]) needExtra.add(currentDate);

  for (const date of needExtra) {
    if (plans[date] && planHasBody(plans[date])) continue;
    const extra = await queryPlans("full", { eqDate: date });
    if (extra.length) {
      plans[date] = planFromFullRow(extra[0] as Parameters<typeof planFromFullRow>[0]);
    }
  }

  return plans;
}

async function fetchPlanStubsInWindow(existing: Record<string, Plan>): Promise<Record<string, Plan>> {
  const cutoff = daysAgoISO(PLAN_HYDRATE_DAYS);
  const stubRows = await queryPlans("stub", { gteDate: cutoff });
  const stubs = rowsToPlans(stubRows, "stub");
  for (const [date, stub] of Object.entries(stubs)) {
    const existingPlan = existing[date];
    if (existingPlan && planHasBody(existingPlan)) continue;
    stubs[date] = mergePlanSafe(existingPlan, stub);
  }
  return stubs;
}

/** Fetch warehouse state from Lovable Cloud (full, or phased A/B). */
export async function hydrateFromCloud(
  opts?: HydrateFromCloudOpts,
): Promise<CloudSnapshot | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const phase = opts?.phase ?? "all";
  const force = !!opts?.force;
  const local = opts?.local ?? emptySnapshot(tomorrowISO());
  const lastSync = force ? null : await loadLastSyncAt();
  const cutoff = daysAgoISO(PLAN_HYDRATE_DAYS);

  if (phase === "B" && opts?.base) {
    const base = opts.base;
    const [customersRes, auditRes, stubPlans] = await Promise.all([
      (async () => {
        let q = sb
          .from("customers")
          .select("id,code,name,default_area,loading_number,first_seen,collection,updated_at");
        if (lastSync && !force) q = q.gt("updated_at", lastSync);
        let res = await q;
        if (res.error && /collection|schema cache|does not exist/i.test(res.error.message)) {
          let fq = sb
            .from("customers")
            .select("id,code,name,default_area,loading_number,first_seen,updated_at");
          if (lastSync && !force) fq = fq.gt("updated_at", lastSync);
          res = await fq;
        }
        return res;
      })(),
      sb
        .from("audit_entries")
        .select("id,ts,type,message")
        .order("ts", { ascending: false })
        .limit(AUDIT_KEEP_COUNT),
      fetchPlanStubsInWindow(base.plans),
    ]);

    if (customersRes.error) throw customersRes.error;
    if (auditRes.error) throw auditRes.error;

    const remoteCustomers: Record<string, CustomerMemory> = {};
    for (const row of customersRes.data ?? []) {
      const c = normalizeCustomer({
        code: row.code ?? "",
        name: row.name,
        defaultArea: row.default_area ?? "",
        loadingNumber: row.loading_number ?? 0,
        firstSeen: row.first_seen ?? new Date().toISOString(),
        collection: !!(row as { collection?: boolean }).collection,
      });
      remoteCustomers[row.id || customerKey(c)] = c;
    }

    let customers = remoteCustomers;
    if (lastSync && !force) {
      const { data: idRows, error: idErr } = await sb.from("customers").select("id");
      if (idErr) throw idErr;
      const remoteIds = new Set((idRows ?? []).map((r) => r.id));
      customers = mergeCustomersById(local.customers, remoteCustomers, remoteIds);
    }

    const audit: AuditEntry[] = (auditRes.data ?? []).map((a) => ({
      id: a.id,
      ts: a.ts,
      type: a.type,
      message: a.message,
    }));

    const plans = { ...base.plans, ...stubPlans };
    for (const [date, p] of Object.entries(stubPlans)) {
      plans[date] = mergePlanSafe(base.plans[date], p);
    }

    return { ...base, customers, audit, plans };
  }

  const tripsRes = await fetchTripsFromCloud(lastSync, force);

  let trucksQuery = sb.from("trucks").select("id,name,max_weight,active,updated_at");
  if (lastSync && !force) trucksQuery = trucksQuery.gt("updated_at", lastSync);

  const [areasRes, trucksRes, settingsRes] = await Promise.all([
    sb.from("areas").select("name"),
    trucksQuery,
    sb.from("app_settings").select("active_date,admin_pin,held_invoices").eq("id", 1).maybeSingle(),
  ]);

  const settingsMissingHeldCol =
    !!settingsRes.error && /held_invoices|schema cache|does not exist/i.test(settingsRes.error.message);

  let settingsData = settingsRes.data as
    | { active_date?: string; admin_pin?: string; held_invoices?: HeldInvoice[] | null }
    | null;

  if (settingsMissingHeldCol) {
    const fallback = await sb
      .from("app_settings")
      .select("active_date,admin_pin")
      .eq("id", 1)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    settingsData = fallback.data;
  } else if (settingsRes.error) {
    throw settingsRes.error;
  }

  const activeDate = settingsData?.active_date || tomorrowISO();
  const currentDate = local.currentDate || activeDate;

  let plans: Record<string, Plan> = {};
  let customers: Record<string, CustomerMemory> = {};
  let audit: AuditEntry[] = [];

  if (phase === "all") {
    const [customersRes, auditRes] = await Promise.all([
      (async () => {
        let res = await sb
          .from("customers")
          .select("id,code,name,default_area,loading_number,first_seen,collection");
        if (lastSync && !force) {
          let q = sb
            .from("customers")
            .select("id,code,name,default_area,loading_number,first_seen,collection,updated_at")
            .gt("updated_at", lastSync);
          res = await q;
        }
        if (res.error && /collection|schema cache|does not exist/i.test(res.error.message)) {
          let fq = sb.from("customers").select("id,code,name,default_area,loading_number,first_seen");
          if (lastSync && !force) fq = fq.gt("updated_at", lastSync);
          res = await fq;
        }
        return res;
      })(),
      sb
        .from("audit_entries")
        .select("id,ts,type,message")
        .order("ts", { ascending: false })
        .limit(AUDIT_KEEP_COUNT),
    ]);
    if (customersRes.error) throw customersRes.error;
    if (auditRes.error) throw auditRes.error;

    for (const row of customersRes.data ?? []) {
      const c = normalizeCustomer({
        code: row.code ?? "",
        name: row.name,
        defaultArea: row.default_area ?? "",
        loadingNumber: row.loading_number ?? 0,
        firstSeen: row.first_seen ?? new Date().toISOString(),
        collection: !!(row as { collection?: boolean }).collection,
      });
      customers[row.id || customerKey(c)] = c;
    }
    if (lastSync && !force) {
      const { data: idRows, error: idErr } = await sb.from("customers").select("id");
      if (idErr) throw idErr;
      const remoteIds = new Set((idRows ?? []).map((r) => r.id));
      customers = mergeCustomersById(local.customers, customers, remoteIds);
    }

    audit = (auditRes.data ?? []).map((a) => ({
      id: a.id,
      ts: a.ts,
      type: a.type,
      message: a.message,
    }));
  }

  plans = await fetchPlansForHydrate(currentDate, activeDate, lastSync, force);

  if (lastSync && !force) {
    const { data: idRows, error: idErr } = await sb.from("plans").select("date").gte("date", cutoff);
    if (idErr) throw idErr;
    const remoteIds = new Set((idRows ?? []).map((r) => r.date));
    plans = mergePlansByDate(local.plans, plans, remoteIds, cutoff, currentDate);
  }

  const tripsTableMissing =
    !!tripsRes.error && /does not exist|schema cache/i.test(tripsRes.error.message);
  const tripsError = tripsRes.error && !tripsTableMissing ? tripsRes.error : null;

  const firstError = areasRes.error || trucksRes.error || tripsError;
  if (firstError) throw firstError;

  let trucks: Truck[] = (trucksRes.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    maxWeight: Number(t.max_weight) || 0,
    active: !!t.active,
  }));

  if (lastSync && !force) {
    const { data: idRows, error: idErr } = await sb.from("trucks").select("id");
    if (idErr) throw idErr;
    const remoteIds = new Set((idRows ?? []).map((r) => r.id));
    trucks = mergeTrucksById(local.trucks, trucks, remoteIds);
  }

  let trips: Trip[] = tripsTableMissing
    ? []
    : (tripsRes.data ?? []).map((t) => {
        const row = t as { id: string; name: string; towns: unknown; stop_order?: unknown };
        return normalizeTrip({
          id: row.id,
          name: row.name,
          towns: Array.isArray(row.towns) ? (row.towns as string[]) : [],
          stopOrder:
            row.stop_order && typeof row.stop_order === "object" && !Array.isArray(row.stop_order)
              ? (row.stop_order as Record<string, number>)
              : {},
        });
      });

  if (lastSync && !force && !tripsTableMissing) {
    const { data: idRows, error: idErr } = await sb.from("trips").select("id");
    if (idErr) throw idErr;
    const remoteIds = new Set((idRows ?? []).map((r) => r.id));
    trips = mergeTripsById(local.trips, trips, remoteIds);
  }

  const snapshot: CloudSnapshot = {
    trucks,
    trips,
    customers,
    areaHistory: (areasRes.data ?? []).map((a) => a.name).sort((a, b) => a.localeCompare(b)),
    heldInvoices: normalizeHeldInvoices(settingsData?.held_invoices),
    plans,
    audit,
    currentDate: activeDate,
    adminPin: settingsData?.admin_pin ?? "",
  };

  if (phase === "A") {
    return {
      ...snapshot,
      customers: local.customers,
      audit: local.audit.length ? local.audit : snapshot.audit,
    };
  }

  return snapshot;
}

async function syncAreas(s: CloudSnapshot): Promise<void> {
  const sb = getSupabase()!;
  const { data: existingAreas, error: areasReadErr } = await sb.from("areas").select("name");
  if (areasReadErr) throw areasReadErr;
  const wantAreas = new Set(s.areaHistory.filter(Boolean));
  if (wantAreas.size === 0 && (existingAreas?.length ?? 0) > 0) return;
  const haveAreas = new Set((existingAreas ?? []).map((a) => a.name));
  const areasToDelete = [...haveAreas].filter((n) => !wantAreas.has(n));
  if (areasToDelete.length) {
    const { error } = await sb.from("areas").delete().in("name", areasToDelete);
    if (error) throw error;
  }
  if (wantAreas.size) {
    const { error } = await sb
      .from("areas")
      .upsert([...wantAreas].map((name) => ({ name })), { onConflict: "name" });
    if (error) throw error;
  }
}

async function syncTrucks(s: CloudSnapshot, now: string, flags: DirtyFlags): Promise<void> {
  const sb = getSupabase()!;
  const explicitDeletes = [...flags.deletedTruckIds];

  if (s.trucks.length === 0) {
    // Never wipe the whole table — only honor explicit deletes (e.g. last truck removed).
    if (explicitDeletes.length) {
      const { error } = await sb.from("trucks").delete().in("id", explicitDeletes);
      if (error) throw error;
    }
    return;
  }

  const { data: existingTrucks, error: trucksReadErr } = await sb.from("trucks").select("id");
  if (trucksReadErr) throw trucksReadErr;
  const wantTruckIds = new Set(s.trucks.map((t) => t.id));
  const trucksToDelete = [
    ...new Set([
      ...explicitDeletes,
      ...(existingTrucks ?? []).map((t) => t.id).filter((id) => !wantTruckIds.has(id)),
    ]),
  ];
  if (trucksToDelete.length) {
    const { error } = await sb.from("trucks").delete().in("id", trucksToDelete);
    if (error) throw error;
  }
  await upsertInChunks(
    "trucks",
    s.trucks.map((t) => ({
      id: t.id,
      name: t.name,
      max_weight: t.maxWeight,
      active: t.active,
      updated_at: now,
    })),
    "id",
  );
}

async function syncTrips(s: CloudSnapshot, now: string, flags: DirtyFlags): Promise<void> {
  const sb = getSupabase()!;
  const explicitDeletes = [...flags.deletedTripIds];

  if (s.trips.length === 0) {
    if (explicitDeletes.length) {
      const { error } = await sb.from("trips").delete().in("id", explicitDeletes);
      if (error && !/does not exist|schema cache/i.test(error.message)) throw error;
      // Schema-cache / missing table: don't pretend the delete succeeded
      if (error) throw error;
    }
    return;
  }

  const { data: existingTrips, error: tripsReadErr } = await sb.from("trips").select("id");
  // Never treat "can't read trips" as a successful sync — that clears dirty and resurrects deletes
  if (tripsReadErr) throw tripsReadErr;
  const wantTripIds = new Set(s.trips.map((t) => t.id));
  const tripsToDelete = [
    ...new Set([
      ...explicitDeletes,
      ...(existingTrips ?? []).map((t) => t.id).filter((id) => !wantTripIds.has(id)),
    ]),
  ];
  if (tripsToDelete.length) {
    const { error } = await sb.from("trips").delete().in("id", tripsToDelete);
    if (error) throw error;
  }
  try {
    await upsertInChunks(
      "trips",
      s.trips.map((t) => ({
        id: t.id,
        name: t.name,
        towns: t.towns,
        stop_order: t.stopOrder ?? {},
        updated_at: now,
      })),
      "id",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/stop_order|schema cache|does not exist/i.test(msg)) {
      await upsertInChunks(
        "trips",
        s.trips.map((t) => ({
          id: t.id,
          name: t.name,
          towns: t.towns,
          updated_at: now,
        })),
        "id",
      );
    } else {
      throw err;
    }
  }
}

async function syncCustomers(s: CloudSnapshot, now: string, flags: DirtyFlags): Promise<void> {
  const sb = getSupabase()!;
  const ids = Object.keys(s.customers);
  const explicitDeletes = [...flags.deletedCustomerIds];

  if (ids.length === 0) {
    if (explicitDeletes.length) {
      for (let i = 0; i < explicitDeletes.length; i += UPSERT_CHUNK) {
        const chunk = explicitDeletes.slice(i, i + UPSERT_CHUNK);
        const { error } = await sb.from("customers").delete().in("id", chunk);
        if (error) throw error;
      }
    }
    return;
  }

  const { data: existingCustomers, error: custReadErr } = await sb.from("customers").select("id");
  if (custReadErr) throw custReadErr;
  const wantCustIds = new Set(ids);
  const custToDelete = [
    ...new Set([
      ...explicitDeletes,
      ...(existingCustomers ?? []).map((c) => c.id).filter((id) => !wantCustIds.has(id)),
    ]),
  ];
  for (let i = 0; i < custToDelete.length; i += UPSERT_CHUNK) {
    const chunk = custToDelete.slice(i, i + UPSERT_CHUNK);
    const { error } = await sb.from("customers").delete().in("id", chunk);
    if (error) throw error;
  }
  const withCollection = Object.entries(s.customers).map(([id, c]) => ({
    id,
    code: c.code ?? "",
    name: c.name,
    default_area: c.defaultArea ?? "",
    loading_number: c.loadingNumber ?? 0,
    collection: !!c.collection,
    first_seen: c.firstSeen || now,
    updated_at: now,
  }));
  try {
    await upsertInChunks("customers", withCollection, "id");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/collection|schema cache|does not exist/i.test(msg)) throw err;
    await upsertInChunks(
      "customers",
      withCollection.map(({ collection: _c, ...rest }) => rest),
      "id",
    );
  }
}

async function syncPlans(s: CloudSnapshot, now: string, flags: DirtyFlags): Promise<void> {
  const sb = getSupabase()!;
  const dates = flags.planDates.size > 0 ? [...flags.planDates] : Object.keys(s.plans);
  if (dates.length === 0 && flags.deletedPlanDates.size === 0) return;

  if (flags.deletedPlanDates.size > 0) {
    const { error } = await sb.from("plans").delete().in("date", [...flags.deletedPlanDates]);
    if (error) throw error;
  }

  const planRows = dates
    .map((d) => s.plans[d])
    .filter(Boolean)
    .map((p) => ({
      date: p.date,
      areas: p.areas ?? [],
      trip_ids: p.tripIds ?? [],
      day_stop_order: p.dayStopOrder ?? {},
      day_stop_sequence: p.dayStopSequence ?? {},
      truck_day: p.truckDay ?? [],
      invoices: p.invoices ?? [],
      locked: !!p.locked,
      created_at: p.createdAt || now,
      step: p.step || "setup",
      updated_at: now,
    }));
  if (planRows.length) {
    try {
      await upsertInChunks("plans", planRows, "date");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/day_stop_sequence|schema cache|does not exist/i.test(msg)) {
        try {
          await upsertInChunks(
            "plans",
            planRows.map(({ day_stop_sequence: _s, ...rest }) => rest),
            "date",
          );
        } catch (err2) {
          const msg2 = err2 instanceof Error ? err2.message : String(err2);
          if (/day_stop_order|schema cache|does not exist/i.test(msg2)) {
            try {
              await upsertInChunks(
                "plans",
                planRows.map(({ day_stop_sequence: _s, day_stop_order: _d, ...rest }) => rest),
                "date",
              );
            } catch (err3) {
              const msg3 = err3 instanceof Error ? err3.message : String(err3);
              if (!/trip_ids|schema cache|does not exist/i.test(msg3)) throw err3;
              await upsertInChunks(
                "plans",
                planRows.map(
                  ({ day_stop_sequence: _s, day_stop_order: _d, trip_ids: _t, ...rest }) => rest,
                ),
                "date",
              );
            }
          } else if (!/trip_ids|schema cache|does not exist/i.test(msg2)) {
            throw err2;
          } else {
            await upsertInChunks(
              "plans",
              planRows.map(
                ({ day_stop_sequence: _s, day_stop_order: _d, trip_ids: _t, ...rest }) => rest,
              ),
              "date",
            );
          }
        }
      } else if (/day_stop_order|schema cache|does not exist/i.test(msg)) {
        try {
          await upsertInChunks(
            "plans",
            planRows.map(({ day_stop_order: _d, day_stop_sequence: _s, ...rest }) => rest),
            "date",
          );
        } catch (err2) {
          const msg2 = err2 instanceof Error ? err2.message : String(err2);
          if (!/trip_ids|schema cache|does not exist/i.test(msg2)) throw err2;
          await upsertInChunks(
            "plans",
            planRows.map(
              ({ day_stop_order: _d, day_stop_sequence: _s, trip_ids: _t, ...rest }) => rest,
            ),
            "date",
          );
        }
      } else if (!/trip_ids|schema cache|does not exist/i.test(msg)) {
        throw err;
      } else {
        await upsertInChunks(
          "plans",
          planRows.map(
            ({ trip_ids: _t, day_stop_order: _d, day_stop_sequence: _s, ...rest }) => rest,
          ),
          "date",
        );
      }
    }
  }
}

async function syncAuditAppend(s: CloudSnapshot, flags: DirtyFlags): Promise<void> {
  const sb = getSupabase()!;
  const pending = s.audit.filter((a) => flags.pendingAuditIds.has(a.id));
  if (pending.length) {
    await upsertInChunks(
      "audit_entries",
      pending.map((a) => ({
        id: a.id,
        ts: a.ts,
        type: a.type,
        message: a.message,
        payload: a.payload ?? null,
      })),
      "id",
    );
  }
  if (!flags.pruneAudit) return;

  const { error: rpcErr } = await sb.rpc("prune_audit_entries", {
    keep_count: AUDIT_KEEP_COUNT,
  });
  if (!rpcErr) return;

  if (!/prune_audit_entries|schema cache|does not exist|42883/i.test(rpcErr.message)) {
    throw rpcErr;
  }

  const { data: allAudit, error: listErr } = await sb
    .from("audit_entries")
    .select("id,ts")
    .order("ts", { ascending: false });
  if (listErr) throw listErr;
  const keep = new Set((allAudit ?? []).slice(0, AUDIT_KEEP_COUNT).map((a) => a.id));
  const drop = (allAudit ?? []).map((a) => a.id).filter((id) => !keep.has(id));
  for (let i = 0; i < drop.length; i += UPSERT_CHUNK) {
    const chunk = drop.slice(i, i + UPSERT_CHUNK);
    const { error } = await sb.from("audit_entries").delete().in("id", chunk);
    if (error) throw error;
  }
}

async function syncSettings(s: CloudSnapshot, now: string): Promise<void> {
  const sb = getSupabase()!;
  const { error: settingsErr } = await sb.from("app_settings").upsert(
    {
      id: 1,
      active_date: s.currentDate,
      admin_pin: s.adminPin ?? "",
      held_invoices: s.heldInvoices ?? [],
      updated_at: now,
    },
    { onConflict: "id" },
  );
  if (settingsErr) {
    // Do not fall back to writing settings without held_invoices — that would
    // clear dirty flags while leaving deleted held invoices alive in cloud.
    throw settingsErr;
  }
}

export async function persistToCloud(s: CloudSnapshot, flags?: DirtyFlags): Promise<void> {
  if (!getSupabase()) return;

  let f = flags;
  if (!f || f.slices.size === 0) {
    markAllDirty(s);
    f = takeDirty();
  }
  if (f.slices.size === 0) return;

  const now = new Date().toISOString();
  const tasks: Promise<void>[] = [];
  if (f.slices.has("areas")) tasks.push(syncAreas(s));
  if (f.slices.has("trucks")) tasks.push(syncTrucks(s, now, f));
  if (f.slices.has("trips")) tasks.push(syncTrips(s, now, f));
  if (f.slices.has("customers")) tasks.push(syncCustomers(s, now, f));
  if (f.slices.has("plans")) tasks.push(syncPlans(s, now, f));
  if (f.slices.has("settings")) tasks.push(syncSettings(s, now));
  await Promise.all(tasks);
  if (f.slices.has("audit")) await syncAuditAppend(s, f);
}

function mergeCloudWithLocal(cloud: CloudSnapshot, local: CloudSnapshot): CloudSnapshot {
  // Only restore trucks/trips from local when cloud is empty (accidental wipe recovery).
  // Do NOT re-add local-only ids when cloud has data — that resurrects intentional deletes.
  const trips =
    cloud.trips.length === 0 && local.trips.length > 0
      ? local.trips.map((t) => normalizeTrip(t))
      : cloud.trips.map((t) => normalizeTrip(t));

  const trucks =
    cloud.trucks.length === 0 && local.trucks.length > 0 ? local.trucks : cloud.trucks;

  // Keep local plan days outside the hydrate window; within the window, cloud wins
  // (so deletes that synced to cloud stay deleted).
  const cutoff = daysAgoISO(PLAN_HYDRATE_DAYS);
  const plans = { ...cloud.plans };
  for (const [d, p] of Object.entries(local.plans)) {
    if (plans[d]) continue;
    if (d < cutoff && d !== cloud.currentDate) plans[d] = p;
  }

  // Prefer cloud order; keep local payloads when hydrate omitted them.
  const auditById = new Map(cloud.audit.map((a) => [a.id, a]));
  for (const a of local.audit) {
    const existing = auditById.get(a.id);
    if (!existing) auditById.set(a.id, a);
    else if (existing.payload === undefined && a.payload !== undefined) {
      auditById.set(a.id, { ...existing, payload: a.payload });
    }
  }
  const audit = [...auditById.values()]
    .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
    .slice(0, 5000);

  return { ...cloud, trips, trucks, plans, audit };
}

export async function hydrateWarehouse(opts?: {
  preferLocal?: boolean;
  force?: boolean;
}): Promise<{
  snapshot: CloudSnapshot;
  status: CloudStatus;
  migrated: boolean;
  runPhaseB?: () => Promise<CloudSnapshot>;
}> {
  const local = await loadLocalSnapshot();
  const savedDirty = deserializeDirty(await loadKey<DirtyPersisted | null>(DIRTY_KEY, null));
  if (dirtyHasWork(savedDirty)) {
    dirty = mergeDirty(dirty, savedDirty);
  }

  if (opts?.preferLocal) {
    const status: CloudStatus =
      !isCloudConfigured()
        ? "local"
        : typeof navigator !== "undefined" && !navigator.onLine
          ? "offline"
          : "cloud";
    return { snapshot: local, status, migrated: false };
  }

  if (!isCloudConfigured()) {
    return { snapshot: local, status: "local", migrated: false };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { snapshot: local, status: "offline", migrated: false };
  }

  if (opts?.force) {
    await clearLastSyncAt();
  }

  // Pending local deletes/edits survived reload — push local first so cloud doesn't resurrect them.
  if (dirtyHasWork(dirty)) {
    const flags = takeDirty();
    inFlightDirty = mergeDirty(inFlightDirty, flags);
    scheduleDirtyPersist();
    try {
      await persistToCloud(local, flags);
      inFlightDirty = emptyDirty();
      await saveKey(DIRTY_KEY, null);
      await saveLocalSnapshot(local);
      await saveLastSyncAt(new Date().toISOString());
      return { snapshot: local, status: "cloud", migrated: false };
    } catch (err) {
      console.error("Pending cloud sync failed on hydrate", err);
      inFlightDirty = emptyDirty();
      dirty = mergeDirty(dirty, flags);
      scheduleDirtyPersist();
      return { snapshot: local, status: "error", migrated: false };
    }
  }

  try {
    const fetchedA = await hydrateFromCloud({
      force: opts?.force,
      phase: "A",
      local,
    });
    if (!fetchedA) {
      return { snapshot: local, status: "local", migrated: false };
    }

    let cloud: CloudSnapshot = fetchedA;
    const migratedFlag = await loadKey<boolean>(MIGRATED_KEY, false);
    let migrated = false;

    if (!cloudHasData(cloud) && snapshotHasData(local) && !migratedFlag) {
      markAllDirty(local);
      await persistToCloud(local, takeDirty());
      await saveKey(MIGRATED_KEY, true);
      await saveKey(DIRTY_KEY, null);
      cloud = local;
      migrated = true;
    } else if (cloudHasData(cloud) && !migratedFlag) {
      await saveKey(MIGRATED_KEY, true);
    }

    const needsRecovery =
      (cloud.trips.length === 0 && local.trips.length > 0) ||
      (cloud.trucks.length === 0 && local.trucks.length > 0);

    cloud = mergeCloudWithLocal(cloud, local);

    if (needsRecovery) {
      try {
        markAllDirty(cloud);
        await persistToCloud(cloud, takeDirty());
        await saveKey(DIRTY_KEY, null);
      } catch (err) {
        console.error("Failed to re-push recovered trips/trucks", err);
      }
    }

    await saveLocalSnapshot(cloud);

    const runPhaseB = async (): Promise<CloudSnapshot> => {
      const fetchedB = await hydrateFromCloud({
        force: opts?.force,
        phase: "B",
        base: cloud,
        local,
      });
      if (!fetchedB) return cloud;
      const full = mergeCloudWithLocal(fetchedB, local);
      await saveLastSyncAt(new Date().toISOString());
      await saveLocalSnapshot(full);
      return full;
    };

    return { snapshot: cloud, status: "cloud", migrated, runPhaseB };
  } catch (err) {
    console.error("Cloud hydrate failed, using local cache", err);
    return { snapshot: local, status: "error", migrated: false };
  }
}

let persistInFlight = false;
let persistTail: Promise<CloudStatus> = Promise.resolve("local");
let queuedSnapshot: CloudSnapshot | null = null;
let queuedGeneration = 0;
// queuedDirty declared earlier for scheduleDirtyPersist
let lastSyncedGeneration = 0;
let latestGeneration = 0;

export function bumpSyncGeneration(): number {
  latestGeneration += 1;
  return latestGeneration;
}

export function isWarehouseDirty(): boolean {
  return (
    latestGeneration > lastSyncedGeneration ||
    persistInFlight ||
    queuedSnapshot !== null ||
    dirtyHasWork(dirty) ||
    dirtyHasWork(queuedDirty) ||
    dirtyHasWork(inFlightDirty)
  );
}

/** Human-readable summary of pending dirty slices for sync tooltips. */
export function getDirtySummary(): string {
  const f = mergeDirty(mergeDirty(dirty, queuedDirty), inFlightDirty);
  if (!dirtyHasWork(f) && latestGeneration <= lastSyncedGeneration && !persistInFlight) {
    return "";
  }
  const parts: string[] = [];
  if (f.slices.has("trucks") || f.deletedTruckIds.size) parts.push("trucks");
  if (f.slices.has("trips") || f.deletedTripIds.size) parts.push("trips");
  if (f.slices.has("customers") || f.deletedCustomerIds.size) parts.push("customers");
  if (f.slices.has("areas")) parts.push("towns");
  if (f.slices.has("plans") || f.planDates.size || f.deletedPlanDates.size) {
    const dates = [...f.planDates, ...f.deletedPlanDates].slice(0, 2);
    parts.push(dates.length ? `plan ${dates.join(", ")}` : "plans");
  }
  if (f.slices.has("settings")) parts.push("settings");
  if (f.slices.has("audit") || f.pendingAuditIds.size) parts.push("audit");
  if (parts.length === 0 && (persistInFlight || latestGeneration > lastSyncedGeneration)) {
    return "Pending changes…";
  }
  return parts.length ? `Saving ${parts.join(", ")}…` : "";
}

async function persistToCloudIfNeeded(
  s: CloudSnapshot,
  flags: DirtyFlags,
): Promise<CloudStatus> {
  if (!isCloudConfigured()) return "local";
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";

  try {
    await persistToCloud(s, flags);
    // Caller clears inFlightDirty after this returns; only wipe DIRTY_KEY when
    // nothing else (including this in-flight batch) is pending.
    if (
      !dirtyHasWork(dirty) &&
      !dirtyHasWork(queuedDirty) &&
      !dirtyHasWork(inFlightDirty)
    ) {
      await saveKey(DIRTY_KEY, null);
    } else {
      scheduleDirtyPersist();
    }
    return "cloud";
  } catch (err) {
    console.error("Cloud persist failed", err);
    dirty = mergeDirty(dirty, flags);
    scheduleDirtyPersist();
    return "error";
  }
}

export async function persistWarehouse(
  s: CloudSnapshot,
  generation?: number,
  opts?: { skipLocal?: boolean; skipCloud?: boolean },
): Promise<CloudStatus> {
  const gen = generation ?? bumpSyncGeneration();
  latestGeneration = Math.max(latestGeneration, gen);

  if (!opts?.skipLocal) {
    await saveLocalSnapshot(s);
  }

  // Local-only write: keep dirty flags for the cloud debounce.
  if (opts?.skipCloud) {
    if (!isCloudConfigured()) return "local";
    if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
    return latestGeneration > lastSyncedGeneration ? "local" : "cloud";
  }

  const flags = takeDirty();
  queuedSnapshot = s;
  queuedGeneration = gen;
  queuedDirty = mergeDirty(queuedDirty, flags);
  // Persist tombstones immediately so a reload mid-sync can't resurrect deletes
  scheduleDirtyPersist();

  const runQueue = async (): Promise<CloudStatus> => {
    let status: CloudStatus = "local";
    while (queuedSnapshot) {
      const snap = queuedSnapshot;
      const snapGen = queuedGeneration;
      const snapDirty = queuedDirty;
      queuedSnapshot = null;
      queuedDirty = emptyDirty();
      inFlightDirty = mergeDirty(inFlightDirty, snapDirty);
      scheduleDirtyPersist();
      persistInFlight = true;
      try {
        status = await persistToCloudIfNeeded(snap, snapDirty);
        if (status === "cloud" && snapGen >= lastSyncedGeneration) {
          lastSyncedGeneration = snapGen;
        }
      } finally {
        // On error, flags were restored into `dirty` by persistToCloudIfNeeded
        inFlightDirty = emptyDirty();
        scheduleDirtyPersist();
        persistInFlight = false;
      }
    }
    return status;
  };

  persistTail = persistTail.then(runQueue, runQueue);
  return persistTail;
}

export function requestAuditPrune(): void {
  markDirty(["audit"], { pruneAudit: true });
}

export { emptySnapshot, isCloudConfigured };
