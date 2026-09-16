import type {
  AuditEntry,
  CustomerMemory,
  HeldInvoice,
  Plan,
  Trip,
  Truck,
  TruckDay,
} from "./types";
import { normalizeCustomer, normalizeDayStopOrder, normalizeDayStopSequence, normalizeHeldInvoice, normalizeInvoice, normalizeSheetLetter, normalizeTruckDay } from "./types";
import { customerKey } from "./customers";
import { normalizeTrip } from "./trips";
import { getSupabase, isCloudConfigured } from "./supabase";
import { loadKey, saveKey, saveKeySoft } from "./db";

/** Thrown when cloud rejects a plan write because another client saved first. */
export class PlanSyncConflictError extends Error {
  dates: string[];
  remotes: Record<string, Plan>;
  constructor(dates: string[], remotes: Record<string, Plan>) {
    super(`Plan conflict on ${dates.join(", ")}`);
    this.name = "PlanSyncConflictError";
    this.dates = dates;
    this.remotes = remotes;
  }
}

/** Thrown when upsert would silently drop columns — keep dirty, do not claim Saved. */
export class SchemaOutdatedError extends Error {
  constructor(detail?: string) {
    super(
      detail
        ? `Cloud schema outdated — run migrations (${detail})`
        : "Cloud schema outdated — run migrations",
    );
    this.name = "SchemaOutdatedError";
  }
}

/** Dates the user confirmed may overwrite a newer cloud plan. */
const forceOverwritePlanDates = new Set<string>();
let lastPlanConflict: { dates: string[]; remotes: Record<string, Plan> } | null = null;
let lastSyncedPlanVersions: Record<string, number> = {};
/** Cloud plans silently adopted when local version lagged (non-current / bulk heal). */
let lastAdoptedPlans: Record<string, Plan> = {};
let lastPersistErrorMessage = "";

export function forcePlanOverwrite(dates: string[]): void {
  for (const d of dates) forceOverwritePlanDates.add(d);
}

export function takePlanConflict(): {
  dates: string[];
  remotes: Record<string, Plan>;
} | null {
  const c = lastPlanConflict;
  lastPlanConflict = null;
  return c;
}

export function takeSyncedPlanVersions(): Record<string, number> {
  const v = lastSyncedPlanVersions;
  lastSyncedPlanVersions = {};
  return v;
}

export function takeAdoptedPlans(): Record<string, Plan> {
  const v = lastAdoptedPlans;
  lastAdoptedPlans = {};
  return v;
}

export function takePersistErrorMessage(): string {
  const m = lastPersistErrorMessage;
  lastPersistErrorMessage = "";
  return m;
}

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

export type CloudStatus = "offline" | "local" | "cloud" | "error" | "conflict";

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
  deletedAreaNames: Set<string>;
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
  deletedAreaNames: string[];
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
    deletedAreaNames: new Set(),
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
    f.deletedAreaNames.size > 0 ||
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
    deletedAreaNames: [...f.deletedAreaNames],
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
  for (const n of raw.deletedAreaNames ?? []) f.deletedAreaNames.add(n);
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
    try {
      if (
        snapshot.slices.length === 0 &&
        snapshot.deletedPlanDates.length === 0 &&
        snapshot.deletedTruckIds.length === 0 &&
        snapshot.deletedTripIds.length === 0 &&
        snapshot.deletedCustomerIds.length === 0 &&
        snapshot.deletedAreaNames.length === 0 &&
        snapshot.pendingAuditIds.length === 0 &&
        !snapshot.pruneAudit
      ) {
        await saveKey(DIRTY_KEY, null);
      } else {
        await saveKey(DIRTY_KEY, snapshot);
      }
    } catch (err) {
      console.error("Failed to persist dirty flags to IndexedDB", err);
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
    deletedAreaName?: string;
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
  if (opts?.deletedAreaName) dirty.deletedAreaNames.add(opts.deletedAreaName);
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
  for (const n of a.deletedAreaNames) out.deletedAreaNames.add(n);
  for (const n of b.deletedAreaNames) out.deletedAreaNames.add(n);
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
  await saveKeySoft(LAST_SYNC_KEY, iso);
}

