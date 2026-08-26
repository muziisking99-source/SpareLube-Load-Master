import { create } from "zustand";
import type {
  AuditEntry,
  CustomerMemory,
  HeldInvoice,
  Invoice,
  Plan,
  Trip,
  Truck,
  TruckDay,
} from "./types";
import { normalizeHeldInvoice } from "./types";
import { allocate, overflowInvoiceIds } from "./allocation";
import {
  assignCustomerArea,
  reorderCustomersInArea,
  setCustomerLoadingNumber as applyLoadingNumber,
  mergePartialTripReorder,
  mergePartialDayReorder,
} from "./loadingOrder";
import type { ParsedRow } from "./parse";
import { customerKey, findCustomer, findCustomerKey } from "./customers";
import { normalizeTrip, townsForTruckDay, townsFromTripIds, townsForPlan, tripById } from "./trips";
import {
  hydrateWarehouse,
  persistWarehouse,
  bumpSyncGeneration,
  isWarehouseDirty,
  markDirty,
  fetchPlanFromCloud,
  listPlanIndexFromCloud,
  saveLocalSnapshot,
  requestAuditPrune,
  isPlanDeletePending,
  getDirtySummary,
  type CloudStatus,
  type CloudSnapshot,
} from "./cloudSync";
import { isCloudConfigured } from "./supabase";
import { toast } from "sonner";

export type SyncState = "saved" | "saving" | "offline" | "error" | "local";

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function emptyPlan(date: string): Plan {
  return {
    date,
    areas: [],
    tripIds: [],
    truckDay: [],
    invoices: [],
    dayStopOrder: {},
    locked: false,
    createdAt: new Date().toISOString(),
    step: "setup",
  };
}

type UndoAction = { label: string; undo: () => void };

type State = {
  hydrated: boolean;
  cloudStatus: CloudStatus;
  /** User-facing sync indicator (Saving / Saved / Error / …). */
  syncState: SyncState;
  lastSyncedAt: string | null;
  pendingSummary: string;
  trucks: Truck[];
  trips: Trip[];
  customers: Record<string, CustomerMemory>;
  areaHistory: string[];
  heldInvoices: HeldInvoice[];
  plans: Record<string, Plan>;
  audit: AuditEntry[];
  currentDate: string;
  undoStack: UndoAction[];
  showResume: boolean;

  /** Hydrate from cloud/IDB. Skips if already hydrated unless force. Won't overwrite dirty local. */
  hydrate: (opts?: { force?: boolean }) => Promise<void>;
  /** Flush pending debounce and await cloud/IDB persist. */
  flushSave: () => Promise<CloudStatus>;
  currentPlan: () => Plan;

  // trucks
  addTruck: (t: Omit<Truck, "id">) => void;
  updateTruck: (id: string, patch: Partial<Truck>) => void;
  deleteTruck: (id: string) => void;

  // trips
  addTrip: (name: string, towns?: string[]) => string;
  updateTrip: (id: string, patch: Partial<Pick<Trip, "name" | "towns" | "stopOrder">>) => void;
  deleteTrip: (id: string) => void;
  /** Import trip names (towns optional). Merges towns onto existing names. */
  importTrips: (
    rows: { name: string; towns?: string[] }[],
  ) => { added: number; skipped: number; updated: number };
  setTripCustomerLoadNumber: (tripId: string, customerKey: string, n: number) => void;
  reorderTripCustomers: (tripId: string, orderedKeys: string[]) => void;

  // areas / towns catalog
  addArea: (name: string) => void;
  removeArea: (name: string) => void;
  ensureArea: (name: string) => void;
  /** Add many areas to the catalog. Returns counts. */
  importAreas: (names: string[]) => { added: number; skipped: number };
  /** Remove area from the global catalog and unassign customers in it */
  deleteAreaCatalog: (name: string) => void;

  // plan
  setStep: (step: Plan["step"]) => void;
  setDate: (date: string) => void;
  /** Merge older plan dates from cloud into local index (Admin Plans). */
  refreshPlanIndex: () => Promise<void>;
  /** Queue rare audit prune when Admin Audit is opened. */
  openAuditPanel: () => void;
  setTruckDayTrip: (truckId: string, tripId: string | null) => void;
  setTruckDayAreas: (truckId: string, areas: string[]) => void;
  /** @deprecated use setTruckDayTrip */
  setTruckDayArea: (truckId: string, area: string) => void;
  /** Select which trips run today (Step 1). Derives plan.areas from trip towns. */
  setPlanTrips: (tripIds: string[]) => void;
  ensureTruckDay: () => void;
  dismissResume: () => void;
  newPlan: (date?: string) => void;

  // customers
  importCustomers: (
    rows: { code: string; name: string }[],
  ) => { added: number; skipped: number; updated: number };
  /** Create a customer if missing; fill empty default town. Returns the record. */
  ensureCustomer: (input: {
    name: string;
    code?: string;
    defaultArea?: string;
    collection?: boolean;
  }) => CustomerMemory | null;
  setCustomerArea: (name: string, area: string) => void;
  setCustomerLoadingNumber: (name: string, area: string, n: number) => void;
  setCustomerCollection: (key: string, collection: boolean) => void;
  reorderCustomersInArea: (area: string, orderedNames: string[]) => void;
  deleteCustomer: (name: string) => void;

  // invoices
  addInvoices: (list: Omit<Invoice, "id" | "truckId" | "round">[]) => void;
  addAdhoc: () => void;
  updateInvoice: (id: string, patch: Partial<Invoice>) => void;
  removeInvoice: (id: string) => void;
  confirmImport: () => { known: number; learned: number };
  /**
   * Bulk-add Excel invoice rows (doc + customer). Skips duplicate docs.
   * Weight stays 0 for manual entry. Routes off-trip towns to held.
   */
  importInvoiceRows: (
    rows: ParsedRow[],
  ) => { added: number; held: number; skipped: number };

  // held invoices (warehouse pool across days)
  holdInvoices: (
    items: Omit<HeldInvoice, "id" | "heldAt" | "reason" | "collection" | "creditNote">[],
    reason: HeldInvoice["reason"],
  ) => number;
  holdFromPlan: (invoiceId: string) => boolean;
  /** Pick held into today's plan. asException allows off-trip towns. */
  pickHeld: (
    id: string,
    opts?: { asException?: boolean; asCollection?: boolean; asCreditNote?: boolean },
  ) => "ok" | "duplicate" | "missing" | "off_trip";
  updateHeld: (
    id: string,
    patch: Partial<
      Pick<
        HeldInvoice,
        "doc" | "customer" | "weight" | "area" | "collection" | "creditNote" | "reason"
      >
    >,
  ) => void;
  removeHeld: (id: string) => void;
  /** Mark / unmark held invoice as a collection. */
  setHeldCollection: (id: string, collection: boolean) => void;
  /**
   * Reorder a subset of trip customers (e.g. those on a truck in Adjust).
   * Merges into full trip stopOrder so Admin stay in sync.
   */
  reorderTripStopsPartial: (tripId: string, orderedKeys: string[]) => void;
  /**
   * Day-only stop reorder for Adjust — writes plan.dayStopOrder, not Admin trips.
   */
  reorderDayTripStopsPartial: (tripId: string, orderedKeys: string[]) => void;
  /** Day-only load # for Adjust. */
  setDayTripCustomerLoadNumber: (tripId: string, customerKey: string, n: number) => void;

  // allocation
  runAllocation: () => void;
  moveInvoice: (invId: string, truckId: string | null, reason?: string) => void;
  bulkMove: (ids: string[], truckId: string | null) => void;
  /** Move selected (or capacity overflow) invoices on a truck to round 2. Returns count moved. */
  sendToSecondRound: (truckId: string, invoiceIds?: string[]) => number;
  setInvoiceRound: (ids: string[], round: number) => void;

  // undo
  pushUndo: (a: UndoAction) => void;
  undo: () => void;

  // lock
  lockPlan: () => void;
  unlockPlan: () => void;

  // audit
  log: (type: string, message: string, payload?: unknown) => void;

  // admin
  deleteDay: (date: string) => void;
  exportJSON: () => string;
  setPin: (pin: string) => void;
  checkPin: (pin: string) => boolean;
  adminPin: string;
};

