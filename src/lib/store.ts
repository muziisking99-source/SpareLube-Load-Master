import { create } from "zustand";
import { loadKey, saveKey } from "./db";
import type {
  AuditEntry,
  CustomerMemory,
  Invoice,
  Plan,
  Truck,
  TruckDay,
} from "./types";
import { normalizeCustomer, normalizeInvoice, normalizeTruckDay } from "./types";
import { allocate, overflowInvoiceIds } from "./allocation";
import {
  assignCustomerArea,
  reorderCustomersInArea,
  setCustomerLoadingNumber as applyLoadingNumber,
} from "./loadingOrder";
import { customerKey, findCustomerKey } from "./customers";

const K = {
  trucks: "lp:trucks",
  customers: "lp:customers",
  areaHistory: "lp:areaHistory",
  plans: "lp:plans",
  audit: "lp:audit",
  currentDate: "lp:currentDate",
  adminPin: "lp:adminPin",
};

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
    truckDay: [],
    invoices: [],
    locked: false,
    createdAt: new Date().toISOString(),
    step: "setup",
  };
}

type UndoAction = { label: string; undo: () => void };

type State = {
  hydrated: boolean;
  trucks: Truck[];
  customers: Record<string, CustomerMemory>;
  areaHistory: string[];
  plans: Record<string, Plan>;
  audit: AuditEntry[];
  currentDate: string;
  undoStack: UndoAction[];
  showResume: boolean;

  hydrate: () => Promise<void>;
  currentPlan: () => Plan;

  // trucks
  addTruck: (t: Omit<Truck, "id">) => void;
  updateTruck: (id: string, patch: Partial<Truck>) => void;
  deleteTruck: (id: string) => void;

  // areas
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
  setTruckDayAreas: (truckId: string, areas: string[]) => void;
  /** @deprecated use setTruckDayAreas — kept as convenience for single area */
  setTruckDayArea: (truckId: string, area: string) => void;
  ensureTruckDay: () => void;
  dismissResume: () => void;
  newPlan: (date?: string) => void;

  // customers
  importCustomers: (
    rows: { code: string; name: string }[],
  ) => { added: number; skipped: number; updated: number };
  setCustomerArea: (name: string, area: string) => void;
  setCustomerLoadingNumber: (name: string, area: string, n: number) => void;
  reorderCustomersInArea: (area: string, orderedNames: string[]) => void;
  deleteCustomer: (name: string) => void;

  // invoices
  addInvoices: (list: Omit<Invoice, "id" | "truckId" | "round">[]) => void;
  addAdhoc: () => void;
  updateInvoice: (id: string, patch: Partial<Invoice>) => void;
  removeInvoice: (id: string) => void;
  confirmImport: () => { known: number; learned: number };

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

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(state: State) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveKey(K.trucks, state.trucks);
    saveKey(K.customers, state.customers);
    saveKey(K.areaHistory, state.areaHistory);
    saveKey(K.plans, state.plans);
    saveKey(K.audit, state.audit);
    saveKey(K.currentDate, state.currentDate);
    saveKey(K.adminPin, state.adminPin);
  }, 120);
}

export const useStore = create<State>((set, get) => {
  const persist = () => scheduleSave(get());
  const mutate = (fn: (s: State) => Partial<State> | void) => {
    set((s) => {
      const patch = fn(s);
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
    trucks: [],
    customers: {},
    areaHistory: [],
    plans: {},
    audit: [],
    currentDate: tomorrowISO(),
    undoStack: [],
    showResume: false,
    adminPin: "",

    hydrate: async () => {
      try {
        const [trucks, customersRaw, areaHistory, plansRaw, audit, currentDate, adminPin] =
          await Promise.all([
            loadKey<Truck[]>(K.trucks, []),
            loadKey<Record<string, CustomerMemory>>(K.customers, {}),
            loadKey<string[]>(K.areaHistory, []),
            loadKey<Record<string, Plan>>(K.plans, {}),
            loadKey<AuditEntry[]>(K.audit, []),
            loadKey<string>(K.currentDate, tomorrowISO()),
            loadKey<string>(K.adminPin, ""),
          ]);

        const customers: Record<string, CustomerMemory> = {};
        for (const [k, v] of Object.entries(customersRaw ?? {})) {
          const c = normalizeCustomer({ ...v, name: v?.name ?? k, code: v?.code ?? "" });
          customers[customerKey(c) || k] = c;
        }

        const plans: Record<string, Plan> = {};
        for (const [date, p] of Object.entries(plansRaw ?? {})) {
          plans[date] = {
            ...p,
            truckDay: (p.truckDay ?? []).map((td) =>
              normalizeTruckDay(td as TruckDay & { area?: string }),
            ),
            invoices: (p.invoices ?? []).map((i) =>
              normalizeInvoice(i as Parameters<typeof normalizeInvoice>[0]),
            ),
          };
        }

        const existing = plans[currentDate];
        const showResume = !!existing && !existing.locked && existing.invoices.length > 0;
        set({
          hydrated: true,
          trucks,
          customers,
          areaHistory,
          plans,
          audit,
          currentDate,
          adminPin,
          showResume,
        });
      } catch {
        set({ hydrated: true });
      }
    },

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
    },

    setStep: (step) => patchPlan((p) => ({ ...p, step })),
    setDate: (date) =>
      mutate((s) => {
        const existing = s.plans[date];
        return {
          currentDate: date,
          showResume: !!existing && !existing.locked && existing.invoices.length > 0,
        };
      }),
    setTruckDayAreas: (truckId, areas) => {
      const clean = [...new Set(areas.filter(Boolean))];
      patchPlan((p) => {
        const exists = p.truckDay.find((t) => t.truckId === truckId);
        const truckDay = exists
          ? p.truckDay.map((t) => (t.truckId === truckId ? { ...t, areas: clean } : t))
          : [...p.truckDay, { truckId, areas: clean }];
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
          if (!known.has(t.id)) additions.push({ truckId: t.id, areas: [] });
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
        };
      });
      log("area.delete", `Removed area ${area} from catalog`);
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
        invoices: p.invoices.map((i) => (i.id === id ? { ...i, ...patch } : i)),
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

    runAllocation: () => {
      const s = get();
      patchPlan((p) => allocate(p, s.trucks, s.customers));
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
        ids = overflowInvoiceIds(plan.invoices, truckId, truck.maxWeight, s.customers);
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
    },
    exportJSON: () => {
      const s = get();
      return JSON.stringify(
        {
          trucks: s.trucks,
          customers: s.customers,
          areaHistory: s.areaHistory,
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
  import: "2. Import & Review",
  allocate: "3. Auto Allocation",
  adjust: "4. Adjust",
  lock: "5. Lock",
  print: "6. Print",
};
