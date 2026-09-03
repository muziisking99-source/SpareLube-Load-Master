import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getAdminGateStatus, lockAdmin } from "@/lib/adminGate.functions";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, FileSpreadsheet, Lock, Upload } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { parseAreaExcelFile, parseCustomerExcelFile } from "@/lib/parse";
import {
  downloadAreaTemplate,
  downloadCustomerTemplate,
} from "@/lib/excelTemplates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/planner/ui/EmptyState";
import { usePagination } from "@/hooks/use-pagination";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { PlannerSkeleton } from "@/components/planner/PlannerSkeleton";
import { CustomerAreaBoard } from "@/components/planner/CustomerAreaBoard";
import { LoadingNumbersBoard } from "@/components/planner/LoadingNumbersBoard";
import { TripsAdminPanel } from "@/components/planner/TripsAdminPanel";
import { TownFilterBar } from "@/components/planner/TownFilterBar";
import {
  AdminSearchInput,
  customerMatchesQuery,
  matchesQuery,
} from "@/components/planner/AdminSearchInput";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SyncStatusChip } from "@/components/planner/SyncStatusChip";
import { useRowHighlight } from "@/lib/useRowHighlight";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { customersInArea } from "@/lib/loadingOrder";
import { isWarehouseDirty } from "@/lib/cloudSync";
import type { CustomerMemory } from "@/lib/types";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const { unlocked } = await getAdminGateStatus();
    if (!unlocked) throw redirect({ to: "/admin-unlock" });
  },
  head: () => ({
    meta: [
      { title: "Admin — Load Planner" },
      { name: "description", content: "Load Planner admin console." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});


function AdminPage() {
  const hydrated = useStore((s) => s.hydrated);

  const hydrate = useStore((s) => s.hydrate);
  const adminPin = useStore((s) => s.adminPin);
  const setPin = useStore((s) => s.setPin);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const flushPending = () => {
      void useStore.getState().flushSave();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushPending();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      flushPending();
      if (isWarehouseDirty()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("pagehide", flushPending);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      flushPending();
      window.removeEventListener("pagehide", flushPending);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  if (!hydrated) {
    return <PlannerSkeleton />;
  }

  // Server session gate (/admin-unlock) already verified access — no second PIN screen.
  return <AdminConsole onSetPin={setPin} currentPin={adminPin} />;
}

function AdminConsole({
  onSetPin,
  currentPin,
}: {
  onSetPin: (p: string) => void;
  currentPin: string;
}) {
  const router = useRouter();
  const lock = useServerFn(lockAdmin);
  const customers = useStore((s) => s.customers);
  const areaHistory = useStore((s) => s.areaHistory);
  const plans = useStore((s) => s.plans);
  const trucks = useStore((s) => s.trucks);
  const audit = useStore((s) => s.audit);
  const exportJSON = useStore((s) => s.exportJSON);
  const deleteDay = useStore((s) => s.deleteDay);
  const unlockPlan = useStore((s) => s.unlockPlan);
  const setDate = useStore((s) => s.setDate);
  const addTruck = useStore((s) => s.addTruck);
  const updateTruck = useStore((s) => s.updateTruck);
  const deleteTruck = useStore((s) => s.deleteTruck);
  const importCustomers = useStore((s) => s.importCustomers);
  const setCustomerArea = useStore((s) => s.setCustomerArea);
  const setCustomerLoadingNumber = useStore((s) => s.setCustomerLoadingNumber);
  const setCustomerCollection = useStore((s) => s.setCustomerCollection);
  const ensureArea = useStore((s) => s.ensureArea);
  const importAreas = useStore((s) => s.importAreas);
  const deleteAreaCatalog = useStore((s) => s.deleteAreaCatalog);
  const deleteCustomer = useStore((s) => s.deleteCustomer);
  const { highlightProps } = useRowHighlight();

  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [importing, setImporting] = useState(false);
  const [importingAreas, setImportingAreas] = useState(false);
  const [newArea, setNewArea] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [townSearch, setTownSearch] = useState("");
  const [loadingSearch, setLoadingSearch] = useState("");
  const [truckSearch, setTruckSearch] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [planSearch, setPlanSearch] = useState("");
  const [adminTab, setAdminTab] = useState("customers");
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: "customer"; name: string }
    | { kind: "town"; name: string; count: number }
    | { kind: "truck"; id: string; name: string }
    | { kind: "plan"; date: string }
    | null
  >(null);
  const openAuditPanel = useStore((s) => s.openAuditPanel);
  const refreshPlanIndex = useStore((s) => s.refreshPlanIndex);
  const fileRef = useRef<HTMLInputElement>(null);
  const areaFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adminTab === "audit") openAuditPanel();
    if (adminTab === "plans") void refreshPlanIndex();
  }, [adminTab, openAuditPanel, refreshPlanIndex]);

  const areaOptions = useMemo(() => {
    const set = new Set<string>(areaHistory);
    for (const p of Object.values(plans)) {
      for (const a of p.areas ?? []) set.add(a);
    }
    for (const c of Object.values(customers)) {
      if (c.defaultArea) set.add(c.defaultArea);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [areaHistory, plans, customers]);

  const unassigned = useMemo(
    () =>
      Object.values(customers)
        .filter((c) => !c.defaultArea && !c.collection)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [customers],
  );

  /** Collection customers without a town — not “unassigned”, they belong in Collections. */
  const collectionCustomers = useMemo(
    () =>
      Object.values(customers)
        .filter((c) => !!c.collection && !c.defaultArea)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [customers],
  );

  const customersByArea = useMemo(() => {
    const map: Record<string, typeof unassigned> = {};
    for (const a of areaOptions) {
      map[a] = customersInArea(customers, a);
    }
    return map;
  }, [customers, areaOptions]);

  const townCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of areaOptions) {
      counts[a] = customersByArea[a]?.length ?? 0;
    }
    return counts;
  }, [areaOptions, customersByArea]);

  const visibleAreas = useMemo(() => {
    if (areaFilter === "all") return areaOptions;
    if (areaFilter === "unassigned" || areaFilter === "collection") return [];
    return areaOptions.filter((a) => a === areaFilter);
  }, [areaFilter, areaOptions]);

  const showUnassigned = areaFilter === "all" || areaFilter === "unassigned";
  const showCollections = areaFilter === "all" || areaFilter === "collection";

  const filteredUnassigned = useMemo(
    () => unassigned.filter((c) => customerMatchesQuery(c, customerSearch)),
    [unassigned, customerSearch],
  );

  const filteredCollections = useMemo(
    () => collectionCustomers.filter((c) => customerMatchesQuery(c, customerSearch)),
    [collectionCustomers, customerSearch],
  );

  const filteredCustomersByArea = useMemo(() => {
    const map: Record<string, CustomerMemory[]> = {};
    for (const a of areaOptions) {
      map[a] = (customersByArea[a] ?? []).filter((c) =>
        customerMatchesQuery(c, customerSearch),
      );
    }
    return map;
  }, [areaOptions, customersByArea, customerSearch]);

  const customerBoardAreas = useMemo(() => {
    if (!customerSearch.trim()) return visibleAreas;
    return visibleAreas.filter((a) => (filteredCustomersByArea[a]?.length ?? 0) > 0);
  }, [visibleAreas, customerSearch, filteredCustomersByArea]);

  const filteredTowns = useMemo(
    () => areaOptions.filter((a) => matchesQuery(a, townSearch)),
    [areaOptions, townSearch],
  );

  const loadingCustomersByArea = useMemo(() => {
    const map: Record<string, CustomerMemory[]> = {};
    for (const a of areaOptions) {
      map[a] = (customersByArea[a] ?? []).filter((c) =>
        customerMatchesQuery(c, loadingSearch),
      );
    }
    return map;
  }, [areaOptions, customersByArea, loadingSearch]);

  const loadingBoardAreas = useMemo(() => {
    const base =
      areaFilter !== "all" && areaFilter !== "unassigned" && areaFilter !== "collection"
        ? areaOptions.filter((a) => a === areaFilter)
        : areaOptions.filter((a) => (customersByArea[a]?.length ?? 0) > 0);
    if (!loadingSearch.trim()) return base;
    return base.filter((a) => (loadingCustomersByArea[a]?.length ?? 0) > 0);
  }, [areaFilter, areaOptions, customersByArea, loadingSearch, loadingCustomersByArea]);

  const filteredTrucks = useMemo(
    () => trucks.filter((t) => matchesQuery(t.name, truckSearch)),
    [trucks, truckSearch],
  );

  const filteredAudit = useMemo(
    () =>
      audit.filter(
        (a) =>
          matchesQuery(a.type, auditSearch) ||
          matchesQuery(a.message, auditSearch) ||
          matchesQuery(new Date(a.ts).toLocaleString(), auditSearch),
      ),
    [audit, auditSearch],
  );

  const filteredPlans = useMemo(() => {
    const list = Object.values(plans).sort((a, b) => (a.date < b.date ? 1 : -1));
    const q = planSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.date.includes(q) ||
        (p.locked && "locked".includes(q)) ||
        String(p.invoices.length).includes(q),
    );
  }, [plans, planSearch]);

  const auditPagination = usePagination(filteredAudit, 100);
  const plansPagination = usePagination(filteredPlans, 30);

  const emptyMessage = useMemo(() => {
    if (Object.keys(customers).length === 0) {
      return {
        title: "No customers yet",
        description:
          "Import Excel with Customer Code and Customer Name columns, then assign towns. Set load numbers on the Load # tab.",
      };
    }
    if (customerSearch.trim()) {
      const any =
        (showUnassigned && filteredUnassigned.length > 0) ||
        (showCollections && filteredCollections.length > 0) ||
        customerBoardAreas.some((a) => (filteredCustomersByArea[a]?.length ?? 0) > 0);
      if (!any) {
        return {
          title: "No matching customers",
          description: `Nothing matched “${customerSearch.trim()}”. Try another code or name.`,
        };
      }
    }
    if (areaFilter === "unassigned" && unassigned.length === 0) {
      return {
        title: "No unassigned customers",
        description: "Every customer has a town or is marked collection. Switch to All or pick a town.",
      };
    }
    if (areaFilter === "collection" && collectionCustomers.length === 0) {
      return {
        title: "No collection customers",
        description: "Mark customers as Collection to list them here (no town required).",
      };
    }
    if (areaFilter !== "all" && areaFilter !== "unassigned" && areaFilter !== "collection") {
      const list = customersByArea[areaFilter] ?? [];
      if (list.length === 0) {
        return {
          title: `No customers in ${areaFilter}`,
          description: "Assign customers to this town from Unassigned, or import more names.",
        };
      }
    }
    if (areaOptions.length === 0 && Object.keys(customers).length > 0) {
      return {
        title: "Add towns first",
        description: "Create towns in the Towns tab, then come back to assign customers.",
      };
    }
    return null;
  }, [
    customers,
    areaFilter,
    unassigned.length,
    collectionCustomers.length,
    customersByArea,
    areaOptions.length,
    customerSearch,
    showUnassigned,
    showCollections,
    filteredUnassigned.length,
    filteredCollections.length,
    customerBoardAreas,
    filteredCustomersByArea,
  ]);

  async function handleCustomerExcel(file: File) {
    setImporting(true);
    try {
      const rows = await parseCustomerExcelFile(file);
      if (rows.length === 0) {
        toast.error("No customers found. Need Customer Code and Customer Name columns.");
        return;
      }
      const missingCode = rows.filter((r) => !r.code).length;
      const { added, skipped, updated } = importCustomers(rows);
      const parts = [`Added ${added}`];
      if (updated) parts.push(`${updated} updated`);
      if (skipped) parts.push(`${skipped} unchanged`);
      toast.success(
        `Imported customers: ${parts.join(", ")}${
          missingCode ? ` (${missingCode} without code)` : ""
        }`,
      );
    } catch {
      toast.error("Could not read Excel file");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleAreaExcel(file: File) {
    setImportingAreas(true);
    try {
      const names = await parseAreaExcelFile(file);
      if (names.length === 0) {
        toast.error("No area names found in sheet");
        return;
      }
      const { added, skipped } = importAreas(names);
      toast.success(`Imported ${added} areas (${skipped} already existed)`);
    } catch {
      toast.error("Could not read Excel file");
    } finally {
      setImportingAreas(false);
      if (areaFileRef.current) areaFileRef.current.value = "";
    }
  }

  function download() {
    const data = exportJSON();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `loadplanner-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export downloaded");
  }

  async function signOutAdmin() {
    await lock({});
    await router.navigate({ to: "/admin-unlock", replace: true });
  }

  return (

    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-12 max-w-7xl items-center gap-2 px-3 sm:gap-3 sm:px-4">
          <Link
            to="/"
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-2 text-sm font-medium text-foreground hover:bg-secondary/50 sm:h-8 sm:px-3"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Load Planner</span>
            <span className="sm:hidden">Back</span>
          </Link>
          <span className="truncate text-sm text-muted-foreground">Admin</span>
          <SyncStatusChip className="ml-auto" />
          <ThemeToggle />
          <Button variant="outline" size="sm" className="shrink-0 size-9 px-0 sm:size-auto sm:px-3" onClick={download} aria-label="Export JSON" title="Export JSON">
            <Download className="size-4" />
            <span className="hidden sm:inline">Export JSON</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 size-9 px-0 sm:size-auto sm:px-3"
            onClick={signOutAdmin}
            aria-label="Lock admin"
            title="Lock admin"
          >
            <Lock className="size-4" />
            <span className="hidden sm:inline">Lock</span>
          </Button>

        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4">
        <Tabs
          value={adminTab}
          onValueChange={setAdminTab}
          className="w-full"
        >
          <TabsList className="mb-4 h-auto w-full justify-start gap-1 overflow-x-auto bg-secondary p-1 flex-nowrap">
            <TabsTrigger value="customers">Customers</TabsTrigger>
            <TabsTrigger value="areas">Towns</TabsTrigger>
            <TabsTrigger value="trips">Trips</TabsTrigger>
            <TabsTrigger value="loading">Load #</TabsTrigger>
            <TabsTrigger value="trucks">Trucks</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
            <TabsTrigger value="plans">Plans</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="customers">
            <div className="space-y-4">
              <div className="panel p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold tracking-tight">Customers</h3>
                    <p className="mt-1 text-sm text-muted-foreground max-w-[65ch]">
                      Import Customer Code + Customer Name from Excel, then assign each to a town
                      and set their load # here. Use Edit to change a name or code. The Load # tab
                      is still available for bulk numbering.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleCustomerExcel(f);
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        downloadCustomerTemplate();
                        toast.success("Customer template downloaded");
                      }}
                    >
                      <Download className="size-4" />
                      Download template
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={importing}
                      onClick={() => fileRef.current?.click()}
                    >
                      {importing ? (
                        <Upload className="size-4 animate-pulse" />
                      ) : (
                        <FileSpreadsheet className="size-4" />
                      )}
                      Import Excel
                    </Button>
                    <Badge variant="outline">{Object.keys(customers).length} total</Badge>
                  </div>
                </div>

                {areaOptions.length === 0 && (
                  <p className="mb-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
                    No towns yet — add them in the Towns tab before assigning customers.
                  </p>
                )}

                <TownFilterBar
                  value={areaFilter}
                  onChange={setAreaFilter}
                  towns={areaOptions}
                  counts={townCounts}
                  unassignedCount={unassigned.length}
                  collectionCount={collectionCustomers.length}
                />

                <AdminSearchInput
                  value={customerSearch}
                  onChange={setCustomerSearch}
                  placeholder="Search customers by code or name…"
                />

                {emptyMessage ? (
                  <EmptyState title={emptyMessage.title} description={emptyMessage.description} />
                ) : (
                  <CustomerAreaBoard
                    areas={customerBoardAreas}
                    unassigned={showUnassigned ? filteredUnassigned : []}
                    collections={showCollections ? filteredCollections : []}
                    customersByArea={filteredCustomersByArea}
                    areaOptions={areaOptions}
                    hideEmptyUnassigned={!!customerSearch.trim()}
                    hideEmptyCollections={!!customerSearch.trim()}
                    onSetArea={(name, area) => {
                      setCustomerArea(name, area);
                      toast.success(area ? `${name} → ${area}` : `${name} unassigned`);
                    }}
                    onSetLoadingNumber={(name, area, n) => {
                      setCustomerLoadingNumber(name, area, n);
                      toast.success(
                        n > 0 ? `${name} load #${n} in ${area}` : `${name} load # cleared`,
                      );
                    }}
                    onSetCollection={(name, collection) => {
                      setCustomerCollection(name, collection);
                      toast.success(
                        collection
                          ? `${name} marked as collection`
                          : `${name} collection cleared`,
                      );
                    }}
                    onDelete={(name) => {
                      setConfirmDelete({ kind: "customer", name });
                    }}
                  />
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="areas">
            <div className="panel p-4">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold tracking-tight">Towns</h3>
                  <p className="mt-1 text-sm text-muted-foreground max-w-[65ch]">
                    Add towns one by one or import an Excel sheet with a Town / Area column (or a
                    single column of names). Build trips from these towns, then assign customers.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={areaFileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleAreaExcel(f);
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      downloadAreaTemplate();
                      toast.success("Town template downloaded");
                    }}
                  >
                    <Download className="size-4" />
                    Download template
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={importingAreas}
                    onClick={() => areaFileRef.current?.click()}
                  >
                    {importingAreas ? (
                      <Upload className="size-4 animate-pulse" />
                    ) : (
                      <FileSpreadsheet className="size-4" />
                    )}
                    Import Excel
                  </Button>
                  <Badge variant="outline">{areaOptions.length} towns</Badge>
                </div>
              </div>

              <form
                className="mb-4 flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = newArea.trim();
                  if (!name) return;
                  if (areaOptions.some((a) => a.toLowerCase() === name.toLowerCase())) {
                    toast.error("That town already exists");
                    return;
                  }
                  ensureArea(name);
                  setNewArea("");
                  toast.success(`Town "${name}" added`);
                }}
              >
                <Input
                  value={newArea}
                  onChange={(e) => setNewArea(e.target.value)}
                  placeholder="New town name (e.g. Brits)"
                  className="max-w-xs"
                />
                <Button type="submit" variant="secondary" size="sm">
                  Add town
                </Button>
              </form>

              <AdminSearchInput
                value={townSearch}
                onChange={setTownSearch}
                placeholder="Search towns…"
              />

              {areaOptions.length === 0 ? (
                <EmptyState
                  title="No towns yet"
                  description="Import an Excel sheet or add towns used on trips, then assign customers to them."
                />
              ) : filteredTowns.length === 0 ? (
                <EmptyState
                  title="No matching towns"
                  description={`Nothing matched “${townSearch.trim()}”.`}
                />
              ) : (
                <div className="overflow-auto rounded-xl border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Town</TableHead>
                        <TableHead className="w-32">Customers</TableHead>
                        <TableHead className="w-28" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTowns.map((area) => {
                        const count = customersByArea[area]?.length ?? 0;
                        return (
                          <TableRow key={area} {...highlightProps(area)}>
                            <TableCell className="font-medium">{area}</TableCell>
                            <TableCell className="metric-mono">{count}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => {
                                  setConfirmDelete({ kind: "town", name: area, count });
                                }}
                              >
                                Delete
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="trips">
            <TripsAdminPanel townOptions={areaOptions} />
          </TabsContent>

          <TabsContent value="loading">
            <div className="panel p-4">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold tracking-tight">Load numbers</h3>
                  <p className="mt-1 text-sm text-muted-foreground max-w-[65ch]">
                    Enter each customer&apos;s load # for their town (also available on the Customers
                    tab). Truck sheets print invoices from lowest number to highest.
                  </p>
                </div>
                <Badge variant="outline">
                  {Object.values(customers).filter((c) => c.loadingNumber > 0).length} numbered
                </Badge>
              </div>

              {areaOptions.length === 0 ? (
                <EmptyState
                  title="No towns yet"
                  description="Add towns and assign customers first, then set load numbers here."
                />
              ) : Object.values(customers).every((c) => !c.defaultArea) ? (
                <EmptyState
                  title="No customers assigned"
                  description="Assign customers to towns on the Customers tab, then return here to set load numbers."
                />
              ) : (
                <>
                  <TownFilterBar
                    value={
                      areaFilter === "unassigned" || areaFilter === "collection"
                        ? "all"
                        : areaFilter
                    }
                    onChange={setAreaFilter}
                    towns={areaOptions.filter((a) => (customersByArea[a]?.length ?? 0) > 0)}
                    counts={townCounts}
                    showUnassigned={false}
                  />
                  <AdminSearchInput
                    value={loadingSearch}
                    onChange={setLoadingSearch}
                    placeholder="Search customers by code or name…"
                  />
                  {loadingSearch.trim() && loadingBoardAreas.length === 0 ? (
                    <EmptyState
                      title="No matching customers"
                      description={`Nothing matched “${loadingSearch.trim()}”.`}
                    />
                  ) : (
                    <LoadingNumbersBoard
                      areas={loadingBoardAreas}
                      customersByArea={loadingCustomersByArea}
                      onSetLoadingNumber={(name, area, n) => {
                        setCustomerLoadingNumber(name, area, n);
                      }}
                    />
                  )}
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="trucks">
            <div className="panel p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">{trucks.length} trucks</p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    addTruck({ name: "New Truck", maxWeight: 3000, active: true });
                    toast.success("Truck added");
                  }}
                >
                  Add Truck
                </Button>
              </div>
              <AdminSearchInput
                value={truckSearch}
                onChange={setTruckSearch}
                placeholder="Search trucks by name…"
              />
              {filteredTrucks.length === 0 ? (
                <EmptyState
                  title={trucks.length === 0 ? "No trucks yet" : "No matching trucks"}
                  description={
                    trucks.length === 0
                      ? "Add a truck to get started."
                      : `Nothing matched “${truckSearch.trim()}”.`
                  }
                />
              ) : (
                <div className="overflow-auto rounded-xl border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Active</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Max Weight</TableHead>
                        <TableHead className="w-20" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTrucks.map((t) => (
                        <TableRow key={t.id} {...highlightProps(t.id)}>
                          <TableCell>
                            <Checkbox
                              checked={t.active}
                              onCheckedChange={(v) => updateTruck(t.id, { active: !!v })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={t.name}
                              onChange={(e) => updateTruck(t.id, { name: e.target.value })}
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={t.maxWeight}
                              onChange={(e) =>
                                updateTruck(t.id, { maxWeight: Number(e.target.value) })
                              }
                              className="h-8 w-28 metric-mono"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => {
                                setConfirmDelete({ kind: "truck", id: t.id, name: t.name });
                              }}
                            >
                              Delete
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="audit">
            <div className="panel p-4">
              <AdminSearchInput
                value={auditSearch}
                onChange={setAuditSearch}
                placeholder="Search audit by type or message…"
              />
              {filteredAudit.length === 0 ? (
                <EmptyState
                  title={audit.length === 0 ? "No audit entries" : "No matching entries"}
                  description={
                    audit.length === 0
                      ? "Actions will appear here as you use the planner."
                      : `Nothing matched “${auditSearch.trim()}”.`
                  }
                />
              ) : (
                <div className="max-h-[70vh] overflow-auto rounded-xl border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Time</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditPagination.slice.map((a) => (
                        <TableRow key={a.id} {...highlightProps(a.id)}>
                          <TableCell className="metric-mono text-xs">
                            {new Date(a.ts).toLocaleString()}
                          </TableCell>
                          <TableCell className="metric-mono text-xs">{a.type}</TableCell>
                          <TableCell>{a.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {auditPagination.totalPages > 1 && (
                <AdminPaginationFooter pagination={auditPagination} className="mt-3" />
              )}
            </div>
          </TabsContent>

          <TabsContent value="plans">
            <div className="panel p-4">
              <AdminSearchInput
                value={planSearch}
                onChange={setPlanSearch}
                placeholder="Search plans by date…"
              />
              {filteredPlans.length === 0 ? (
                <EmptyState
                  title={Object.keys(plans).length === 0 ? "No plans yet" : "No matching plans"}
                  description={
                    Object.keys(plans).length === 0
                      ? "Daily plans will show up here once created."
                      : `Nothing matched “${planSearch.trim()}”.`
                  }
                />
              ) : (
                <div className="overflow-auto rounded-xl border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Date</TableHead>
                        <TableHead>Invoices</TableHead>
                        <TableHead>Locked</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {plansPagination.slice.map((p) => (
                        <TableRow key={p.date} {...highlightProps(p.date)}>
                          <TableCell className="metric-mono">{p.date}</TableCell>
                          <TableCell>{p.invoices.length}</TableCell>
                          <TableCell>
                            {p.locked ? <Badge variant="good">Locked</Badge> : "—"}
                          </TableCell>
                          <TableCell className="space-x-2 text-right">
                            <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setDate(p.date)}>
                              Open
                            </Button>
                            {p.locked && (
                              <Button
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-warn"
                                onClick={() => {
                                  setDate(p.date);
                                  unlockPlan();
                                  toast.success("Plan unlocked");
                                }}
                              >
                                Unlock
                              </Button>
                            )}
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-destructive"
                              onClick={() => {
                                setConfirmDelete({ kind: "plan", date: p.date });
                              }}
                            >
                              Delete
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {plansPagination.totalPages > 1 && (
                <AdminPaginationFooter pagination={plansPagination} className="mt-3" />
              )}
            </div>
          </TabsContent>

          <TabsContent value="settings">
            <div className="panel max-w-md space-y-4 p-4">
              <div>
                <h3 className="font-semibold tracking-tight">Manifest unlock PIN</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Used to unlock locked daily plans on the Lock screen. Admin console access is
                  controlled by the server <span className="metric-mono">ADMIN_PASSWORD</span>.
                  {currentPin
                    ? " A PIN is currently set."
                    : " No PIN set — locked plans can be unlocked without a PIN."}
                </p>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  onSetPin(String(fd.get("pin") ?? ""));
                  (e.currentTarget as HTMLFormElement).reset();
                  toast.success("PIN updated");
                }}
                className="flex gap-2"
              >
                <Input
                  name="pin"
                  type="password"
                  placeholder="New PIN (blank to clear)"
                  className="flex-1"
                />
                <Button type="submit">Save</Button>
              </form>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent className="panel border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDelete?.kind === "customer"
                ? "Delete customer?"
                : confirmDelete?.kind === "town"
                  ? "Delete town?"
                  : confirmDelete?.kind === "truck"
                    ? "Delete truck?"
                    : "Delete plan?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.kind === "customer" && (
                <>
                  Remove <strong>{confirmDelete.name}</strong> from the catalog. This cannot be
                  undone.
                </>
              )}
              {confirmDelete?.kind === "town" && (
                <>
                  Delete town <strong>{confirmDelete.name}</strong>
                  {confirmDelete.count > 0
                    ? `? ${confirmDelete.count} customer(s) will be unassigned.`
                    : "?"}
                </>
              )}
              {confirmDelete?.kind === "truck" && (
                <>
                  Remove <strong>{confirmDelete.name}</strong> from the fleet. This cannot be undone.
                </>
              )}
              {confirmDelete?.kind === "plan" && (
                <>
                  Delete plan for <strong>{confirmDelete.date}</strong>? This cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!confirmDelete) return;
                if (confirmDelete.kind === "customer") {
                  deleteCustomer(confirmDelete.name);
                  toast.success("Customer removed");
                } else if (confirmDelete.kind === "town") {
                  deleteAreaCatalog(confirmDelete.name);
                  if (areaFilter === confirmDelete.name) setAreaFilter("all");
                  toast.success(`Removed ${confirmDelete.name}`);
                } else if (confirmDelete.kind === "truck") {
                  deleteTruck(confirmDelete.id);
                  toast.success("Truck deleted");
                } else if (confirmDelete.kind === "plan") {
                  deleteDay(confirmDelete.date);
                  toast.success("Plan deleted");
                }
                setConfirmDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AdminPaginationFooter({
  pagination,
  className,
}: {
  pagination: ReturnType<typeof usePagination<unknown>>;
  className?: string;
}) {
  const start = (pagination.page - 1) * pagination.pageSize + 1;
  const end = Math.min(pagination.page * pagination.pageSize, pagination.totalItems);
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground ${className ?? ""}`}
    >
      <span>
        {start}–{end} of {pagination.totalItems}
      </span>
      <Pagination className="mx-0 w-auto">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={(e) => {
                e.preventDefault();
                pagination.prevPage();
              }}
              className={pagination.page <= 1 ? "pointer-events-none opacity-50" : undefined}
            />
          </PaginationItem>
          <PaginationItem>
            <span className="px-2">
              Page {pagination.page} of {pagination.totalPages}
            </span>
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={(e) => {
                e.preventDefault();
                pagination.nextPage();
              }}
              className={
                pagination.page >= pagination.totalPages ? "pointer-events-none opacity-50" : undefined
              }
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