function toSnapshot(state: State): CloudSnapshot {
  return {
    trucks: state.trucks,
    trips: state.trips,
    customers: state.customers,
    areaHistory: state.areaHistory,
    heldInvoices: state.heldInvoices,
    plans: state.plans,
    audit: state.audit,
    currentDate: state.currentDate,
    adminPin: state.adminPin,
  };
}

const LOCAL_DEBOUNCE_MS = 300;
const CLOUD_DEBOUNCE_MS = 500;
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000];

let localSaveTimer: ReturnType<typeof setTimeout> | null = null;
let cloudSaveTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let pendingGeneration = 0;
let retryAttempt = 0;
let errorSinceMs: number | null = null;
let failureToastShown = false;

function markDirtyFromPatch(patch: Partial<State>, prev: State) {
  if (patch.trucks !== undefined) {
    markDirty(["trucks"]);
    const nextIds = new Set(patch.trucks.map((t) => t.id));
    for (const t of prev.trucks) {
      if (!nextIds.has(t.id)) markDirty(["trucks"], { deletedTruckId: t.id });
    }
  }
  if (patch.trips !== undefined) {
    markDirty(["trips"]);
    const nextIds = new Set(patch.trips.map((t) => t.id));
    for (const t of prev.trips) {
      if (!nextIds.has(t.id)) markDirty(["trips"], { deletedTripId: t.id });
    }
  }
  if (patch.customers !== undefined) {
    markDirty(["customers"]);
    const nextIds = new Set(Object.keys(patch.customers));
    for (const id of Object.keys(prev.customers)) {
      if (!nextIds.has(id)) markDirty(["customers"], { deletedCustomerId: id });
    }
  }
  if (patch.areaHistory !== undefined) markDirty(["areas"]);
  if (
    patch.heldInvoices !== undefined ||
    patch.adminPin !== undefined ||
    patch.currentDate !== undefined
  ) {
    markDirty(["settings"]);
  }
  if (patch.plans !== undefined) {
    const changed: string[] = [];
    for (const d of Object.keys(patch.plans)) {
      if (patch.plans[d] !== prev.plans[d]) changed.push(d);
    }
    for (const d of Object.keys(prev.plans)) {
      if (!(d in patch.plans)) markDirty(["plans"], { deletedPlanDate: d });
    }
    if (changed.length) markDirty(["plans"], { planDates: changed });
  }
  if (patch.audit !== undefined) {
    const prevIds = new Set(prev.audit.map((a) => a.id));
    for (const a of patch.audit) {
      if (!prevIds.has(a.id)) markDirty(["audit"], { auditId: a.id });
    }
    if (prev.audit.length >= 5000) markDirty(["audit"], { pruneAudit: true });
  }
}

function clearRetryTimer() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function applyPersistResult(status: CloudStatus, opts?: { cloudAttempt?: boolean }) {
  const summary = getDirtySummary();
  const dirty = isWarehouseDirty();

  if (status === "offline") {
    useStore.setState({
      cloudStatus: "offline",
      syncState: "offline",
      pendingSummary: summary,
    });
    clearRetryTimer();
    return;
  }

  if (status === "error") {
    if (errorSinceMs == null) errorSinceMs = Date.now();
    useStore.setState({
      cloudStatus: "error",
      syncState: "error",
      pendingSummary: summary || "Sync failed — click to retry",
    });
    if (!failureToastShown && errorSinceMs != null && Date.now() - errorSinceMs >= 30_000) {
      failureToastShown = true;
      toast.error("Cloud sync keeps failing — click the sync chip to retry");
    }
    scheduleAutoRetry();
    return;
  }

  if (!isCloudConfigured()) {
    useStore.setState({
      cloudStatus: "local",
      syncState: "local",
      pendingSummary: "",
    });
    clearRetryTimer();
    return;
  }

  if (opts?.cloudAttempt && status === "cloud" && !dirty) {
    retryAttempt = 0;
    errorSinceMs = null;
    failureToastShown = false;
    clearRetryTimer();
    useStore.setState({
      cloudStatus: "cloud",
      syncState: "saved",
      lastSyncedAt: new Date().toISOString(),
      pendingSummary: "",
    });
    return;
  }

  // Local-only write, or cloud write that left more work queued
  if (dirty) {
    useStore.setState({
      cloudStatus: status === "cloud" ? "cloud" : useStore.getState().cloudStatus,
      syncState: "saving",
      pendingSummary: summary || "Saving…",
    });
    return;
  }

  if (status === "cloud") {
    retryAttempt = 0;
    errorSinceMs = null;
    failureToastShown = false;
    clearRetryTimer();
    useStore.setState({
      cloudStatus: "cloud",
      syncState: "saved",
      lastSyncedAt: new Date().toISOString(),
      pendingSummary: "",
    });
  }
}

