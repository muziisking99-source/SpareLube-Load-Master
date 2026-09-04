"use client";

import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  FileSpreadsheet,
  Lock,
  TriangleAlert,
  Unlock,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { areaColor } from "@/lib/colors";
import { findCustomer } from "@/lib/customers";
import { parseExcelFile, type ParsedRow } from "@/lib/parse";
import { townsForTruckDay, tripNamesForTruckDay } from "@/lib/trips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatTile } from "./ui/StatTile";
import { FormField } from "./ui/FormField";
import { ScreenHeader } from "./ui/ScreenHeader";
import { ScreenShell } from "./ui/ScreenShell";
import { cn } from "@/lib/utils";
import { useRowHighlight } from "@/lib/useRowHighlight";

type CompareResult = {
  fileName: string;
  matched: number;
  missed: ParsedRow[];
  extra: { doc: string; customer: string; where: string }[];
};

export function LockScreen() {
  const plan = useStore((s) => s.plans[s.currentDate])!;
  const trucks = useStore((s) => s.trucks);
  const trips = useStore((s) => s.trips);
  const customers = useStore((s) => s.customers);
  const heldInvoices = useStore((s) => s.heldInvoices);
  const addInvoices = useStore((s) => s.addInvoices);
  const lockPlan = useStore((s) => s.lockPlan);
  const unlockPlan = useStore((s) => s.unlockPlan);
  const setStep = useStore((s) => s.setStep);
  const checkPin = useStore((s) => s.checkPin);
  const { highlightProps } = useRowHighlight();

  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [compare, setCompare] = useState<CompareResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const active = trucks.filter((t) => t.active);
  const dayTowns = new Map(
    plan.truckDay.map((td) => [td.truckId, townsForTruckDay(td, trips)]),
  );
  const dayTripName = new Map(
    plan.truckDay.map((td) => [td.truckId, tripNamesForTruckDay(td, trips)] as const),
  );
  const needsTruck = plan.invoices.filter((i) => !i.truckId && !i.collection);
  const allocated = plan.invoices.filter((i) => i.truckId);
  const totalWeight = plan.invoices.reduce((s, i) => s + i.weight, 0);
  const cap = active.reduce((s, t) => s + t.maxWeight, 0);
  const util = cap ? (allocated.reduce((s, i) => s + i.weight, 0) / cap) * 100 : 0;

  async function handleExcelCompare(file: File) {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls") && !lower.endsWith(".csv")) {
      toast.error("Please upload an Excel file (.xlsx or .xls)");
      return;
    }
    setParsing(true);
    try {
      const rows = await parseExcelFile(file);
      if (rows.length === 0) {
        toast.error("No valid rows found in the Excel file");
        return;
      }

      const entered = new Map<string, { customer: string; where: string }>();
      for (const i of plan.invoices) {
        if (!i.doc) continue;
        entered.set(i.doc, {
          customer: i.customer,
          where: i.collection ? "collections" : i.truckId ? "plan" : "unallocated",
        });
      }
      for (const h of heldInvoices) {
        if (!h.doc) continue;
        entered.set(h.doc, { customer: h.customer, where: "held" });
      }

      const excelDocs = new Set(rows.map((r) => r.doc));
      const missed: ParsedRow[] = [];
      let matched = 0;
      for (const r of rows) {
        if (entered.has(r.doc)) matched++;
        else missed.push(r);
      }
      const extra = [...entered.entries()]
        .filter(([doc]) => !excelDocs.has(doc))
        .map(([doc, v]) => ({ doc, customer: v.customer, where: v.where }));

      setCompare({ fileName: file.name, matched, missed, extra });
      toast.success(
        `Compared ${rows.length} Excel row${rows.length === 1 ? "" : "s"} — ${matched} matched`,
      );
    } catch {
      toast.error("Could not read that Excel file");
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function addMissed(row: ParsedRow) {
    if (plan.invoices.some((i) => i.doc === row.doc) || heldInvoices.some((h) => h.doc === row.doc)) {
      toast.error(`Doc ${row.doc} is already entered`);
      return;
    }
    const known =
      (row.customerCode ? findCustomer(customers, row.customerCode) : undefined) ??
      findCustomer(customers, row.customer);
    addInvoices([
      {
        doc: row.doc,
        customer: known?.name || row.customer,
        weight: 0,
        area: known?.defaultArea ?? "",
        source: "SYSTEM",
        collection: !!known?.collection,
      },
    ]);
    setCompare((prev) =>
      prev
        ? {
            ...prev,
            missed: prev.missed.filter((m) => m.doc !== row.doc),
            matched: prev.matched + 1,
          }
        : prev,
    );
    toast.success(`Added ${row.doc} (unallocated — set weight in Adjust)`);
  }

  function doLock() {
    lockPlan();
    setShowLockConfirm(false);
    toast.success("Manifests locked");
  }

  function doUnlock() {
    if (checkPin(pin)) {
      unlockPlan();
      setShowUnlock(false);
      setPin("");
      setPinError("");
      toast.success("Plan unlocked");
    } else {
      setPinError("Incorrect PIN");
      toast.error("Incorrect PIN");
    }
  }

  const truckRows = active.map((t, idx) => {
    const list = plan.invoices.filter((i) => i.truckId === t.id);
    const r1 = list.filter((i) => (i.round ?? 1) === 1);
    const r2 = list.filter((i) => (i.round ?? 1) === 2);
    const wt = r1.reduce((s, i) => s + i.weight, 0);
    const pct = (wt / t.maxWeight) * 100;
    const status = pct >= 95 ? "text-crit" : pct >= 80 ? "text-warn" : "text-good";
    const statusLabel = pct >= 95 ? "Overfilling" : pct >= 80 ? "Near max" : "OK";
    const areas = dayTowns.get(t.id) ?? [];
    const tripName = dayTripName.get(t.id);
    return { t, list, r2, wt, pct, status, statusLabel, areas, tripName, idx };
  });

  const lockWarning =
    !compare
      ? "Excel double-check not run yet."
      : compare.missed.length > 0
        ? `${compare.missed.length} doc(s) in Excel were never entered.`
        : null;

  return (
    <>
      <ScreenShell className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Total Invoices" value={plan.invoices.length} />
        <StatTile label="Allocated" value={allocated.length} tone="good" />
        <StatTile
          label="Unallocated"
          value={needsTruck.length}
          tone={needsTruck.length ? "crit" : "muted"}
        />
        <StatTile label="Total Weight" value={`${totalWeight.toFixed(0)} kg`} />
        <StatTile
          label="Fleet Utilisation"
          value={`${util.toFixed(0)}%`}
          className="col-span-2 md:col-span-1"
        />
      </div>

      {needsTruck.length > 0 && (
        <div className="glass-panel flex items-center gap-2 border-crit/40 bg-crit/5 p-4 text-sm text-crit">
          <TriangleAlert className="size-4 shrink-0" />
          {needsTruck.length} invoice(s) are not yet on a truck.
        </div>
      )}

      <section className="glass-panel p-4 sm:p-5">
        <ScreenHeader
          title="Excel double-check"
          description="Import the system export and compare doc numbers against everything entered today (plan, held, collections)."
          className="mb-4"
        />
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleExcelCompare(f);
          }}
        />
        <button
          type="button"
          disabled={parsing || plan.locked}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void handleExcelCompare(f);
          }}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center transition-colors",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border bg-panel-2/50 hover:border-primary/50 hover:bg-panel-2",
            (parsing || plan.locked) && "opacity-60",
          )}
        >
          <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
            {parsing ? (
              <Upload className="size-6 animate-pulse" />
            ) : (
              <FileSpreadsheet className="size-6" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium">
              {parsing ? "Comparing…" : "Upload system Excel to compare"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Nothing is auto-imported — only a side-by-side check
            </p>
          </div>
        </button>

        {compare && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline" className="metric-mono font-normal">
                {compare.fileName}
              </Badge>
              <Badge variant="good">{compare.matched} matched</Badge>
              <Badge variant={compare.missed.length ? "warn" : "outline"}>
                {compare.missed.length} missed
              </Badge>
              <Badge variant={compare.extra.length ? "secondary" : "outline"}>
                {compare.extra.length} not in system
              </Badge>
            </div>

            {compare.missed.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-warn">
                  In Excel, not entered
                </h4>
                <div className="panel overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-panel-2 hover:bg-panel-2">
                        <TableHead>Doc</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="w-28" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {compare.missed.map((row) => (
                        <TableRow key={row.doc}>
                          <TableCell className="metric-mono">{row.doc}</TableCell>
                          <TableCell>{row.customer}</TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={plan.locked}
                              onClick={() => addMissed(row)}
                            >
                              Add
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {compare.extra.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                  Entered, not in Excel
                </h4>
                <div className="panel overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-panel-2 hover:bg-panel-2">
                        <TableHead>Doc</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Where</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {compare.extra.map((row) => (
                        <TableRow key={row.doc}>
                          <TableCell className="metric-mono">{row.doc}</TableCell>
                          <TableCell>{row.customer}</TableCell>
                          <TableCell className="text-muted-foreground">{row.where}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="glass-panel p-4">
        <h3 className="mb-3 font-semibold tracking-tight">Truck Summary</h3>

        <div className="space-y-3 md:hidden">
          {truckRows.map(
            ({ t, list, r2, wt, pct, status, statusLabel, areas, tripName, idx }) => (
              <div
                key={t.id}
                style={{ "--index": idx } as React.CSSProperties}
                className="stagger-item space-y-2 rounded-xl border border-border bg-panel-2/40 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{t.name}</div>
                    {tripName && (
                      <div className="mt-0.5 text-sm text-muted-foreground">{tripName}</div>
                    )}
                  </div>
                  <span className={`shrink-0 text-sm font-medium ${status}`}>{statusLabel}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {areas.length === 0 ? (
                    <span className="text-sm text-muted-foreground">—</span>
                  ) : (
                    areas.map((area) => {
                      const c = areaColor(area);
                      return (
                        <span
                          key={area}
                          className="chip"
                          style={{ borderColor: c.border, color: c.text, background: c.bg }}
                        >
                          {area}
                        </span>
                      );
                    })
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Invoices</div>
                    <div className="metric-mono">
                      {list.length}
                      {r2.length > 0 ? ` (R2: ${r2.length})` : ""}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Weight</div>
                    <div className="metric-mono">
                      {wt.toFixed(0)} / {t.maxWeight}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Capacity</div>
                    <div className="metric-mono">{pct.toFixed(0)}%</div>
                  </div>
                </div>
              </div>
            ),
          )}
        </div>

        <div className="hidden panel overflow-x-auto md:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Truck</TableHead>
                <TableHead>Trip</TableHead>
                <TableHead>Invoices</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {truckRows.map(
                ({ t, list, r2, wt, pct, status, statusLabel, areas, tripName, idx }) => (
                  <TableRow
                    key={t.id}
                    style={{ "--index": idx } as React.CSSProperties}
                    className="stagger-item"
                    {...highlightProps(t.id)}
                  >
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {tripName && <div className="text-sm font-medium">{tripName}</div>}
                        <div className="flex flex-wrap gap-1">
                          {areas.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            areas.map((area) => {
                              const c = areaColor(area);
                              return (
                                <span
                                  key={area}
                                  className="chip"
                                  style={{
                                    borderColor: c.border,
                                    color: c.text,
                                    background: c.bg,
                                  }}
                                >
                                  {area}
                                </span>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="metric-mono">
                      {list.length}
                      {r2.length > 0 ? ` (R2: ${r2.length})` : ""}
                    </TableCell>
                    <TableCell className="metric-mono">
                      {wt.toFixed(0)} / {t.maxWeight}
                    </TableCell>
                    <TableCell className="metric-mono">{pct.toFixed(0)}%</TableCell>
                    <TableCell className={`font-medium ${status}`}>{statusLabel}</TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {lockWarning && !plan.locked && (
        <div className="glass-panel flex items-center gap-2 border-warn/40 bg-warn/5 p-4 text-sm text-warn">
          <TriangleAlert className="size-4 shrink-0" />
          {lockWarning} You can still lock if you&apos;re sure.
        </div>
      )}
      </ScreenShell>

      <div className="glass-panel flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center">
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => setStep("adjust")}>
          <ArrowLeft className="size-4" />
          Back to Adjust
        </Button>
        {!plan.locked ? (
          <Button className="w-full sm:ml-auto sm:w-auto" onClick={() => setShowLockConfirm(true)}>
            <Lock className="size-4" />
            Lock Manifests
          </Button>
        ) : (
          <>
            <Badge variant="good" className="w-fit gap-1 sm:ml-auto">
              <Lock className="size-3" />
              Locked
            </Badge>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setShowUnlock(true)}
            >
              <Unlock className="size-4" />
              Admin Unlock
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => setStep("print")}>
              Print / Export
              <ArrowRight className="size-4" />
            </Button>
          </>
        )}
      </div>

      <AlertDialog open={showLockConfirm} onOpenChange={setShowLockConfirm}>
        <AlertDialogContent className="glass-panel border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Lock manifests?</AlertDialogTitle>
            <AlertDialogDescription>
              {needsTruck.length > 0
                ? `${needsTruck.length} invoices are still unallocated. `
                : ""}
              {lockWarning ? `${lockWarning} ` : ""}
              Locking will prevent further edits without admin unlock.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doLock}>Lock manifests</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={showUnlock}
        onOpenChange={(o) => {
          setShowUnlock(o);
          if (!o) {
            setPin("");
            setPinError("");
          }
        }}
      >
        <DialogContent className="glass-panel max-w-sm border-border">
          <DialogHeader>
            <DialogTitle>Admin unlock</DialogTitle>
          </DialogHeader>
          <FormField label="Admin PIN" error={pinError}>
            <Input
              type="password"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setPinError("");
              }}
              autoFocus
              className="h-11"
            />
          </FormField>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setShowUnlock(false)}>
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" onClick={doUnlock}>
              Unlock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
