import type { AuditEntry, CustomerMemory, Plan, Truck, TruckDay } from "./types";
import { normalizeCustomer, normalizeInvoice, normalizeTruckDay } from "./types";
import { customerKey } from "./customers";
import { getSupabase, isCloudConfigured } from "./supabase";
import { loadKey, saveKey } from "./db";

const MIGRATED_KEY = "lp:cloudMigrated";

export type CloudSnapshot = {
  trucks: Truck[];
  customers: Record<string, CustomerMemory>;
  areaHistory: string[];
  plans: Record<string, Plan>;
  audit: AuditEntry[];
  currentDate: string;
  adminPin: string;
};

export type CloudStatus = "offline" | "local" | "cloud" | "error";

function emptySnapshot(currentDate: string): CloudSnapshot {
  return {
    trucks: [],
    customers: {},
    areaHistory: [],
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

function normalizePlans(raw: Record<string, Plan>): Record<string, Plan> {
  const plans: Record<string, Plan> = {};
  for (const [date, p] of Object.entries(raw ?? {})) {
    plans[date] = {
      ...p,
      date: p.date ?? date,
      truckDay: (p.truckDay ?? []).map((td) =>
        normalizeTruckDay(td as TruckDay & { area?: string }),
      ),
      invoices: (p.invoices ?? []).map((i) =>
        normalizeInvoice(i as Parameters<typeof normalizeInvoice>[0]),
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

/** Load snapshot from IndexedDB cache. */
export async function loadLocalSnapshot(): Promise<CloudSnapshot> {
  const [trucks, customersRaw, areaHistory, plansRaw, audit, currentDate, adminPin] =
    await Promise.all([
      loadKey<Truck[]>("lp:trucks", []),
      loadKey<Record<string, CustomerMemory>>("lp:customers", {}),
      loadKey<string[]>("lp:areaHistory", []),
      loadKey<Record<string, Plan>>("lp:plans", {}),
      loadKey<AuditEntry[]>("lp:audit", []),
      loadKey<string>("lp:currentDate", tomorrowISO()),
      loadKey<string>("lp:adminPin", ""),
    ]);
  return {
    trucks,
    customers: normalizeCustomers(customersRaw),
    areaHistory,
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
    saveKey("lp:customers", s.customers),
    saveKey("lp:areaHistory", s.areaHistory),
    saveKey("lp:plans", s.plans),
    saveKey("lp:audit", s.audit),
    saveKey("lp:currentDate", s.currentDate),
    saveKey("lp:adminPin", s.adminPin),
  ]);
}

function snapshotHasData(s: CloudSnapshot): boolean {
  return (
    s.trucks.length > 0 ||
    Object.keys(s.customers).length > 0 ||
    s.areaHistory.length > 0 ||
    Object.keys(s.plans).length > 0
  );
}

function cloudHasData(s: CloudSnapshot): boolean {
  return snapshotHasData(s);
}

/** Fetch full warehouse state from Lovable Cloud. */
export async function hydrateFromCloud(): Promise<CloudSnapshot | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const [areasRes, trucksRes, customersRes, plansRes, auditRes, settingsRes] =
    await Promise.all([
      sb.from("areas").select("name"),
      sb.from("trucks").select("id,name,max_weight,active"),
      sb
        .from("customers")
        .select("id,code,name,default_area,loading_number,first_seen"),
      sb
        .from("plans")
        .select("date,areas,truck_day,invoices,locked,created_at,step"),
      sb
        .from("audit_entries")
        .select("id,ts,type,message,payload")
        .order("ts", { ascending: false })
        .limit(5000),
      sb.from("app_settings").select("active_date,admin_pin").eq("id", 1).maybeSingle(),
    ]);

  const firstError =
    areasRes.error ||
    trucksRes.error ||
    customersRes.error ||
    plansRes.error ||
    auditRes.error ||
    settingsRes.error;
  if (firstError) throw firstError;

  const customers: Record<string, CustomerMemory> = {};
  for (const row of customersRes.data ?? []) {
    const c = normalizeCustomer({
      code: row.code ?? "",
      name: row.name,
      defaultArea: row.default_area ?? "",
      loadingNumber: row.loading_number ?? 0,
      firstSeen: row.first_seen ?? new Date().toISOString(),
    });
    customers[row.id || customerKey(c)] = c;
  }

  const plans: Record<string, Plan> = {};
  for (const row of plansRes.data ?? []) {
    plans[row.date] = normalizePlans({
      [row.date]: {
        date: row.date,
        areas: (row.areas as string[]) ?? [],
        truckDay: (row.truck_day as TruckDay[]) ?? [],
        invoices: (row.invoices as Plan["invoices"]) ?? [],
        locked: !!row.locked,
        createdAt: row.created_at ?? new Date().toISOString(),
        step: (row.step as Plan["step"]) ?? "setup",
      },
    })[row.date];
  }

  const trucks: Truck[] = (trucksRes.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    maxWeight: Number(t.max_weight) || 0,
    active: !!t.active,
  }));

  const audit: AuditEntry[] = (auditRes.data ?? []).map((a) => ({
    id: a.id,
    ts: a.ts,
    type: a.type,
    message: a.message,
    payload: a.payload ?? undefined,
  }));

  return {
    trucks,
    customers,
    areaHistory: (areasRes.data ?? []).map((a) => a.name).sort((a, b) => a.localeCompare(b)),
    plans,
    audit,
    currentDate: settingsRes.data?.active_date || tomorrowISO(),
    adminPin: settingsRes.data?.admin_pin ?? "",
  };
}

/** Upsert full warehouse state to Lovable Cloud. */
export async function persistToCloud(s: CloudSnapshot): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  const now = new Date().toISOString();

  // Areas: replace set
  const { data: existingAreas, error: areasReadErr } = await sb.from("areas").select("name");
  if (areasReadErr) throw areasReadErr;
  const wantAreas = new Set(s.areaHistory.filter(Boolean));
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

  // Trucks: replace set
  const { data: existingTrucks, error: trucksReadErr } = await sb.from("trucks").select("id");
  if (trucksReadErr) throw trucksReadErr;
  const wantTruckIds = new Set(s.trucks.map((t) => t.id));
  const trucksToDelete = (existingTrucks ?? [])
    .map((t) => t.id)
    .filter((id) => !wantTruckIds.has(id));
  if (trucksToDelete.length) {
    const { error } = await sb.from("trucks").delete().in("id", trucksToDelete);
    if (error) throw error;
  }
  if (s.trucks.length) {
    const { error } = await sb.from("trucks").upsert(
      s.trucks.map((t) => ({
        id: t.id,
        name: t.name,
        max_weight: t.maxWeight,
        active: t.active,
        updated_at: now,
      })),
      { onConflict: "id" },
    );
    if (error) throw error;
  }

  // Customers: replace set
  const { data: existingCustomers, error: custReadErr } = await sb.from("customers").select("id");
  if (custReadErr) throw custReadErr;
  const wantCustIds = new Set(Object.keys(s.customers));
  const custToDelete = (existingCustomers ?? [])
    .map((c) => c.id)
    .filter((id) => !wantCustIds.has(id));
  if (custToDelete.length) {
    const { error } = await sb.from("customers").delete().in("id", custToDelete);
    if (error) throw error;
  }
  const customerRows = Object.entries(s.customers).map(([id, c]) => ({
    id,
    code: c.code ?? "",
    name: c.name,
    default_area: c.defaultArea ?? "",
    loading_number: c.loadingNumber ?? 0,
    first_seen: c.firstSeen || now,
    updated_at: now,
  }));
  if (customerRows.length) {
    const { error } = await sb.from("customers").upsert(customerRows, { onConflict: "id" });
    if (error) throw error;
  }

  // Plans: replace set
  const { data: existingPlans, error: plansReadErr } = await sb.from("plans").select("date");
  if (plansReadErr) throw plansReadErr;
  const wantDates = new Set(Object.keys(s.plans));
  const plansToDelete = (existingPlans ?? [])
    .map((p) => p.date)
    .filter((d) => !wantDates.has(d));
  if (plansToDelete.length) {
    const { error } = await sb.from("plans").delete().in("date", plansToDelete);
    if (error) throw error;
  }
  const planRows = Object.values(s.plans).map((p) => ({
    date: p.date,
    areas: p.areas ?? [],
    truck_day: p.truckDay ?? [],
    invoices: p.invoices ?? [],
    locked: !!p.locked,
    created_at: p.createdAt || now,
    step: p.step || "setup",
    updated_at: now,
  }));
  if (planRows.length) {
    const { error } = await sb.from("plans").upsert(planRows, { onConflict: "date" });
    if (error) throw error;
  }

  // Audit: upsert recent entries (cap 5000 locally); prune extras on cloud
  const audit = s.audit.slice(0, 5000);
  if (audit.length) {
    const { error } = await sb.from("audit_entries").upsert(
      audit.map((a) => ({
        id: a.id,
        ts: a.ts,
        type: a.type,
        message: a.message,
        payload: a.payload ?? null,
      })),
      { onConflict: "id" },
    );
    if (error) throw error;
  }
  const keepIds = audit.map((a) => a.id);
  if (keepIds.length) {
    // Delete audits not in keep set — use not.in when list is manageable
    const { data: allAudit, error: auditListErr } = await sb.from("audit_entries").select("id");
    if (auditListErr) throw auditListErr;
    const keep = new Set(keepIds);
    const drop = (allAudit ?? []).map((a) => a.id).filter((id) => !keep.has(id));
    // Batch deletes
    for (let i = 0; i < drop.length; i += 200) {
      const chunk = drop.slice(i, i + 200);
      const { error } = await sb.from("audit_entries").delete().in("id", chunk);
      if (error) throw error;
    }
  } else {
    const { error } = await sb.from("audit_entries").delete().neq("id", "");
    if (error) throw error;
  }

  const { error: settingsErr } = await sb.from("app_settings").upsert(
    {
      id: 1,
      active_date: s.currentDate,
      admin_pin: s.adminPin ?? "",
      updated_at: now,
    },
    { onConflict: "id" },
  );
  if (settingsErr) throw settingsErr;
}

/**
 * Hydrate preferring Cloud when configured & online.
 * Migrates IndexedDB → Cloud once if cloud is empty.
 */
export async function hydrateWarehouse(): Promise<{
  snapshot: CloudSnapshot;
  status: CloudStatus;
  migrated: boolean;
}> {
  const local = await loadLocalSnapshot();

  if (!isCloudConfigured()) {
    return { snapshot: local, status: "local", migrated: false };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { snapshot: local, status: "offline", migrated: false };
  }

  try {
    let cloud = await hydrateFromCloud();
    if (!cloud) {
      return { snapshot: local, status: "local", migrated: false };
    }

    const migratedFlag = await loadKey<boolean>(MIGRATED_KEY, false);
    let migrated = false;

    if (!cloudHasData(cloud) && snapshotHasData(local) && !migratedFlag) {
      await persistToCloud(local);
      await saveKey(MIGRATED_KEY, true);
      cloud = local;
      migrated = true;
    } else if (cloudHasData(cloud) && !migratedFlag) {
      await saveKey(MIGRATED_KEY, true);
    }

    await saveLocalSnapshot(cloud);
    return { snapshot: cloud, status: "cloud", migrated };
  } catch (err) {
    console.error("Cloud hydrate failed, using local cache", err);
    return { snapshot: local, status: "error", migrated: false };
  }
}

/** Persist to IDB always; also to Cloud when online & configured. */
export async function persistWarehouse(s: CloudSnapshot): Promise<CloudStatus> {
  await saveLocalSnapshot(s);

  if (!isCloudConfigured()) return "local";
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";

  try {
    await persistToCloud(s);
    return "cloud";
  } catch (err) {
    console.error("Cloud persist failed", err);
    return "error";
  }
}

export { emptySnapshot, isCloudConfigured };