function scheduleAutoRetry() {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (!isCloudConfigured()) return;
  clearRetryTimer();
  const delay = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)];
  retryAttempt += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (!isWarehouseDirty() && useStore.getState().syncState !== "error") return;
    void flushSaveNow();
  }, delay);
}

function scheduleSave() {
  const gen = bumpSyncGeneration();
  pendingGeneration = gen;

  useStore.setState({
    syncState: isCloudConfigured()
      ? typeof navigator !== "undefined" && !navigator.onLine
        ? "offline"
        : "saving"
      : "local",
    pendingSummary: getDirtySummary() || "Saving…",
  });

  if (localSaveTimer) clearTimeout(localSaveTimer);
  localSaveTimer = setTimeout(() => {
    localSaveTimer = null;
    void persistWarehouse(toSnapshot(useStore.getState()), gen, { skipCloud: true }).then(
      (status) => applyPersistResult(status),
    );
  }, LOCAL_DEBOUNCE_MS);

  if (cloudSaveTimer) clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => {
    cloudSaveTimer = null;
    void persistWarehouse(toSnapshot(useStore.getState()), gen, { skipLocal: true }).then(
      (status) => applyPersistResult(status, { cloudAttempt: true }),
    );
  }, CLOUD_DEBOUNCE_MS);
}

async function flushSaveNow(): Promise<CloudStatus> {
  if (localSaveTimer) {
    clearTimeout(localSaveTimer);
    localSaveTimer = null;
  }
  if (cloudSaveTimer) {
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = null;
  }
  clearRetryTimer();

  if (isCloudConfigured()) {
    useStore.setState({
      syncState:
        typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "saving",
      pendingSummary: getDirtySummary() || "Saving…",
    });
  }

  const state = useStore.getState();
  const gen = pendingGeneration || bumpSyncGeneration();
  pendingGeneration = gen;
  const status = await persistWarehouse(toSnapshot(state), gen);
  applyPersistResult(status, { cloudAttempt: true });
  return status;
}