async function clearLastSyncAt(): Promise<void> {
  await saveKeySoft(LAST_SYNC_KEY, null);
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
  version?: unknown;
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
    version: normalizePlanVersion(row.version),
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
  version?: unknown;
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
      version: normalizePlanVersion(row.version),
    },
  })[row.date];
}

function mergeTrucksById(
  local: Truck[],
  remote: Truck[],
  remoteIds: Set<string>,
): Truck[] {
  const byId = new Map(local.map((t) => [t.id, t]));
  for (const t of remote) {
    const prev = byId.get(t.id);
    // Preserve local sheetLetter when remote omitted it (column missing)
    if (prev?.sheetLetter && !t.sheetLetter) {
      byId.set(t.id, { ...t, sheetLetter: prev.sheetLetter });
    } else {
      byId.set(t.id, t);
    }
  }
  return [...byId.values()].filter((t) => remoteIds.has(t.id));
}

function mergeTripsById(local: Trip[], remote: Trip[], remoteIds: Set<string>): Trip[] {
  const byId = new Map(local.map((t) => [t.id, t]));
  for (const t of remote) {
    const prev = byId.get(t.id);
    const merged = normalizeTrip(t);
    // If cloud row has no stop_order (missing column / failed upsert), keep local load #s
    if (
      prev &&
      Object.keys(merged.stopOrder ?? {}).length === 0 &&
      Object.keys(prev.stopOrder ?? {}).length > 0
    ) {
      byId.set(t.id, normalizeTrip({ ...merged, stopOrder: prev.stopOrder }));
    } else {
      byId.set(t.id, merged);
    }
  }
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
  "date,areas,truck_day,invoices,locked,created_at,step,trip_ids,day_stop_order,day_stop_sequence,version,updated_at";
const PLAN_SELECT_FULL_NO_VER =
  "date,areas,truck_day,invoices,locked,created_at,step,trip_ids,day_stop_order,day_stop_sequence";
const PLAN_SELECT_MID = "date,areas,truck_day,invoices,locked,created_at,step,trip_ids,day_stop_order";
const PLAN_SELECT_TRIP = "date,areas,truck_day,invoices,locked,created_at,step,trip_ids";
const PLAN_SELECT_BASE = "date,areas,truck_day,invoices,locked,created_at,step";
const PLAN_SELECT_STUB = "date,locked,created_at,step,version";
const PLAN_SELECT_STUB_BASE = "date,locked,created_at,step";

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
      ? [PLAN_SELECT_STUB, PLAN_SELECT_STUB_BASE]
      : [PLAN_SELECT_FULL, PLAN_SELECT_FULL_NO_VER, PLAN_SELECT_MID, PLAN_SELECT_TRIP, PLAN_SELECT_BASE];
  for (const sel of selects) {
    let q = sb.from("plans").select(sel);
    if (filters.gteDate) q = q.gte("date", filters.gteDate);
    if (filters.ltDate) q = q.lt("date", filters.ltDate);
    if (filters.eqDate) q = q.eq("date", filters.eqDate);
    if (filters.gtUpdatedAt) q = q.gt("updated_at", filters.gtUpdatedAt);
    const { data, error } = await q;
    if (!error) return data ?? [];
    if (
      !/day_stop_sequence|day_stop_order|trip_ids|version|updated_at|schema cache|does not exist/i.test(
        error.message,
      )
    ) {
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
      version: normalizePlanVersion(
        (p as Plan & { version?: unknown }).version,
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
      "date,areas,truck_day,invoices,locked,created_at,step,trip_ids,day_stop_order,day_stop_sequence,version",
    )
    .eq("date", date)
    .maybeSingle();
  if (error && /version|schema cache|does not exist/i.test(error.message)) {
    const noVer = await sb
      .from("plans")
      .select(
        "date,areas,truck_day,invoices,locked,created_at,step,trip_ids,day_stop_order,day_stop_sequence",
      )
      .eq("date", date)
      .maybeSingle();
    data = noVer.data as typeof data;
    error = noVer.error;
  }
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
    version?: number;
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
      version: normalizePlanVersion(row.version),
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
    tripsRes = (await q) as typeof tripsRes;
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
          res = (await fq) as typeof res;
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

  let trucksQuery = sb.from("trucks").select("id,name,max_weight,active,sheet_letter,updated_at");
  if (lastSync && !force) trucksQuery = trucksQuery.gt("updated_at", lastSync);

  let trucksRes = await (async () => {
    const [areasRes, trucksQueryRes, settingsRes] = await Promise.all([
      sb.from("areas").select("name"),
      trucksQuery,
      sb.from("app_settings").select("active_date,admin_pin,held_invoices").eq("id", 1).maybeSingle(),
    ]);
    return { areasRes, trucksRes: trucksQueryRes, settingsRes };
  })();

  // Fallback if sheet_letter column missing
  if (
    trucksRes.trucksRes.error &&
    /sheet_letter|schema cache|does not exist/i.test(trucksRes.trucksRes.error.message)
  ) {
    let q = sb.from("trucks").select("id,name,max_weight,active,updated_at");
    if (lastSync && !force) q = q.gt("updated_at", lastSync);
    const fallback = await Promise.all([
      sb.from("areas").select("name"),
      q,
      sb.from("app_settings").select("active_date,admin_pin,held_invoices").eq("id", 1).maybeSingle(),
    ]);
    trucksRes = {
      areasRes: fallback[0],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      trucksRes: fallback[1] as any,
      settingsRes: fallback[2],
    };
  }

  const areasRes = trucksRes.areasRes;
  const trucksResFinal = trucksRes.trucksRes;
  const settingsRes = trucksRes.settingsRes;

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
          res = (await fq) as typeof res;
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

  const firstError = areasRes.error || trucksResFinal.error || tripsError;
  if (firstError) throw firstError;

  let trucks: Truck[] = (trucksResFinal.data ?? []).map((t) => {
    const row = t as {
      id: string;
      name: string;
      max_weight: number;
      active: boolean;
      sheet_letter?: string | null;
    };
    return {
      id: row.id,
      name: row.name,
      maxWeight: Number(row.max_weight) || 0,
      active: !!row.active,
      sheetLetter: normalizeSheetLetter(row.sheet_letter),
    };
  });

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

async function syncAreas(s: CloudSnapshot, flags: DirtyFlags): Promise<void> {
  const sb = getSupabase()!;
  const explicitDeletes = [...flags.deletedAreaNames];
  if (explicitDeletes.length) {
    const { error } = await sb.from("areas").delete().in("name", explicitDeletes);
    if (error) throw error;
  }
  const wantAreas = [...new Set(s.areaHistory.filter(Boolean))];
  if (wantAreas.length) {
    const { error } = await sb
      .from("areas")
      .upsert(
        wantAreas.map((name) => ({ name })),
        { onConflict: "name" },
      );
    if (error) throw error;
  }
}

async function syncTrucks(s: CloudSnapshot, now: string, flags: DirtyFlags): Promise<void> {
  const sb = getSupabase()!;
  const explicitDeletes = [...flags.deletedTruckIds];

  if (explicitDeletes.length) {
    const { error } = await sb.from("trucks").delete().in("id", explicitDeletes);
    if (error) throw error;
  }

  if (s.trucks.length === 0) return;

  try {
    await upsertInChunks(
      "trucks",
      s.trucks.map((t) => ({
        id: t.id,
        name: t.name,
        max_weight: t.maxWeight,
        active: t.active,
        sheet_letter: normalizeSheetLetter(t.sheetLetter),
        updated_at: now,
      })),
      "id",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/sheet_letter|schema cache|does not exist/i.test(msg)) {
      throw new SchemaOutdatedError("trucks.sheet_letter");
    }
    throw err;
  }
}

async function syncTrips(s: CloudSnapshot, now: string, flags: DirtyFlags): Promise<void> {
  const sb = getSupabase()!;
  const explicitDeletes = [...flags.deletedTripIds];

  if (explicitDeletes.length) {
    const { error } = await sb.from("trips").delete().in("id", explicitDeletes);
    if (error && !/does not exist|schema cache/i.test(error.message)) throw error;
    if (error) throw error;
  }

  if (s.trips.length === 0) return;

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
      throw new SchemaOutdatedError("trips.stop_order");
    }
    throw err;
  }
}

async function syncCustomers(s: CloudSnapshot, now: string, flags: DirtyFlags): Promise<void> {
  const sb = getSupabase()!;
  const ids = Object.keys(s.customers);
  const explicitDeletes = [...flags.deletedCustomerIds];

  if (explicitDeletes.length) {
    for (let i = 0; i < explicitDeletes.length; i += UPSERT_CHUNK) {
      const chunk = explicitDeletes.slice(i, i + UPSERT_CHUNK);
      const { error } = await sb.from("customers").delete().in("id", chunk);
      if (error) throw error;
    }
  }

  if (ids.length === 0) return;

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
    if (/collection|schema cache|does not exist/i.test(msg)) {
      throw new SchemaOutdatedError("customers.collection");
    }
    throw err;
  }
}

