import { create } from "zustand";
import { loadKey, saveKey } from "./db";
import type {
  AuditEntry,
  CustomerMemory,
  Invoice,
  Plan,
  Truck,
} from "./types";
import { allocate } from "./allocation";

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

  // plan
  setStep: (step: Plan["step"]) => void;
  setDate: (date: string) => void;
  setTruckDayArea: (truckId: string, area: string) => void;
  ensureTruckDay: () => void;
  dismissResume: () => void;
  newPlan: (date?: string) => void;

  // invoices
  addInvoices: (list: Omit<Invoice, "id" | "truckId">[]) => void;
  addAdhoc: () => void;
  updateInvoice: (id: string, patch: Partial<Invoice>) => void;
  removeInvoice: (id: string) => void;
  confirmImport: () => { known: number; learned: number };

  // allocation
  runAllocation: () => void;
  moveInvoice: (invId: string, truckId: string | null, reason?: string) => void;
  bulkMove: (ids: string[], truckId: string | null) => void;

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
      const [trucks, customers, areaHistory, plans, audit, currentDate, adminPin] =
        await Promise.all([
          loadKey<Truck[]>(K.trucks, []),
          loadKey<Record<string, CustomerMemory>>(K.customers, {}),
          loadKey<string[]>(K.areaHistory, []),
          loadKey<Record<string, Plan>>(K.plans, {}),
          loadKey<AuditEntry[]>(K.audit, []),
          loadKey<string>(K.currentDate, tomorrowISO()),
          loadKey<string>(K.adminPin, ""),
        ]);
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
        truckDay: p.truckDay.map((td) => (td.area === name ? { ...td, area: "" } : td)),
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
    setTruckDayArea: (truckId, area) => {
      patchPlan((p) => {
        const exists = p.truckDay.find((t) => t.truckId === truckId);
        const truckDay = exists
          ? p.truckDay.map((t) => (t.truckId === truckId ? { ...t, area } : t))
          : [...p.truckDay, { truckId, area }];
        return { ...p, truckDay };
      });
    },
    ensureTruckDay: () => {
      const s = get();
      patchPlan((p) => {
        const known = new Set(p.truckDay.map((t) => t.truckId));
        const additions: { truckId: string; area: string }[] = [];
        for (const t of s.trucks) {
          if (!known.has(t.id)) additions.push({ truckId: t.id, area: "" });
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

    addInvoices: (list) => {
      patchPlan((p) => ({
        ...p,
        invoices: [
          ...p.invoices,
          ...list.map((l) => ({ ...l, id: uid(), truckId: null as string | null })),
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
            source: "ADHOC",
            truckId: null,
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
      const customers = { ...s.customers };
      let known = 0;
      let learned = 0;
      const now = new Date().toISOString();
      for (const inv of plan.invoices) {
        if (!inv.customer) continue;
        if (customers[inv.customer]) {
          known++;
          // ensure area recorded
          if (!customers[inv.customer].defaultArea && inv.area) {
            customers[inv.customer].defaultArea = inv.area;
          }
        } else {
          if (inv.area) {
            customers[inv.customer] = {
              name: inv.customer,
              defaultArea: inv.area,
              firstSeen: now,
            };
            learned++;
          }
        }
      }
      mutate(() => ({ customers }));
      log("import.confirm", `${known} known, ${learned} newly learned`);
      return { known, learned };
    },

    runAllocation: () => {
      const s = get();
      patchPlan((p) => allocate(p, s.trucks));
      log("allocate.run", "Ran auto allocation");
    },
    moveInvoice: (invId, truckId, reason) => {
      const s = get();
      const plan = s.plans[s.currentDate];
      const before = plan?.invoices.find((i) => i.id === invId)?.truckId ?? null;
      patchPlan((p) => ({
        ...p,
        invoices: p.invoices.map((i) => (i.id === invId ? { ...i, truckId } : i)),
      }));
      log(
        "invoice.move",
        `Moved ${invId} → ${truckId ?? "UNALLOCATED"}${reason ? ` (${reason})` : ""}`,
      );
      get().pushUndo({
        label: "Undo move",
        undo: () => get().moveInvoice(invId, before),
      });
    },
    bulkMove: (ids, truckId) => {
      const s = get();
      const plan = s.plans[s.currentDate];
      const before = new Map<string, string | null>();
      plan?.invoices.forEach((i) => {
        if (ids.includes(i.id)) before.set(i.id, i.truckId);
      });
      patchPlan((p) => ({
        ...p,
        invoices: p.invoices.map((i) => (ids.includes(i.id) ? { ...i, truckId } : i)),
      }));
      log("invoice.bulkMove", `Bulk moved ${ids.length} → ${truckId ?? "UNALLOCATED"}`);
      get().pushUndo({
        label: "Undo bulk move",
        undo: () => {
          patchPlan((p) => ({
            ...p,
            invoices: p.invoices.map((i) =>
              before.has(i.id) ? { ...i, truckId: before.get(i.id)! } : i,
            ),
          }));
          log("undo", "Undid bulk move");
        },
      });
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