export const useStore = create<State>((set, get) => {
  const persist = () => scheduleSave();
  const mutate = (fn: (s: State) => Partial<State> | void) => {
    set((s) => {
      const patch = fn(s);
      if (patch) markDirtyFromPatch(patch, s);
      return patch ?? {};
    });
    persist();
  };

  const log = (type: string, message: string, payload?: unknown) => {
    const entry: AuditEntry = {
      id: uid(),
      ts: new Date().toISOString(),
      type,
      message,
      payload,
    };
    mutate((s) => ({ audit: [entry, ...s.audit].slice(0, 5000) }));
  };

  const patchPlan = (fn: (p: Plan) => Plan) => {
    mutate((s) => {
      const date = s.currentDate;
      const existing = s.plans[date] ?? emptyPlan(date);
      const next = fn(existing);
      return { plans: { ...s.plans, [date]: next } };
    });
  };

  return {
    hydrated: false,
    cloudStatus: "local",
    syncState: "local",
    lastSyncedAt: null,
    pendingSummary: "",
    trucks: [],
    trips: [],
    customers: {},
    areaHistory: [],
    heldInvoices: [],
    plans: {},
    audit: [],
    currentDate: tomorrowISO(),
    undoStack: [],
    showResume: false,
    adminPin: "",

    hydrate: async (opts) => {
      const force = !!opts?.force;
      const already = get().hydrated;
      if (already && !force) return;

      // Never clobber unsynced local edits with an older cloud snapshot
      if (already && isWarehouseDirty() && !force) return;

      try {
        const preferLocal = isWarehouseDirty();
        const { snapshot, status } = await hydrateWarehouse({ preferLocal });
        // If we preferred local because dirty, keep in-memory state (already newer)
        if (preferLocal && already) {
          applyPersistResult(status, { cloudAttempt: status === "cloud" });
          return;
        }
        const {
          trucks,
          trips,
          customers,
          areaHistory,
          heldInvoices,
          plans,
          audit,
          currentDate,
          adminPin,
        } = snapshot;

        const existing = plans[currentDate];
        const showResume = !!existing && !existing.locked && existing.invoices.length > 0;
        const syncState: SyncState =
          status === "cloud"
            ? "saved"
            : status === "offline"
              ? "offline"
              : status === "error"
                ? "error"
                : "local";
        set({
          hydrated: true,
          cloudStatus: status,
          syncState,
          lastSyncedAt: status === "cloud" ? new Date().toISOString() : get().lastSyncedAt,
          pendingSummary: "",
          trucks,
          trips: (trips ?? []).map((t) => normalizeTrip(t)),
          customers,
          areaHistory,
          heldInvoices: (heldInvoices ?? []).map((h) =>
            normalizeHeldInvoice(h as Parameters<typeof normalizeHeldInvoice>[0]),
          ),
          plans,
          audit,
          currentDate,
          adminPin,
          showResume,
        });
      } catch {
        set({ hydrated: true, cloudStatus: "error", syncState: "error" });
      }
    },

    flushSave: () => flushSaveNow(),

    currentPlan: () => {
      const s = get();
      return s.plans[s.currentDate] ?? emptyPlan(s.currentDate);
    },

    addTruck: (t) => {
      const truck: Truck = { id: uid(), ...t };
      mutate((s) => ({ trucks: [...s.trucks, truck] }));
      log("truck.add", `Added truck ${truck.name}`);
    },
    updateTruck: (id, patch) => {
      mutate((s) => ({ trucks: s.trucks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
    },
    deleteTruck: (id) => {
      mutate((s) => ({ trucks: s.trucks.filter((t) => t.id !== id) }));
      log("truck.delete", `Deleted truck ${id}`);
      void flushSaveNow();
    },

    addTrip: (nameRaw, towns = []) => {
      const id = uid();
      const trip = normalizeTrip({ id, name: nameRaw, towns });
      mutate((s) => ({ trips: [...s.trips, trip] }));
      log("trip.add", `Added trip ${trip.name}`);
      return id;
    },
    updateTrip: (id, patch) => {
      mutate((s) => ({
        trips: s.trips.map((t) =>
          t.id === id
            ? normalizeTrip({
                ...t,
                name: patch.name ?? t.name,
                towns: patch.towns ?? t.towns,
                stopOrder: patch.stopOrder ?? t.stopOrder,
              })
            : t,
        ),
      }));
    },
    deleteTrip: (id) => {
      mutate((s) => {
        const plans = { ...s.plans };
        for (const date of Object.keys(plans)) {
          const p = plans[date];
          plans[date] = {
            ...p,
            truckDay: p.truckDay.map((td) =>
              td.tripId === id ? { ...td, tripId: null } : td,
            ),
          };
        }
        return {
          trips: s.trips.filter((t) => t.id !== id),
          plans,
        };
      });
      log("trip.delete", `Deleted trip ${id}`);
      void flushSaveNow();
    },
    setTripCustomerLoadNumber: (tripId, key, n) => {
      mutate((s) => ({
        trips: s.trips.map((t) => {
          if (t.id !== tripId) return t;
          const stopOrder = { ...t.stopOrder };
          const num = Math.floor(n);
          if (!Number.isFinite(num) || num < 1) {
            delete stopOrder[key];
          } else {
            stopOrder[key] = num;
          }
          return normalizeTrip({ ...t, stopOrder });
        }),
      }));
      log("trip.load", `Set ${key} load #${n} on trip ${tripId}`);
    },
    reorderTripCustomers: (tripId, orderedKeys) => {
      mutate((s) => ({
        trips: s.trips.map((t) => {
          if (t.id !== tripId) return t;
          const stopOrder: Record<string, number> = {};
          orderedKeys.forEach((key, i) => {
            if (key) stopOrder[key] = i + 1;
          });
          return normalizeTrip({ ...t, stopOrder });
        }),
      }));
      log("trip.reorder", `Reordered ${orderedKeys.length} stops on trip ${tripId}`);
    },
    reorderTripStopsPartial: (tripId, orderedKeys) => {
      mutate((s) => ({
        trips: s.trips.map((t) => {
          if (t.id !== tripId) return t;
          const stopOrder = mergePartialTripReorder(s.customers, t, orderedKeys);
          return normalizeTrip({ ...t, stopOrder });
        }),
      }));
      log("trip.reorder", `Adjusted stop order on trip ${tripId}`);
    },
    reorderDayTripStopsPartial: (tripId, orderedKeys) => {
      patchPlan((p) => {
        const trip = tripById(get().trips, tripId);
        if (!trip) return p;
        const dayMap = p.dayStopOrder?.[tripId];
        const stopOrder = mergePartialDayReorder(
          get().customers,
          trip,
          dayMap,
          orderedKeys,
        );
        return {
          ...p,
          dayStopOrder: {
            ...(p.dayStopOrder ?? {}),
            [tripId]: stopOrder,
          },
        };
      });
      log("plan.day_reorder", `Day stop order adjusted for trip ${tripId}`);
    },
    setDayTripCustomerLoadNumber: (tripId, key, n) => {
      patchPlan((p) => {
        const dayStopOrder = { ...(p.dayStopOrder ?? {}) };
        const map = { ...(dayStopOrder[tripId] ?? {}) };
        const num = Math.floor(n);
        if (!Number.isFinite(num) || num < 1) {
          delete map[key];
        } else {
          map[key] = num;
        }
        if (Object.keys(map).length === 0) {
          delete dayStopOrder[tripId];
        } else {
          dayStopOrder[tripId] = map;
        }
        return { ...p, dayStopOrder };
      });
      log("plan.day_load", `Day load #${n} for ${key} on trip ${tripId}`);
    },
    importTrips: (rows) => {
      let added = 0;
      let skipped = 0;
      let updated = 0;
      mutate((s) => {
        const trips = [...s.trips];
        const byName = new Map(trips.map((t) => [t.name.toLowerCase(), t]));
        let history = [...s.areaHistory];
        const historySet = new Set(history.map((a) => a.toLowerCase()));

        for (const raw of rows) {
          const name = raw.name.trim();
          if (!name) continue;
          const towns = [...new Set((raw.towns ?? []).map((t) => t.trim()).filter(Boolean))];
          for (const town of towns) {
            if (!historySet.has(town.toLowerCase())) {
              historySet.add(town.toLowerCase());
              history.push(town);
            }
          }

          const existing = byName.get(name.toLowerCase());
          if (!existing) {
            const trip = normalizeTrip({ id: uid(), name, towns });
            trips.push(trip);
            byName.set(name.toLowerCase(), trip);
            added++;
            continue;
          }

          if (towns.length === 0) {
            skipped++;
            continue;
          }
          const seen = new Set(existing.towns.map((t) => t.toLowerCase()));
          const merged = [...existing.towns];
          let changed = false;
          for (const town of towns) {
            if (seen.has(town.toLowerCase())) continue;
            seen.add(town.toLowerCase());
            merged.push(town);
            changed = true;
          }
          if (!changed) {
            skipped++;
            continue;
          }
          const next = normalizeTrip({ ...existing, towns: merged });
          const idx = trips.findIndex((t) => t.id === existing.id);
          if (idx >= 0) trips[idx] = next;
          byName.set(name.toLowerCase(), next);
          updated++;
        }

        return { trips, areaHistory: history };
      });
      log("trip.import", `Imported trips (+${added}, ~${updated}, =${skipped})`);
      return { added, skipped, updated };
    },

    addArea: (nameRaw) => {
      const name = nameRaw.trim();
      if (!name) return;
      mutate((s) => {
        const p = s.plans[s.currentDate] ?? emptyPlan(s.currentDate);
        if (p.areas.includes(name)) return {};
        const history = s.areaHistory.includes(name)
          ? s.areaHistory
          : [...s.areaHistory, name];
        return {
          areaHistory: history,
          plans: { ...s.plans, [s.currentDate]: { ...p, areas: [...p.areas, name] } },
        };
      });
    },
    removeArea: (name) => {
      patchPlan((p) => ({
        ...p,
        areas: p.areas.filter((a) => a !== name),
        truckDay: p.truckDay.map((td) => ({
          ...td,
          areas: (td.areas ?? []).filter((a) => a !== name),
        })),
      }));
      mutate((s) => ({
        trips: s.trips.map((t) => ({
          ...t,
          towns: t.towns.filter((town) => town !== name),
        })),
      }));
    },

    setStep: (step) => {
      void flushSaveNow();
      patchPlan((p) => ({ ...p, step }));
    },
    setDate: (date) => {
      mutate((st) => {
        const existing = st.plans[date];
        return {
          currentDate: date,
          showResume: !!existing && !existing.locked && existing.invoices.length > 0,
        };
      });
      void (async () => {
        const existing = get().plans[date];
        const looksLikeStub =
          !!existing &&
          existing.invoices.length === 0 &&
          existing.areas.length === 0 &&
          existing.truckDay.length === 0;
        if (existing && !looksLikeStub) return;
        try {
          const remote = await fetchPlanFromCloud(date);
          if (!remote) return;
          set((st) => ({
            plans: { ...st.plans, [date]: remote },
            showResume:
              st.currentDate === date
                ? !remote.locked && remote.invoices.length > 0
                : st.showResume,
          }));
          await saveLocalSnapshot(toSnapshot(get()));
        } catch (err) {
          console.error("Failed to fetch plan for date", date, err);
        }
      })();
    },
    refreshPlanIndex: async () => {
      try {
        const rows = await listPlanIndexFromCloud();
        if (!rows.length) return;
        set((s) => {
          const plans = { ...s.plans };
          for (const r of rows) {
            if (plans[r.date] || isPlanDeletePending(r.date)) continue;
            plans[r.date] = {
              date: r.date,
              areas: [],
              tripIds: [],
              truckDay: [],
              invoices: [],
              dayStopOrder: {},
              locked: r.locked,
              createdAt: r.createdAt,
              step: r.step,
            };
          }
          return { plans };
        });
        await saveLocalSnapshot(toSnapshot(get()));
      } catch (err) {
        console.error("Failed to refresh plan index", err);
      }
    },
    openAuditPanel: () => {
      requestAuditPrune();
      scheduleSave();
    },
    setTruckDayTrip: (truckId, tripId) => {
      patchPlan((p) => {
        const exists = p.truckDay.find((t) => t.truckId === truckId);
        const next: TruckDay = {
          truckId,
          tripId,
          areas: exists?.areas,
        };
        const truckDay = exists
          ? p.truckDay.map((t) => (t.truckId === truckId ? next : t))
          : [...p.truckDay, next];
        // Keep plan.areas from tripIds when set; otherwise derive from truck assignments (legacy)
        if ((p.tripIds ?? []).length > 0) {
          return { ...p, truckDay };
        }
        const s = get();
        const areas = [
          ...new Set(truckDay.flatMap((td) => townsForTruckDay(td, s.trips))),
        ].sort((a, b) => a.localeCompare(b));
        return { ...p, truckDay, areas };
      });
    },
    setPlanTrips: (tripIds) => {
      const s = get();
      const clean = [...new Set(tripIds.filter(Boolean))];
      const areas = townsFromTripIds(clean, s.trips);
      patchPlan((p) => ({
        ...p,
        tripIds: clean,
        areas,
      }));
      log(
        "plan.trips",
        `Selected ${clean.length} trip(s) for ${s.currentDate}`,
      );
    },
    setTruckDayAreas: (truckId, areas) => {
      const clean = [...new Set(areas.filter(Boolean))];
      patchPlan((p) => {
        const exists = p.truckDay.find((t) => t.truckId === truckId);
        const truckDay = exists
          ? p.truckDay.map((t) =>
              t.truckId === truckId
                ? { ...t, tripId: t.tripId ?? null, areas: clean }
                : t,
            )
          : [...p.truckDay, { truckId, tripId: null, areas: clean }];
        return { ...p, truckDay };
      });
    },
    setTruckDayArea: (truckId, area) => {
      get().setTruckDayAreas(truckId, area ? [area] : []);
    },
    ensureTruckDay: () => {
      const s = get();
      patchPlan((p) => {
        const known = new Set(p.truckDay.map((t) => t.truckId));
        const additions: TruckDay[] = [];
        for (const t of s.trucks) {
          if (!known.has(t.id)) additions.push({ truckId: t.id, tripId: null, areas: [] });
        }
        if (!additions.length) return p;
        return { ...p, truckDay: [...p.truckDay, ...additions] };
      });
    },
    dismissResume: () => set({ showResume: false }),
    newPlan: (date) => {
      const d = date ?? tomorrowISO();
      mutate((s) => ({
        currentDate: d,
        showResume: false,
        plans: { ...s.plans, [d]: emptyPlan(d) },
      }));
      log("plan.new", `Started new plan for ${d}`);
    },

    importCustomers: (rows) => {
      const s = get();
      const customers = { ...s.customers };
      let added = 0;
      let skipped = 0;
      let updated = 0;
      const now = new Date().toISOString();
      for (const raw of rows) {
        const code = raw.code.trim();
        const name = raw.name.trim();
        if (!name) continue;
        const key = code || name;
        const existingKey = findCustomerKey(customers, code || name);
        if (existingKey && customers[existingKey]) {
          const prev = customers[existingKey];
          // Same code (or legacy name key): refresh name/code if needed
          if (prev.name === name && prev.code === code) {
            skipped++;
            continue;
          }
          const next = {
            ...prev,
            code: code || prev.code,
            name,
          };
          if (existingKey !== customerKey(next)) {
            delete customers[existingKey];
          }
          customers[customerKey(next)] = next;
          updated++;
          continue;
        }
        customers[key] = {
          code,
          name,
          defaultArea: "",
          loadingNumber: 0,
          firstSeen: now,
          collection: false,
        };
        added++;
      }
      mutate(() => ({ customers }));
      log(
        "customers.import",
        `Imported ${added} customers (${updated} updated, ${skipped} unchanged)`,
      );
      return { added, skipped, updated };
    },
    ensureCustomer: (input) => {
      const name = input.name.trim();
      const code = (input.code ?? "").trim();
      if (!name) return null;
      const area = (input.defaultArea ?? "").trim();
      const s = get();
      const existing = findCustomer(s.customers, code || name);
      if (existing) {
        const id = findCustomerKey(s.customers, code || name) ?? customerKey(existing);
        if (area && !existing.defaultArea) {
          get().setCustomerArea(id, area);
        }
        return findCustomer(get().customers, code || name) ?? existing;
      }
      const now = new Date().toISOString();
      const key = code || name;
      mutate((state) => {
        let customers: Record<string, CustomerMemory> = {
          ...state.customers,
          [key]: {
            code,
            name,
            defaultArea: "",
            loadingNumber: 0,
            firstSeen: now,
            collection: !!input.collection,
          },
        };
        let history = state.areaHistory;
        if (area) {
          customers = assignCustomerArea(customers, key, area);
          if (!history.includes(area)) history = [...history, area];
        }
        return { customers, areaHistory: history };
      });
      log("customers.add", `Added ${name}`);
      return get().customers[key] ?? null;
    },
    setCustomerArea: (key, area) => {
      mutate((s) => {
        const id = findCustomerKey(s.customers, key) ?? key;
        if (!s.customers[id]) return {};
        const customers = assignCustomerArea(s.customers, id, area);
        const history =
          area && !s.areaHistory.includes(area) ? [...s.areaHistory, area] : s.areaHistory;
        return { customers, areaHistory: history };
      });
      log("customers.area", `Set ${key} → ${area || "(none)"}`);
    },
    setCustomerLoadingNumber: (key, area, n) => {
      mutate((s) => {
        const id = findCustomerKey(s.customers, key) ?? key;
        if (!s.customers[id] || !area) return {};
        const customers = applyLoadingNumber(s.customers, id, area, n);
        const history = !s.areaHistory.includes(area) ? [...s.areaHistory, area] : s.areaHistory;
        return { customers, areaHistory: history };
      });
      log("customers.loading", `Set ${key} loading #${n} in ${area}`);
    },
    setCustomerCollection: (key, collection) => {
      mutate((s) => {
        const id = findCustomerKey(s.customers, key) ?? key;
        const prev = s.customers[id];
        if (!prev) return {};
        return {
          customers: {
            ...s.customers,
            [id]: { ...prev, collection: !!collection },
          },
        };
      });
      log(
        "customers.collection",
        collection ? `Marked ${key} as collection` : `Cleared collection on ${key}`,
      );
    },
    reorderCustomersInArea: (area, orderedNames) => {
      mutate((s) => {
        if (!area || orderedNames.length === 0) return {};
        return {
          customers: reorderCustomersInArea(s.customers, area, orderedNames),
        };
      });
      log("customers.reorder", `Reordered ${orderedNames.length} in ${area}`);
    },
    ensureArea: (name) => {
      const area = name.trim();
      if (!area) return;
      mutate((s) => {
        if (s.areaHistory.includes(area)) return {};
        return { areaHistory: [...s.areaHistory, area] };
      });
      log("area.ensure", `Added area ${area}`);
    },
    importAreas: (names) => {
      let added = 0;
      let skipped = 0;
      mutate((s) => {
        const history = [...s.areaHistory];
        const existing = new Set(history.map((a) => a.toLowerCase()));
        for (const raw of names) {
          const area = raw.trim();
          if (!area) continue;
          if (existing.has(area.toLowerCase())) {
            skipped++;
            continue;
          }
          existing.add(area.toLowerCase());
          history.push(area);
          added++;
        }
        if (added === 0) return {};
        return { areaHistory: history };
      });
      log("area.import", `Imported ${added} areas (${skipped} skipped)`);
      return { added, skipped };
    },
    deleteAreaCatalog: (name) => {
      const area = name.trim();
      if (!area) return;
      mutate((s) => {
        const customers = { ...s.customers };
        for (const [key, c] of Object.entries(customers)) {
          if (c.defaultArea === area) {
            customers[key] = { ...c, defaultArea: "", loadingNumber: 0 };
          }
        }
        const plans: typeof s.plans = {};
        for (const [date, p] of Object.entries(s.plans)) {
          plans[date] = {
            ...p,
            areas: (p.areas ?? []).filter((a) => a !== area),
            truckDay: (p.truckDay ?? []).map((td) => ({
              ...td,
              areas: (td.areas ?? []).filter((a) => a !== area),
            })),
          };
        }
        return {
          areaHistory: s.areaHistory.filter((a) => a !== area),
          customers,
          plans,
          trips: s.trips.map((t) => ({
            ...t,
            towns: t.towns.filter((town) => town !== area),
          })),
        };
      });
      log("area.delete", `Removed area ${area} from catalog`);
      void flushSaveNow();
    },

    deleteCustomer: (key) => {
      mutate((s) => {
        const id = findCustomerKey(s.customers, key) ?? key;
        if (!s.customers[id]) return {};
        const customers = { ...s.customers };
        delete customers[id];
        return { customers };
      });
      log("customers.delete", `Deleted customer ${key}`);
      void flushSaveNow();
    },

    addInvoices: (list) => {
      patchPlan((p) => ({
        ...p,
        invoices: [
          ...p.invoices,
          ...list.map((l) => ({
            ...l,
            id: uid(),
            truckId: null as string | null,
            round: 1,
          })),
        ],
      }));
    },
    addAdhoc: () => {
      patchPlan((p) => ({
        ...p,
        invoices: [
          ...p.invoices,
          {
            id: uid(),
            doc: "",
            customer: "",
            weight: 0,
            area: "",
            source: "ADHOC" as const,
            truckId: null,
            round: 1,
          },
        ],
      }));
    },
    updateInvoice: (id, patch) => {
      patchPlan((p) => ({
        ...p,
        invoices: p.invoices.map((i) => {
          if (i.id !== id) return i;
          const next = { ...i, ...patch };
          if (typeof next.weight === "number" && next.weight < 0) {
            next.creditNote = true;
          }
          return next;
        }),
      }));
    },
    removeInvoice: (id) => {
      patchPlan((p) => ({ ...p, invoices: p.invoices.filter((i) => i.id !== id) }));
    },
    confirmImport: () => {
      const s = get();
      const plan = s.plans[s.currentDate] ?? emptyPlan(s.currentDate);
      let customers = { ...s.customers };
      let known = 0;
      let learned = 0;
      const now = new Date().toISOString();
      for (const inv of plan.invoices) {
        if (!inv.customer) continue;
        const key = findCustomerKey(customers, inv.customer);
        if (key) {
          known++;
          if (!customers[key].defaultArea && inv.area) {
            customers = assignCustomerArea(customers, key, inv.area);
          }
        } else if (inv.area) {
          customers[inv.customer] = {
            code: "",
            name: inv.customer,
            defaultArea: "",
            loadingNumber: 0,
            firstSeen: now,
          };
          customers = assignCustomerArea(customers, inv.customer, inv.area);
          learned++;
        }
      }
      mutate(() => ({ customers }));
      log("import.confirm", `${known} known, ${learned} newly learned`);
      return { known, learned };
    },

    importInvoiceRows: (rows) => {
      let added = 0;
      let held = 0;
      let skipped = 0;
      const now = new Date().toISOString();
      mutate((s) => {
        const plan = s.plans[s.currentDate] ?? emptyPlan(s.currentDate);
        const todayTowns = new Set(townsForPlan(plan, s.trips));
        const existingDocs = new Set<string>();
        for (const i of plan.invoices) if (i.doc) existingDocs.add(i.doc);
        for (const h of s.heldInvoices) if (h.doc) existingDocs.add(h.doc);

        let customers = { ...s.customers };
        const newInvoices: Invoice[] = [];
        const newHeld: HeldInvoice[] = [];

        for (const row of rows) {
          const doc = (row.doc || "").trim();
          const rawName = (row.customer || "").trim();
          if (!doc || !rawName) continue;
          if (existingDocs.has(doc)) {
            skipped++;
            continue;
          }
          existingDocs.add(doc);

          const known =
            (row.customerCode ? findCustomer(customers, row.customerCode) : undefined) ??
            findCustomer(customers, rawName);
          const name = known?.name || rawName;
          const area = known?.defaultArea ?? "";
          const isCollection = !!known?.collection;

          if (!known) {
            const key = customerKey({ code: row.customerCode ?? "", name });
            customers[key || name] = {
              code: (row.customerCode ?? "").trim(),
              name,
              defaultArea: "",
              loadingNumber: 0,
              firstSeen: now,
            };
          } else if (area && !known.defaultArea) {
            customers = assignCustomerArea(customers, customerKey(known) || known.name, area);
          }

          const onToday = !area || todayTowns.has(area);
          if (!onToday && !isCollection) {
            newHeld.push(
              normalizeHeldInvoice({
                id: uid(),
                doc,
                customer: name,
                weight: 0,
                area,
                source: "SYSTEM",
                heldAt: now,
                reason: "town_not_on_trips",
              }),
            );
            held++;
          } else {
            newInvoices.push({
              id: uid(),
              doc,
              customer: name,
              weight: 0,
              area,
              source: "SYSTEM",
              truckId: null,
              round: 1,
              collection: isCollection,
            });
            added++;
          }
        }

        if (!added && !held) {
          return skipped ? {} : {};
        }

        return {
          customers,
          heldInvoices: newHeld.length ? [...s.heldInvoices, ...newHeld] : s.heldInvoices,
          plans: {
            ...s.plans,
            [s.currentDate]: {
              ...plan,
              invoices: newInvoices.length ? [...plan.invoices, ...newInvoices] : plan.invoices,
            },
          },
        };
      });
      if (added || held) {
        log(
          "import.excel",
          `Excel import: +${added} plan, +${held} held, ${skipped} duplicate(s) skipped`,
        );
      }
      return { added, held, skipped };
    },

    holdInvoices: (items, reason) => {
      const now = new Date().toISOString();
      let added = 0;
      mutate((s) => {
        const existingDocs = new Set(s.heldInvoices.map((h) => h.doc));
        const fresh = items.filter((item) => item.doc && !existingDocs.has(item.doc));
        added = fresh.length;
        if (!fresh.length) return {};
        return {
          heldInvoices: [
            ...s.heldInvoices,
            ...fresh.map((item) =>
              normalizeHeldInvoice({
                id: uid(),
                doc: item.doc,
                customer: item.customer,
                weight: item.weight,
                area: item.area,
                source: item.source,
                heldAt: now,
                reason,
                creditNote: reason === "credit_note" || (typeof item.weight === "number" && item.weight < 0),
              }),
            ),
          ],
        };
      });
      if (added) log("held.add", `Held ${added} invoice(s) (${reason})`);
      return added;
    },

    holdFromPlan: (invoiceId) => {
      const s = get();
      const plan = s.plans[s.currentDate];
      const inv = plan?.invoices.find((i) => i.id === invoiceId);
      if (!inv || !inv.doc) return false;
      if (s.heldInvoices.some((h) => h.doc === inv.doc)) {
        // Already held — just remove from plan
        patchPlan((p) => ({ ...p, invoices: p.invoices.filter((i) => i.id !== invoiceId) }));
        return true;
      }
      const now = new Date().toISOString();
      const reason: HeldInvoice["reason"] = inv.creditNote
        ? "credit_note"
        : inv.collection
          ? "collection"
          : "manual";
      mutate((st) => ({
        heldInvoices: [
          ...st.heldInvoices,
          normalizeHeldInvoice({
            id: uid(),
            doc: inv.doc,
            customer: inv.customer,
            weight: inv.weight,
            area: inv.area,
            source: inv.source,
            heldAt: now,
            reason,
            collection: !!inv.collection,
            creditNote: !!inv.creditNote,
          }),
        ],
        plans: {
          ...st.plans,
          [st.currentDate]: {
            ...(st.plans[st.currentDate] ?? emptyPlan(st.currentDate)),
            invoices: (st.plans[st.currentDate]?.invoices ?? []).filter((i) => i.id !== invoiceId),
          },
        },
      }));
      log("held.from_plan", `Held ${inv.doc} from plan`);
      void flushSaveNow();
      return true;
    },

    pickHeld: (id, opts) => {
      const s = get();
      const held = s.heldInvoices.find((h) => h.id === id);
      if (!held) return "missing";
      const plan = s.plans[s.currentDate] ?? emptyPlan(s.currentDate);
      if (held.doc && plan.invoices.some((i) => i.doc === held.doc)) return "duplicate";

      const todayTowns = new Set(townsForPlan(plan, s.trips));
      const offTrip = !!held.area && !todayTowns.has(held.area);
      const asException = !!opts?.asException;
      const asCollection = !!opts?.asCollection || !!held.collection;
      const asCreditNote = !!opts?.asCreditNote || !!held.creditNote;
      if (offTrip && !asException && !asCollection && !asCreditNote) return "off_trip";

      mutate((st) => ({
        heldInvoices: st.heldInvoices.filter((h) => h.id !== id),
        plans: {
          ...st.plans,
          [st.currentDate]: {
            ...(st.plans[st.currentDate] ?? emptyPlan(st.currentDate)),
            invoices: [
              ...(st.plans[st.currentDate]?.invoices ?? []),
              {
                id: uid(),
                doc: held.doc,
                customer: held.customer,
                weight: held.weight,
                area: held.area,
                source: held.source,
                truckId: null,
                round: 1,
                exception: asException || (offTrip && (asCollection || asCreditNote)),
                collection: asCollection,
                creditNote: asCreditNote,
              },
            ],
          },
        },
      }));
      log(
        "held.pick",
        `Picked ${held.doc} into plan${asException ? " (exception)" : ""}${asCollection ? " (collection)" : ""}${asCreditNote ? " (credit)" : ""}`,
      );
      void flushSaveNow();
      return "ok";
    },

    updateHeld: (id, patch) => {
      mutate((s) => ({
        heldInvoices: s.heldInvoices.map((h) => {
          if (h.id !== id) return h;
          return normalizeHeldInvoice({ ...h, ...patch });
        }),
      }));
    },

    setHeldCollection: (id, collection) => {
      mutate((s) => ({
        heldInvoices: s.heldInvoices.map((h) => {
          if (h.id !== id) return h;
          return normalizeHeldInvoice({
            ...h,
            collection,
            reason: collection ? "collection" : h.reason === "collection" ? "manual" : h.reason,
          });
        }),
      }));
      log("held.collection", collection ? `Marked ${id} as collection` : `Cleared collection on ${id}`);
    },

    removeHeld: (id) => {
      const held = get().heldInvoices.find((h) => h.id === id);
      mutate((s) => ({
        heldInvoices: s.heldInvoices.filter((h) => h.id !== id),
      }));
      if (held) log("held.remove", `Removed held ${held.doc}`);
      void flushSaveNow();
    },

    runAllocation: () => {
      const s = get();
      patchPlan((p) => allocate(p, s.trucks, s.customers, s.trips));
      log("allocate.run", "Ran auto allocation");
    },
    moveInvoice: (invId, truckId, reason) => {
      const s = get();
      const plan = s.plans[s.currentDate];
      const prev = plan?.invoices.find((i) => i.id === invId);
      const beforeTruck = prev?.truckId ?? null;
      const beforeRound = prev?.round ?? 1;
      patchPlan((p) => ({
        ...p,
        invoices: p.invoices.map((i) =>
          i.id === invId ? { ...i, truckId, round: 1 } : i,
        ),
      }));
      log(
        "invoice.move",
        `Moved ${invId} → ${truckId ?? "UNALLOCATED"}${reason ? ` (${reason})` : ""}`,
      );
      get().pushUndo({
        label: "Undo move",
        undo: () => {
          patchPlan((p) => ({
            ...p,
            invoices: p.invoices.map((i) =>
              i.id === invId ? { ...i, truckId: beforeTruck, round: beforeRound } : i,
            ),
          }));
          log("undo", "Undid move");
        },
      });
    },
    bulkMove: (ids, truckId) => {
      const s = get();
      const plan = s.plans[s.currentDate];
      const before = new Map<string, { truckId: string | null; round: number }>();
      plan?.invoices.forEach((i) => {
        if (ids.includes(i.id)) before.set(i.id, { truckId: i.truckId, round: i.round ?? 1 });
      });
      patchPlan((p) => ({
        ...p,
        invoices: p.invoices.map((i) =>
          ids.includes(i.id) ? { ...i, truckId, round: 1 } : i,
        ),
      }));
      log("invoice.bulkMove", `Bulk moved ${ids.length} → ${truckId ?? "UNALLOCATED"}`);
      get().pushUndo({
        label: "Undo bulk move",
        undo: () => {
          patchPlan((p) => ({
            ...p,
            invoices: p.invoices.map((i) =>
              before.has(i.id)
                ? { ...i, truckId: before.get(i.id)!.truckId, round: before.get(i.id)!.round }
                : i,
            ),
          }));
          log("undo", "Undid bulk move");
        },
      });
    },
    setInvoiceRound: (ids, round) => {
      const r = round === 2 ? 2 : 1;
      const s = get();
      const plan = s.plans[s.currentDate];
      const before = new Map<string, number>();
      plan?.invoices.forEach((i) => {
        if (ids.includes(i.id)) before.set(i.id, i.round ?? 1);
      });
      patchPlan((p) => ({
        ...p,
        invoices: p.invoices.map((i) => (ids.includes(i.id) ? { ...i, round: r } : i)),
      }));
      log("invoice.round", `Set ${ids.length} invoice(s) to round ${r}`);
      get().pushUndo({
        label: r === 2 ? "Undo second round" : "Undo round change",
        undo: () => {
          patchPlan((p) => ({
            ...p,
            invoices: p.invoices.map((i) =>
              before.has(i.id) ? { ...i, round: before.get(i.id)! } : i,
            ),
          }));
          log("undo", "Undid round change");
        },
      });
    },
    sendToSecondRound: (truckId, invoiceIds) => {
      const s = get();
      const plan = s.plans[s.currentDate] ?? emptyPlan(s.currentDate);
      const truck = s.trucks.find((t) => t.id === truckId);
      if (!truck) return 0;

      let ids: string[];
      if (invoiceIds && invoiceIds.length > 0) {
        ids = invoiceIds.filter((id) => {
          const inv = plan.invoices.find((i) => i.id === id);
          return inv?.truckId === truckId && (inv.round ?? 1) !== 2;
        });
      } else {
        ids = overflowInvoiceIds(
          plan.invoices,
          truckId,
          truck.maxWeight,
          s.customers,
          plan.truckDay.find((td) => td.truckId === truckId)?.tripId,
          s.trips,
          plan.dayStopOrder,
        );
      }
      if (ids.length === 0) return 0;
      get().setInvoiceRound(ids, 2);
      return ids.length;
    },

    pushUndo: (a) =>
      set((s) => ({ undoStack: [a, ...s.undoStack].slice(0, 50) })),
    undo: () => {
      const s = get();
      const [top, ...rest] = s.undoStack;
      if (!top) return;
      set({ undoStack: rest });
      top.undo();
      log("undo", top.label);
    },

    lockPlan: () => {
      patchPlan((p) => ({ ...p, locked: true }));
      log("plan.lock", "Locked manifests");
    },
    unlockPlan: () => {
      patchPlan((p) => ({ ...p, locked: false }));
      log("plan.unlock", "Unlocked manifests (admin)");
    },

    log,

    deleteDay: (date) => {
      mutate((s) => {
        const { [date]: _, ...rest } = s.plans;
        return { plans: rest };
      });
      log("plan.delete", `Deleted plan ${date}`);
      void flushSaveNow();
    },
    exportJSON: () => {
      const s = get();
      return JSON.stringify(
        {
          trucks: s.trucks,
          trips: s.trips,
          customers: s.customers,
          areaHistory: s.areaHistory,
          heldInvoices: s.heldInvoices,
          plans: s.plans,
          audit: s.audit,
        },
        null,
        2,
      );
    },
    setPin: (pin) => {
      mutate(() => ({ adminPin: pin }));
      log("admin.pin", "Admin pin updated");
    },
    checkPin: (pin) => {
      const s = get();
      return !s.adminPin || s.adminPin === pin;
    },
  };
});

export const stepList: Plan["step"][] = [
  "setup",
  "import",
  "allocate",
  "adjust",
  "lock",
  "print",
];

export const stepLabels: Record<Plan["step"], string> = {
  setup: "1. Daily Setup",
  import: "2. Enter Invoices",
  allocate: "3. Trucks & Allocation",
  adjust: "4. Adjust",
  lock: "5. Lock",
  print: "6. Print",
};