function planRowPayload(p: Plan, now: string, version: number) {
  return {
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
    version,
  };
}

/** Coerce plan version from JSON / PostgREST (number or numeric string). */
export function normalizePlanVersion(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

async function syncPlans(s: CloudSnapshot, now: string, flags: DirtyFlags): Promise<void> {
  const sb = getSupabase()!;
  // Only push explicitly dirty dates — never Object.keys(plans) (that conflict-spammed the archive).
  const dates = [...flags.planDates];
  if (dates.length === 0 && flags.deletedPlanDates.size === 0) return;

  if (flags.deletedPlanDates.size > 0) {
    const { error } = await sb.from("plans").delete().in("date", [...flags.deletedPlanDates]);
    if (error) throw error;
  }

  const conflictDates: string[] = [];
  const conflictRemotes: Record<string, Plan> = {};
  const currentDate = s.currentDate;

  for (const date of dates) {
    const p = s.plans[date];
    if (!p) continue;

    const expected = normalizePlanVersion(p.version);
    const force = forceOverwritePlanDates.has(date);

    type RemotePlanRow = {
      date: string;
      version?: number | string;
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

    let remoteRow: RemotePlanRow | null = null;

    {
      const { data, error } = await sb
        .from("plans")
        .select(
          "date,areas,truck_day,invoices,locked,created_at,step,trip_ids,day_stop_order,day_stop_sequence,version",
        )
        .eq("date", date)
        .maybeSingle();
      if (error && /version|schema cache|does not exist/i.test(error.message)) {
        throw new SchemaOutdatedError("plans.version");
      }
      if (error) throw error;
      remoteRow = (data as RemotePlanRow | null) ?? null;
    }

    const remoteVersion = remoteRow ? normalizePlanVersion(remoteRow.version) : null;

    // Cloud is ahead of this device.
    if (remoteRow && remoteVersion != null && !force && remoteVersion > expected) {
      const remotePlan = planFromFullRow(remoteRow);
      // Only prompt for the day being edited. Archive / bulk leftovers adopt cloud quietly
      // so we don't toast 20+ historical dates on every step change.
      if (date === currentDate) {
        conflictDates.push(date);
        conflictRemotes[date] = remotePlan;
      } else {
        lastAdoptedPlans[date] = remotePlan;
        lastSyncedPlanVersions[date] = remoteVersion;
      }
      continue;
    }

    const matchVersion =
      remoteRow == null
        ? null
        : force
          ? (remoteVersion ?? expected)
          : remoteVersion != null && remoteVersion < expected
            ? remoteVersion
            : expected;

    const writeVersion = remoteRow ? (matchVersion ?? expected) + 1 : 1;
    const payload = planRowPayload(p, now, writeVersion);

    try {
      if (!remoteRow) {
        const { error } = await sb.from("plans").insert(payload as never);
        if (error) {
          if (/version|day_stop_sequence|day_stop_order|trip_ids|schema cache|does not exist/i.test(error.message)) {
            throw new SchemaOutdatedError(error.message);
          }
          if (/duplicate|23505/i.test(error.message)) {
            const again = await fetchPlanFromCloud(date);
            if (again) {
              const againVer = normalizePlanVersion(again.version);
              if (againVer > expected && !force) {
                if (date === currentDate) {
                  conflictDates.push(date);
                  conflictRemotes[date] = again;
                } else {
                  lastAdoptedPlans[date] = again;
                  lastSyncedPlanVersions[date] = againVer;
                }
                continue;
              }
              const retryPayload = planRowPayload(p, now, againVer + 1);
              const { data, error: upErr } = await sb
                .from("plans")
                .update(retryPayload as never)
                .eq("date", date)
                .eq("version", againVer)
                .select("date");
              if (upErr) throw upErr;
              if (!data?.length) {
                if (date === currentDate) {
                  conflictDates.push(date);
                  conflictRemotes[date] = again;
                } else {
                  lastAdoptedPlans[date] = again;
                  lastSyncedPlanVersions[date] = againVer;
                }
                continue;
              }
              lastSyncedPlanVersions[date] = againVer + 1;
              forceOverwritePlanDates.delete(date);
              continue;
            }
          }
          throw error;
        }
      } else {
        const { data, error } = await sb
          .from("plans")
          .update(payload as never)
          .eq("date", date)
          .eq("version", matchVersion!)
          .select("date");
        if (error) {
          if (/version|day_stop_sequence|day_stop_order|trip_ids|schema cache|does not exist/i.test(error.message)) {
            throw new SchemaOutdatedError(error.message);
          }
          throw error;
        }
        if (!data?.length) {
          const again = await fetchPlanFromCloud(date);
          if (again) {
            const againVer = normalizePlanVersion(again.version);
            if (againVer > expected && !force) {
              if (date === currentDate) {
                conflictDates.push(date);
                conflictRemotes[date] = again;
              } else {
                lastAdoptedPlans[date] = again;
                lastSyncedPlanVersions[date] = againVer;
              }
              continue;
            }
            const retryPayload = planRowPayload(p, now, againVer + 1);
            const retry = await sb
              .from("plans")
              .update(retryPayload as never)
              .eq("date", date)
              .eq("version", againVer)
              .select("date");
            if (retry.error) throw retry.error;
            if (!retry.data?.length) {
              if (date === currentDate) {
                conflictDates.push(date);
                conflictRemotes[date] = again;
              } else {
                lastAdoptedPlans[date] = again;
                lastSyncedPlanVersions[date] = againVer;
              }
              continue;
            }
            lastSyncedPlanVersions[date] = againVer + 1;
            forceOverwritePlanDates.delete(date);
            continue;
          }
          throw new Error(`Plan update matched 0 rows for ${date}`);
        }
      }
    } catch (err) {
      if (err instanceof SchemaOutdatedError || err instanceof PlanSyncConflictError) throw err;
      throw err;
    }

    lastSyncedPlanVersions[date] = writeVersion;
    forceOverwritePlanDates.delete(date);
  }

  if (conflictDates.length) {
    lastPlanConflict = { dates: conflictDates, remotes: conflictRemotes };
    throw new PlanSyncConflictError(conflictDates, conflictRemotes);
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

  // Stuck dirty from an earlier "sync all plans" bug: don't re-conflict the whole archive.
  if (f.planDates.size > 5) {
    const keep = new Set<string>();
    if (s.currentDate && f.planDates.has(s.currentDate)) keep.add(s.currentDate);
    for (const d of [...f.planDates]) {
      if (!keep.has(d)) f.planDates.delete(d);
    }
    for (const bag of [dirty, queuedDirty]) {
      for (const d of [...bag.planDates]) {
        if (!keep.has(d)) bag.planDates.delete(d);
      }
    }
    if (f.planDates.size === 0) f.slices.delete("plans");
    scheduleDirtyPersist();
  }

  const now = new Date().toISOString();
  const tasks: Promise<void>[] = [];
  if (f.slices.has("areas")) tasks.push(syncAreas(s, f));
  if (f.slices.has("trucks")) tasks.push(syncTrucks(s, now, f));
  if (f.slices.has("trips")) tasks.push(syncTrips(s, now, f));
  if (f.slices.has("customers")) tasks.push(syncCustomers(s, now, f));
  if (f.slices.has("plans") || f.planDates.size > 0 || f.deletedPlanDates.size > 0) {
    tasks.push(syncPlans(s, now, f));
  }
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
      await saveKeySoft(MIGRATED_KEY, true);
      await saveKey(DIRTY_KEY, null);
      cloud = local;
      migrated = true;
    } else if (cloudHasData(cloud) && !migratedFlag) {
      await saveKeySoft(MIGRATED_KEY, true);
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
  if (f.slices.has("areas") || f.deletedAreaNames.size) parts.push("towns");
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
    if (err instanceof PlanSyncConflictError) {
      lastPlanConflict = { dates: err.dates, remotes: err.remotes };
      lastPersistErrorMessage = `Plan conflict on ${err.dates.join(", ")}`;
      return "conflict";
    }
    if (err instanceof SchemaOutdatedError) {
      lastPersistErrorMessage = err.message;
    } else {
      lastPersistErrorMessage =
        err instanceof Error ? err.message : "Cloud sync failed";
    }
    return "error";
  }
}

export async function persistWarehouse(
  s: CloudSnapshot,
  generation?: number,
  opts?: { skipLocal?: boolean; skipCloud?: boolean; keepalive?: boolean },
): Promise<CloudStatus> {
  const gen = generation ?? bumpSyncGeneration();
  latestGeneration = Math.max(latestGeneration, gen);

  if (!opts?.skipLocal) {
    try {
      await saveLocalSnapshot(s);
    } catch (err) {
      console.error("IndexedDB save failed", err);
      lastPersistErrorMessage = "Local save failed — changes may be lost if you close this tab";
      return "error";
    }
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

  if (opts?.keepalive) {
    // Best-effort PostgREST write that can outlive the tab (same version — no bump).
    void persistKeepaliveSnapshot(s, flags);
  }

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

/** Soft-check remote plan versions for focus refresh (no dirty overwrite). */
export async function peekRemotePlanVersions(
  dates: string[],
): Promise<Record<string, number>> {
  const sb = getSupabase();
  if (!sb || dates.length === 0) return {};
  const { data, error } = await sb.from("plans").select("date,version").in("date", dates);
  if (error) {
    if (/version|schema cache|does not exist/i.test(error.message)) return {};
    throw error;
  }
  const out: Record<string, number> = {};
  for (const row of data ?? []) {
    const r = row as { date: string; version?: unknown };
    out[r.date] = normalizePlanVersion(r.version);
  }
  return out;
}

/**
 * Exit-path best-effort cloud write via fetch keepalive.
 * Writes current version (no bump) so a later versioned sync can still ACK cleanly.
 */
async function persistKeepaliveSnapshot(
  s: CloudSnapshot,
  flags: DirtyFlags,
): Promise<void> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  const now = new Date().toISOString();
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates",
  };

  const post = (table: string, rows: Record<string, unknown>[]) => {
    if (!rows.length) return Promise.resolve();
    return fetch(`${url}/rest/v1/${table}?on_conflict=${table === "plans" ? "date" : "id"}`, {
      method: "POST",
      headers,
      body: JSON.stringify(rows),
      keepalive: true,
    }).then(() => undefined);
  };

  const tasks: Promise<void>[] = [];
  if (flags.slices.has("plans") || flags.planDates.size) {
    // Only dirty dates — never the full archive. Omit version (don't rewind locks).
    const dates = [...flags.planDates];
    const rows = dates
      .map((d) => s.plans[d])
      .filter(Boolean)
      .map((p) => {
        const full = planRowPayload(p, now, normalizePlanVersion(p.version));
        const { version: _version, ...rest } = full;
        return rest;
      });
    tasks.push(post("plans", rows));
  }
  if (flags.slices.has("trucks") && s.trucks.length) {
    tasks.push(
      post(
        "trucks",
        s.trucks.map((t) => ({
          id: t.id,
          name: t.name,
          max_weight: t.maxWeight,
          active: t.active,
          sheet_letter: normalizeSheetLetter(t.sheetLetter),
          updated_at: now,
        })),
      ),
    );
  }
  if (flags.slices.has("trips") && s.trips.length) {
    tasks.push(
      post(
        "trips",
        s.trips.map((t) => ({
          id: t.id,
          name: t.name,
          towns: t.towns,
          stop_order: t.stopOrder ?? {},
          updated_at: now,
        })),
      ),
    );
  }
  await Promise.allSettled(tasks);
}

export { emptySnapshot, isCloudConfigured };
