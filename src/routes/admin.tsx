import { createFileRoute, Link } from "@tanstack/react-router";
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
import { FormField } from "@/components/planner/ui/FormField";
import { EmptyState } from "@/components/planner/ui/EmptyState";
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
import { customersInArea } from "@/lib/loadingOrder";
import type { CustomerMemory } from "@/lib/types";

export const Route = createFileRoute("/admin")({
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
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!hydrated) {
    return (
      <div className="grid min-h-[100dvh] place-items-center p-4">
        <p className="text-sm text-muted-foreground">Loading admin…</p>
      </div>
    );
  }

  if (adminPin && !unlocked) {
    return (
      <div className="grid min-h-[100dvh] place-items-center p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pin === adminPin) {
              setUnlocked(true);
              setPinError("");
            } else {
              setPinError("Incorrect PIN");
              toast.error("Incorrect PIN");
            }
          }}
          className="panel w-full max-w-sm space-y-4 p-6"
        >
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Lock className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Admin PIN</h1>
              <p className="text-sm text-muted-foreground">Enter PIN to access the console</p>
            </div>
          </div>
          <FormField label="PIN" error={pinError}>
            <Input
              type="password"
              value={pin}
              onChange={(e) => {
                setPinInput(e.target.value);
                setPinError("");
              }}
              autoFocus
            />
          </FormField>
          <Button type="submit" className="w-full">
            Unlock
          </Button>
          <Link
            to="/"
            className="block text-center text-xs text-muted-foreground hover:text-foreground"
          >
            Back to planner
          </Link>
        </form>
      </div>
    );
  }

  return <AdminConsole onSetPin={setPin} currentPin={adminPin} />;
}

function AdminConsole({
  onSetPin,
  currentPin,
}: {
  onSetPin: (p: string) => void;
  currentPin: string;
}) {
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
  const ensureArea = useStore((s) => s.ensureArea);
  const importAreas = useStore((s) => s.importAreas);
  const deleteAreaCatalog = useStore((s) => s.deleteAreaCatalog);
  const deleteCustomer = useStore((s) => s.deleteCustomer);

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
  const fileRef = useRef<HTMLInputElement>(null);
  const areaFileRef = useRef<HTMLInputElement>(null);

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
        .filter((c) => !c.defaultArea)
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
    if (areaFilter === "unassigned") return [];
    return areaOptions.filter((a) => a === areaFilter);
  }, [areaFilter, areaOptions]);

  const showUnassigned = areaFilter === "all" || areaFilter === "unassigned";

  const filteredUnassigned = useMemo(
    () => unassigned.filter((c) => customerMatchesQuery(c, customerSearch)),
    [unassigned, customerSearch],
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
      areaFilter !== "all" && areaFilter !== "unassigned"
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
        description: "Every customer has a town. Switch to All or pick a town.",
      };
    }
    if (areaFilter !== "all" && areaFilter !== "unassigned") {
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
    customersByArea,
    areaOptions.length,
    customerSearch,
    showUnassigned,
    filteredUnassigned.length,
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

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link
            to="/"
            className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium text-foreground hover:bg-secondary/50"
          >
            <ArrowLeft className="size-4" />
            Load Planner
          </Link>
          <span className="text-sm text-muted-foreground">Admin Console</span>
          <ThemeToggle className="ml-auto" />
          <Button variant="outline" size="sm" onClick={download}>
            <Download className="size-4" />
            Export JSON
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4">
        <Tabs defaultValue="customers" className="w-full">
          <TabsList className="mb-4 h-auto w-full flex-wrap justify-start gap-1 bg-secondary p-1">
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
                      Import Customer Code + Customer Name from Excel, then assign each to a town.
                      Set load numbers on the Load # tab.
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
                    customersByArea={filteredCustomersByArea}
                    areaOptions={areaOptions}
                    hideEmptyUnassigned={!!customerSearch.trim()}
                    onSetArea={(name, area) => {
                      setCustomerArea(name, area);
                      toast.success(area ? `${name} → ${area}` : `${name} unassigned`);
                    }}
                    onDelete={(name) => {
                      if (confirm(`Delete ${name}?`)) {
                        deleteCustomer(name);
                        toast.success("Customer removed");
                      }
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
                          <TableRow key={area}>
                            <TableCell className="font-medium">{area}</TableCell>
                            <TableCell className="metric-mono">{count}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => {
                                  const msg =
                                    count > 0
                                      ? `Delete "${area}"? ${count} customer(s) will be unassigned.`
                                      : `Delete town "${area}"?`;
                                  if (!confirm(msg)) return;
                                  deleteAreaCatalog(area);
                                  if (areaFilter === area) setAreaFilter("all");
                                  toast.success(`Removed ${area}`);
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
                    Enter each customer&apos;s load # for their town. Truck sheets print invoices
                    from lowest number to highest.
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
                    value={areaFilter === "unassigned" ? "all" : areaFilter}
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
                        <TableRow key={t.id}>
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
                                if (confirm(`Delete ${t.name}?`)) {
                                  deleteTruck(t.id);
                                  toast.success("Truck deleted");
                                }
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
                      {filteredAudit.map((a) => (
                        <TableRow key={a.id}>
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
                      {filteredPlans.map((p) => (
                        <TableRow key={p.date}>
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
                                if (confirm(`Delete plan ${p.date}?`)) {
                                  deleteDay(p.date);
                                  toast.success("Plan deleted");
                                }
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

          <TabsContent value="settings">
            <div className="panel max-w-md space-y-4 p-4">
              <div>
                <h3 className="font-semibold tracking-tight">Admin PIN</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {currentPin ? "PIN is set and required for admin access." : "No PIN set — admin is open."}
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
    </div>
  );
}
