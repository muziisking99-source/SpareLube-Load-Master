"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Inbox,
  Package,
  Pause,
  Receipt,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { findCustomer } from "@/lib/customers";
import { loadingNumberFor } from "@/lib/loadingOrder";
import { parseExcelFile } from "@/lib/parse";
import { downloadInvoiceTemplate } from "@/lib/excelTemplates";
import { townsForPlan } from "@/lib/trips";
import type { CustomerMemory, HeldInvoice, Invoice } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
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
import { ScreenHeader } from "./ui/ScreenHeader";
import { CollapsibleSection } from "./ui/CollapsibleSection";
import { EmptyState } from "./ui/EmptyState";
import { StatTile } from "./ui/StatTile";
import { FormField } from "./ui/FormField";
import { TownCombobox } from "./TownCombobox";
import { CustomerCombobox } from "./CustomerCombobox";
import { cn } from "@/lib/utils";
import { useRowHighlight } from "@/lib/useRowHighlight";

/** Weight 0 = unset; negatives are valid for credit notes. */
function weightUnset(w: number) {
  return !Number.isFinite(w) || w === 0;
}

export function ImportScreen() {
  const plan = useStore((s) => s.plans[s.currentDate])!;
  const customers = useStore((s) => s.customers);
  const trips = useStore((s) => s.trips);
  const areaHistory = useStore((s) => s.areaHistory);
  const heldInvoices = useStore((s) => s.heldInvoices);
  const addInvoices = useStore((s) => s.addInvoices);
  const updateInvoice = useStore((s) => s.updateInvoice);
  const removeInvoice = useStore((s) => s.removeInvoice);
  const confirmImport = useStore((s) => s.confirmImport);
  const holdInvoices = useStore((s) => s.holdInvoices);
  const holdFromPlan = useStore((s) => s.holdFromPlan);
  const pickHeld = useStore((s) => s.pickHeld);
  const updateHeld = useStore((s) => s.updateHeld);
  const removeHeld = useStore((s) => s.removeHeld);
  const setHeldCollection = useStore((s) => s.setHeldCollection);
  const ensureCustomer = useStore((s) => s.ensureCustomer);
  const importInvoiceRows = useStore((s) => s.importInvoiceRows);
  const setStep = useStore((s) => s.setStep);
  const { highlightProps } = useRowHighlight();

  const docRef = useRef<HTMLInputElement>(null);
  const excelRef = useRef<HTMLInputElement>(null);
  const [doc, setDoc] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerMemory | null>(null);
  const [area, setArea] = useState("");
  const [weight, setWeight] = useState("");
  const [excelParsing, setExcelParsing] = useState(false);
  const [pendingHold, setPendingHold] = useState<{
    doc: string;
    customer: string;
    weight: number;
    area: string;
    collection: boolean;
    creditNote: boolean;
  } | null>(null);

  const areas = townsForPlan(plan, trips);
  const townOptions = useMemo(() => {
    const set = new Set([...areas, ...areaHistory]);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [areas, areaHistory]);

  const heldTownOptions = useMemo(() => {
    const set = new Set(areaHistory);
    for (const h of heldInvoices) if (h.area) set.add(h.area);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [areaHistory, heldInvoices]);

  const sortedHeld = useMemo(() => {
    const today = new Set(areas);
    return [...heldInvoices].sort((a, b) => {
      const aOk = !a.area || today.has(a.area);
      const bOk = !b.area || today.has(b.area);
      if (aOk !== bOk) return aOk ? -1 : 1;
      return (a.heldAt || "").localeCompare(b.heldAt || "");
    });
  }, [heldInvoices, areas]);

  const invoices = plan.invoices;

  const isCollectionCustomer = (name: string) => !!findCustomer(customers, name)?.collection;

  const creditInvoices = invoices.filter((i) => !!i.creditNote);
  const collectionInvoices = invoices.filter(
    (i) => !i.creditNote && (i.collection || isCollectionCustomer(i.customer)),
  );
  const deliveryInvoices = invoices.filter(
    (i) => !i.creditNote && !i.collection && !isCollectionCustomer(i.customer),
  );

  const docCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of invoices) m.set(i.doc, (m.get(i.doc) ?? 0) + 1);
    for (const h of heldInvoices) m.set(h.doc, (m.get(h.doc) ?? 0) + 1);
    return m;
  }, [invoices, heldInvoices]);

  const missingWeights = invoices.filter((i) => weightUnset(i.weight)).length;
  const missingAreas = invoices.filter((i) => !i.area).length;
  const totalWeight = invoices.reduce((s, i) => s + (i.weight || 0), 0);
  const entered = invoices.filter((i) => !weightUnset(i.weight)).length;
  const avg = entered ? totalWeight / entered : 0;
  const canConfirm = invoices.length > 0 && missingWeights === 0 && missingAreas === 0;
  const progressPct = invoices.length ? (entered / invoices.length) * 100 : 0;

  function resetForm() {
    setDoc("");
    setCustomerName("");
    setSelectedCustomer(null);
    setArea("");
    setWeight("");
    requestAnimationFrame(() => docRef.current?.focus());
  }

  function applyCustomer(c: CustomerMemory | null) {
    if (c && !findCustomer(customers, c.name)) {
      c =
        ensureCustomer({
          name: c.name,
          code: c.code,
          defaultArea: area,
        }) ?? c;
    }
    setSelectedCustomer(c);
    if (c) {
      setCustomerName(c.name);
      if (c.defaultArea) setArea(c.defaultArea);
    }
  }

  function submitEntry(opts?: {
    forceHold?: boolean;
    asCollection?: boolean;
    asCreditNote?: boolean;
  }) {
    const cleanDoc = doc.trim();
    const cleanCustomer = (selectedCustomer?.name || customerName).trim();
    const w = Number(weight);
    const cleanArea = area.trim();

    if (!cleanDoc) {
      toast.error("Enter a doc number");
      docRef.current?.focus();
      return;
    }
    if (!cleanCustomer) {
      toast.error("Select or add a customer");
      return;
    }
    if (!cleanArea) {
      toast.error("Select a town");
      return;
    }
    const asCredit = !!opts?.asCreditNote || w < 0;
    if (!Number.isFinite(w) || w === 0) {
      toast.error(asCredit ? "Enter credit weight (negative kg)" : "Enter weight (kg)");
      return;
    }
    if (!asCredit && w < 0) {
      toast.error("Use Credit note for negative weights");
      return;
    }
    if (docCounts.get(cleanDoc)) {
      toast.error(`Doc ${cleanDoc} is already entered`);
      return;
    }

    const known =
      ensureCustomer({
        name: cleanCustomer,
        code: selectedCustomer?.code,
        defaultArea: cleanArea,
      }) ??
      selectedCustomer ??
      findCustomer(customers, cleanCustomer);
    const isCollection = !asCredit && (!!opts?.asCollection || !!known?.collection);
    const onToday = areas.includes(cleanArea);

    if (opts?.forceHold || (!onToday && !isCollection && !asCredit)) {
      if (!opts?.forceHold && !onToday) {
        setPendingHold({
          doc: cleanDoc,
          customer: cleanCustomer,
          weight: w,
          area: cleanArea,
          collection: isCollection,
          creditNote: asCredit,
        });
        return;
      }
      holdInvoices(
        [
          {
            doc: cleanDoc,
            customer: cleanCustomer,
            weight: w,
            area: cleanArea,
            source: "ADHOC",
          },
        ],
        asCredit
          ? "credit_note"
          : isCollection
            ? "collection"
            : opts?.forceHold
              ? "manual"
              : "town_not_on_trips",
      );
      toast.success(
        asCredit ? "Held as credit note" : isCollection ? "Held as collection" : "Held for later",
      );
      resetForm();
      return;
    }

    addInvoices([
      {
        doc: cleanDoc,
        customer: cleanCustomer,
        weight: w,
        area: cleanArea,
        source: "ADHOC",
        collection: isCollection,
        creditNote: asCredit,
      },
    ]);
    toast.success(
      asCredit
        ? `Added ${cleanDoc} (credit note)`
        : isCollection
          ? `Added ${cleanDoc} (collection)`
          : `Added ${cleanDoc}`,
    );
    resetForm();
  }

  async function handleExcelUpload(file: File) {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls") && !lower.endsWith(".csv")) {
      toast.error("Please upload an Excel file (.xlsx or .xls)");
      return;
    }
    setExcelParsing(true);
    try {
      const rows = await parseExcelFile(file);
      if (rows.length === 0) {
        toast.error("No valid rows found in the Excel file");
        return;
      }
      const { added, held, skipped, missingCode } = importInvoiceRows(rows);
      const parts: string[] = [];
      if (added) parts.push(`${added} added`);
      if (held) parts.push(`${held} held`);
      if (skipped) parts.push(`${skipped} duplicate${skipped === 1 ? "" : "s"} skipped`);
      if (missingCode) parts.push(`${missingCode} missing customer code`);
      if (!added && !held) {
        toast.message(
          parts.length
            ? parts.join(", ")
            : "Nothing to import",
        );
      } else {
        toast.success(parts.join(", "));
      }
    } catch {
      toast.error("Could not read that Excel file");
    } finally {
      setExcelParsing(false);
      if (excelRef.current) excelRef.current.value = "";
    }
  }

  function handleConfirm() {
    if (!canConfirm) return;
    const { known, learned } = confirmImport();
    toast.success(`Saved. ${known} known customers, ${learned} newly learned.`);
    setStep("allocate");
  }

  function handleHold(invoiceId: string) {
    if (holdFromPlan(invoiceId)) {
      toast.success("Moved to Held for later");
    }
  }

  function handleCollect(invoiceId: string) {
    updateInvoice(invoiceId, { collection: true, creditNote: false, truckId: null });
    toast.success("Marked as collection");
  }

  function handleCredit(invoiceId: string) {
    updateInvoice(invoiceId, { creditNote: true, collection: false, truckId: null });
    toast.success("Marked as credit note");
  }

  function handlePick(id: string, opts?: { asException?: boolean; asCollection?: boolean }) {
    const result = pickHeld(id, opts);
    if (result === "ok") {
      toast.success(
        opts?.asException
          ? "Added as delivery exception"
          : opts?.asCollection
            ? "Added as collection"
            : "Added to today’s plan",
      );
    } else if (result === "duplicate") toast.error("That doc is already on today’s plan");
    else if (result === "off_trip")
      toast.error("Town isn’t on today’s trips — use Pick as exception");
    else toast.error("Held invoice not found");
  }

  return (
    <div className="space-y-6">
      <section className="panel p-4 sm:p-5">
        <ScreenHeader
          title="Enter Invoice"
          description="Add invoices one by one, or upload Excel. Weights are entered manually. Re-upload hourly — duplicates are skipped."
          className="mb-4"
        />

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            ref={excelRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleExcelUpload(f);
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={excelParsing}
            onClick={() => excelRef.current?.click()}
          >
            <FileSpreadsheet className="size-4" />
            {excelParsing ? "Importing…" : "Import Excel"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => downloadInvoiceTemplate()}>
            Download template
          </Button>
          <span className="text-xs text-muted-foreground">
            Columns: invoice #, customer code, customer name. Code is required and used to match Admin customers; new codes are saved to Admin (set town after).
          </span>
        </div>

        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            submitEntry();
          }}
        >
          <FormField label="Doc number">
            <Input
              ref={docRef}
              value={doc}
              onChange={(e) => setDoc(e.target.value)}
              placeholder="Doc #"
              className="metric-mono h-11"
              autoComplete="off"
              autoFocus
            />
          </FormField>
          <FormField label="Customer" className="sm:col-span-1 lg:col-span-2">
            <CustomerCombobox
              value={customerName}
              customers={customers}
              onChange={applyCustomer}
              allowCreate
              searchPlaceholder="Search or add customer…"
              emptyLabel="Type a name to add a customer."
              buttonClassName="h-11 w-full"
            />
          </FormField>
          <FormField label="Town">
            <TownCombobox
              value={area}
              options={townOptions}
              allowEmpty
              emptyOptionLabel="Clear town"
              placeholder="Town…"
              searchPlaceholder="Search towns…"
              onChange={setArea}
              buttonClassName="h-11 w-full"
            />
          </FormField>
          <FormField label="Weight (kg)">
            <Input
              type="number"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="0"
              className="metric-mono h-11 text-lg"
            />
          </FormField>
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-5">
            <Button type="submit" className="min-w-[8rem]">
              Add invoice
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => submitEntry({ forceHold: true })}
            >
              <Pause className="size-4" />
              Hold for later
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => submitEntry({ asCollection: true })}
            >
              <Package className="size-4" />
              Collection
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => submitEntry({ asCreditNote: true })}
            >
              <Receipt className="size-4" />
              Credit note
            </Button>
            {selectedCustomer?.collection && (
              <Badge variant="secondary" className="h-9 items-center">
                Collection customer
              </Badge>
            )}
            {area && !areas.includes(area) && (
              <Badge variant="warn" className="h-9 items-center">
                Town not on today’s trips
              </Badge>
            )}
          </div>
        </form>
      </section>

      <CollapsibleSection
        title="Held for later"
        description="Waiting for a matching trip day — or pick as exception if delivering today."
        defaultOpen={heldInvoices.length > 0}
        action={
          <Badge variant="outline" className="gap-1">
            <Inbox className="size-3.5" />
            {heldInvoices.length}
          </Badge>
        }
      >
        {sortedHeld.length === 0 ? (
          <EmptyState
            title="No held invoices"
            description="Use Hold for later when a town isn’t on today’s trips."
          />
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {sortedHeld.map((h) => (
                <HeldCard
                  key={h.id}
                  held={h}
                  todayTowns={areas}
                  townOptions={heldTownOptions}
                  highlightProps={highlightProps(h.id)}
                  onChange={(patch) => updateHeld(h.id, patch)}
                  onToggleCollection={(v) => setHeldCollection(h.id, v)}
                  onPick={() => handlePick(h.id)}
                  onPickException={() => handlePick(h.id, { asException: true })}
                  onRemove={() => {
                    removeHeld(h.id);
                    toast.success("Removed from held");
                  }}
                />
              ))}
            </div>
            <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
              <table className="w-full min-w-[820px] border-collapse text-sm">
                <thead className="bg-panel-2">
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="w-[8rem] px-3 py-2.5 font-medium">Doc</th>
                    <th className="px-3 py-2.5 font-medium">Customer</th>
                    <th className="w-[7rem] px-3 py-2.5 font-medium">Weight</th>
                    <th className="w-[11rem] px-3 py-2.5 font-medium">Town</th>
                    <th className="w-[8rem] px-3 py-2.5 font-medium">Type</th>
                    <th className="w-[14rem] px-3 py-2.5 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {sortedHeld.map((h) => (
                    <HeldRow
                      key={h.id}
                      held={h}
                      todayTowns={areas}
                      townOptions={heldTownOptions}
                      highlightProps={highlightProps(h.id)}
                      onChange={(patch) => updateHeld(h.id, patch)}
                      onToggleCollection={(v) => setHeldCollection(h.id, v)}
                      onPick={() => handlePick(h.id)}
                      onPickException={() => handlePick(h.id, { asException: true })}
                      onRemove={() => {
                        removeHeld(h.id);
                        toast.success("Removed from held");
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CollapsibleSection>

      {collectionInvoices.length > 0 && (
        <section className="panel p-4 sm:p-5">
          <ScreenHeader
            title="Collections"
            description="Customer collects, or load on a truck. Mark Collection when entering an invoice — same as Hold for later."
            className="mb-4"
          />
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-panel-2 hover:bg-panel-2">
                  <TableHead>Doc</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Town</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>Load #</TableHead>
                  <TableHead>Handling</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {collectionInvoices.map((i) => (
                  <TableRow key={i.id} {...highlightProps(i.id)}>
                    <TableCell className="metric-mono">{i.doc}</TableCell>
                    <TableCell>{i.customer}</TableCell>
                    <TableCell>{i.area || "—"}</TableCell>
                    <TableCell className="metric-mono">{i.weight || "—"}</TableCell>
                    <TableCell className="metric-mono text-muted-foreground">
                      {(i.area && loadingNumberFor(customers, i.customer, i.area)) || "—"}
                    </TableCell>
                    <TableCell>
                      <select
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        value={i.collection ? "collects" : "truck"}
                        onChange={(e) =>
                          updateInvoice(i.id, {
                            collection: e.target.value === "collects",
                            truckId: e.target.value === "collects" ? null : i.truckId,
                          })
                        }
                      >
                        <option value="collects">Customer collects</option>
                        <option value="truck">Load on truck</option>
                      </select>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleHold(i.id)}
                          disabled={!i.doc}
                        >
                          <Pause className="size-3.5" />
                          Hold
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeInvoice(i.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {creditInvoices.length > 0 && (
        <section className="panel p-4 sm:p-5">
          <ScreenHeader
            title="Credit notes"
            description="Negative weights stay here until loaded on a truck. Unpicked credits remain in this section."
            className="mb-4"
          />
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-panel-2 hover:bg-panel-2">
                  <TableHead>Doc</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Town</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>Load #</TableHead>
                  <TableHead>Handling</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {creditInvoices.map((i) => (
                  <TableRow key={i.id} {...highlightProps(i.id)}>
                    <TableCell className="metric-mono">{i.doc}</TableCell>
                    <TableCell>{i.customer}</TableCell>
                    <TableCell>{i.area || "—"}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={weightUnset(i.weight) ? "" : i.weight}
                        onChange={(e) =>
                          updateInvoice(i.id, { weight: Number(e.target.value) })
                        }
                        className={cn(
                          "metric-mono h-9 w-24",
                          weightUnset(i.weight) && "border-crit",
                        )}
                        placeholder="0"
                      />
                    </TableCell>
                    <TableCell className="metric-mono text-muted-foreground">
                      {(i.area && loadingNumberFor(customers, i.customer, i.area)) || "—"}
                    </TableCell>
                    <TableCell>
                      <select
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        value={i.creditNote ? "credit" : "truck"}
                        onChange={(e) =>
                          updateInvoice(i.id, {
                            creditNote: e.target.value === "credit",
                            truckId: e.target.value === "credit" ? null : i.truckId,
                          })
                        }
                      >
                        <option value="credit">Credit note</option>
                        <option value="truck">Load on truck</option>
                      </select>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleHold(i.id)}
                          disabled={!i.doc}
                        >
                          <Pause className="size-3.5" />
                          Hold
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeInvoice(i.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <section className="panel p-4 sm:p-5">
        <ScreenHeader
          title="Today’s invoices"
          description="Deliveries for today’s selected trips. Set weights after Excel import."
          className="mb-4"
        />
        {deliveryInvoices.length === 0 ? (
          <EmptyState
            title="No invoices yet"
            description="Enter doc number, customer, town, and weight above — or import Excel. New customers can be added from the customer field."
          />
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {deliveryInvoices.map((i, idx) => (
                <InvoiceCard
                  key={i.id}
                  inv={i}
                  areas={townOptions}
                  known={!!findCustomer(customers, i.customer)}
                  duplicate={(docCounts.get(i.doc) ?? 0) > 1}
                  index={idx}
                  loadNumber={
                    (i.area && loadingNumberFor(customers, i.customer, i.area)) || 0
                  }
                  highlightProps={highlightProps(i.id)}
                  onChange={(patch) => updateInvoice(i.id, patch)}
                  onRemove={() => removeInvoice(i.id)}
                  onHold={() => handleHold(i.id)}
                  onCollect={() => handleCollect(i.id)}
                  onCredit={() => handleCredit(i.id)}
                />
              ))}
            </div>
            <div className="hidden max-h-[520px] overflow-auto rounded-xl border border-border md:block">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-panel-2">
                  <TableRow className="hover:bg-panel-2">
                    <TableHead className="w-16">Load #</TableHead>
                    <TableHead className="w-28">Doc</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="w-28">Weight (kg)</TableHead>
                    <TableHead className="w-40">Town</TableHead>
                    <TableHead className="w-40" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveryInvoices.map((i, idx) => (
                    <InvoiceRow
                      key={i.id}
                      inv={i}
                      areas={townOptions}
                      known={!!findCustomer(customers, i.customer)}
                      duplicate={(docCounts.get(i.doc) ?? 0) > 1}
                      index={idx}
                      loadNumber={
                        (i.area && loadingNumberFor(customers, i.customer, i.area)) || 0
                      }
                      highlightProps={highlightProps(i.id)}
                      onChange={(patch) => updateInvoice(i.id, patch)}
                      onRemove={() => removeInvoice(i.id)}
                      onHold={() => handleHold(i.id)}
                      onCollect={() => handleCollect(i.id)}
                      onCredit={() => handleCredit(i.id)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="panel p-4">
          <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
            Validation
          </div>
          <div className="space-y-2 text-sm">
            {canConfirm ? (
              <div className="flex items-center gap-2 text-good">
                <CheckCircle2 className="size-4" />
                Complete
              </div>
            ) : (
              <div className="text-muted-foreground">
                {invoices.length === 0 ? "No invoices entered" : "Incomplete"}
              </div>
            )}
            <div
              className={`flex items-center gap-2 ${missingWeights ? "text-warn" : "text-muted-foreground"}`}
            >
              <TriangleAlert className="size-3.5" />
              Missing weights: {missingWeights}
            </div>
            <div
              className={`flex items-center gap-2 ${missingAreas ? "text-warn" : "text-muted-foreground"}`}
            >
              <TriangleAlert className="size-3.5" />
              Missing towns: {missingAreas}
            </div>
          </div>
          <Progress value={progressPct} className="mt-3" />
        </div>

        <StatTile label="Total weight" value={`${totalWeight.toFixed(0)} kg`} />
        <div className="panel flex flex-col justify-between p-4">
          <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Invoices</span>
            <span className="metric-mono text-right">{invoices.length}</span>
            <span className="text-muted-foreground">Weights entered</span>
            <span className="metric-mono text-right">{entered}</span>
            <span className="text-muted-foreground">Average</span>
            <span className="metric-mono text-right">{avg.toFixed(1)} kg</span>
          </div>
          <div className="space-y-2">
            <Button disabled={!canConfirm} className="w-full" size="lg" onClick={handleConfirm}>
              Continue to Trucks
              <ArrowRight className="size-4" />
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setStep("setup")}>
              <ArrowLeft className="size-4" />
              Back to Setup
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={!!pendingHold} onOpenChange={(o) => !o && setPendingHold(null)}>
        <AlertDialogContent className="panel border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Town not on today’s trips</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingHold?.area} isn’t on a selected trip. Hold this invoice for later?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingHold) return;
                holdInvoices(
                  [
                    {
                      doc: pendingHold.doc,
                      customer: pendingHold.customer,
                      weight: pendingHold.weight,
                      area: pendingHold.area,
                      source: "ADHOC",
                    },
                  ],
                  pendingHold.creditNote
                    ? "credit_note"
                    : pendingHold.collection
                      ? "collection"
                      : "town_not_on_trips",
                );
                toast.success("Held for later");
                setPendingHold(null);
                resetForm();
              }}
            >
              Hold for later
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InvoiceCard({
  inv,
  areas,
  known,
  duplicate,
  index,
  loadNumber,
  highlightProps,
  onChange,
  onRemove,
  onHold,
  onCollect,
  onCredit,
}: {
  inv: Invoice;
  areas: string[];
  known: boolean;
  duplicate?: boolean;
  index?: number;
  loadNumber?: number;
  highlightProps?: {
    "data-state"?: "selected";
    onClick: (e: React.MouseEvent) => void;
  };
  onChange: (p: Partial<Invoice>) => void;
  onRemove: () => void;
  onHold: () => void;
  onCollect: () => void;
  onCredit: () => void;
}) {
  const badWeight = weightUnset(inv.weight);
  const badArea = !inv.area;

  return (
    <div
      style={index !== undefined ? ({ "--index": index } as React.CSSProperties) : undefined}
      className={cn(
        "space-y-3 rounded-xl border border-border bg-panel-2/40 p-4 transition-colors",
        index !== undefined && "stagger-item",
        highlightProps?.["data-state"] === "selected" && "bg-primary/10 ring-1 ring-primary/30",
      )}
      {...highlightProps}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="metric-mono text-sm font-medium">{inv.doc}</div>
          <div className="mt-0.5 truncate text-sm">{inv.customer}</div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {known ? <Badge variant="good">Known</Badge> : <Badge variant="warn">New</Badge>}
          {duplicate && <Badge variant="crit">Duplicate</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Load #">
          <div className="metric-mono flex h-11 items-center text-muted-foreground">
            {loadNumber && loadNumber > 0 ? loadNumber : "—"}
          </div>
        </FormField>
        <FormField label="Weight (kg)">
          <Input
            type="number"
            inputMode="decimal"
            value={weightUnset(inv.weight) ? "" : inv.weight}
            onChange={(e) => onChange({ weight: Number(e.target.value) })}
            className={cn("weight-input metric-mono h-11 text-lg", badWeight && "border-crit")}
            placeholder="0"
          />
        </FormField>
      </div>

      <FormField label="Town">
        <TownCombobox
          value={inv.area}
          options={areas}
          allowEmpty
          emptyOptionLabel="Clear town"
          placeholder="Select town…"
          searchPlaceholder="Search towns…"
          onChange={(town) => onChange({ area: town })}
          buttonClassName={cn("h-11 w-full", badArea && "border-warn")}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" className="w-full" onClick={onHold} disabled={!inv.doc}>
          <Pause className="size-4" />
          Hold
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={onCollect}
          disabled={!inv.doc}
        >
          <Package className="size-4" />
          Collection
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={onCredit}
          disabled={!inv.doc}
        >
          <Receipt className="size-4" />
          Credit
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
          Remove
        </Button>
      </div>
    </div>
  );
}

function InvoiceRow({
  inv,
  areas,
  known,
  duplicate,
  index,
  loadNumber,
  highlightProps,
  onChange,
  onRemove,
  onHold,
  onCollect,
  onCredit,
}: {
  inv: Invoice;
  areas: string[];
  known: boolean;
  duplicate?: boolean;
  index?: number;
  loadNumber?: number;
  highlightProps?: {
    "data-state"?: "selected";
    onClick: (e: React.MouseEvent) => void;
  };
  onChange: (p: Partial<Invoice>) => void;
  onRemove: () => void;
  onHold: () => void;
  onCollect: () => void;
  onCredit: () => void;
}) {
  const badWeight = weightUnset(inv.weight);
  const badArea = !inv.area;

  return (
    <TableRow
      style={index !== undefined ? ({ "--index": index } as React.CSSProperties) : undefined}
      className={index !== undefined ? "stagger-item" : undefined}
      {...highlightProps}
    >
      <TableCell className="metric-mono text-muted-foreground">
        {loadNumber && loadNumber > 0 ? loadNumber : "—"}
      </TableCell>
      <TableCell className="metric-mono text-foreground">{inv.doc}</TableCell>
      <TableCell>
        <span className="flex flex-wrap items-center gap-2">
          {inv.customer}
          {known ? null : <Badge variant="warn">New</Badge>}
          {duplicate && <Badge variant="crit">Duplicate</Badge>}
        </span>
      </TableCell>
      <TableCell>
        <Input
          type="number"
          value={weightUnset(inv.weight) ? "" : inv.weight}
          onChange={(e) => onChange({ weight: Number(e.target.value) })}
          className={`weight-input metric-mono h-8 w-24 text-foreground ${badWeight ? "border-crit" : ""}`}
          placeholder="0"
        />
      </TableCell>
      <TableCell>
        <TownCombobox
          value={inv.area}
          options={areas}
          allowEmpty
          emptyOptionLabel="Clear town"
          placeholder="Select town…"
          searchPlaceholder="Search towns…"
          onChange={(town) => onChange({ area: town })}
          buttonClassName={`h-9 w-full min-w-[9rem] ${badArea ? "border-warn" : ""}`}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={onHold}
            disabled={!inv.doc}
            title="Hold for later"
          >
            <Pause className="size-3.5" />
            Hold
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={onCollect}
            disabled={!inv.doc}
            title="Mark as collection"
          >
            <Package className="size-3.5" />
            Collection
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={onCredit}
            disabled={!inv.doc}
            title="Mark as credit note"
          >
            <Receipt className="size-3.5" />
            Credit
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            aria-label="Remove"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function canPickHeld(held: HeldInvoice, todayTowns: string[]) {
  return !held.area || todayTowns.includes(held.area) || !!held.creditNote;
}

function heldTypeBadge(held: HeldInvoice) {
  if (held.creditNote || held.reason === "credit_note") {
    return <Badge variant="outline">Credit</Badge>;
  }
  if (held.collection || held.reason === "collection") {
    return <Badge variant="secondary">Collection</Badge>;
  }
  if (held.reason === "manual") return <Badge variant="outline">Manual</Badge>;
  return <Badge variant="warn">Off-trip</Badge>;
}

function HeldCard({
  held,
  todayTowns,
  townOptions,
  highlightProps,
  onChange,
  onToggleCollection,
  onPick,
  onPickException,
  onRemove,
}: {
  held: HeldInvoice;
  todayTowns: string[];
  townOptions: string[];
  highlightProps?: {
    "data-state"?: "selected";
    onClick: (e: React.MouseEvent) => void;
  };
  onChange: (p: Partial<Pick<HeldInvoice, "weight" | "area" | "doc" | "customer">>) => void;
  onToggleCollection: (v: boolean) => void;
  onPick: () => void;
  onPickException: () => void;
  onRemove: () => void;
}) {
  const pickable = canPickHeld(held, todayTowns);
  const isCollection = !!held.collection || held.reason === "collection";
  return (
    <div
      className={cn(
        "space-y-3 rounded-xl border border-border bg-panel-2/40 p-4 transition-colors",
        highlightProps?.["data-state"] === "selected" && "bg-primary/10 ring-1 ring-primary/30",
      )}
      {...highlightProps}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="metric-mono text-sm font-medium">{held.doc}</div>
          <div className="mt-0.5 truncate text-sm">{held.customer}</div>
        </div>
        {heldTypeBadge(held)}
      </div>
      <FormField label="Weight (kg)">
        <Input
          type="number"
          inputMode="decimal"
          value={weightUnset(held.weight) ? "" : held.weight}
          onChange={(e) => onChange({ weight: Number(e.target.value) })}
          className="metric-mono h-11"
          placeholder="0"
        />
      </FormField>
      <FormField label="Town">
        <TownCombobox
          value={held.area}
          options={townOptions}
          allowEmpty
          emptyOptionLabel="Clear town"
          placeholder="Select town…"
          searchPlaceholder="Search towns…"
          onChange={(town) => onChange({ area: town })}
          buttonClassName="h-11 w-full"
        />
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={isCollection} onCheckedChange={(v) => onToggleCollection(!!v)} />
        Mark as collection
      </label>
      {!pickable && held.area && (
        <p className="text-xs text-muted-foreground">
          {held.area} isn’t on today’s trips — pick as exception if delivering today.
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button type="button" className="w-full" disabled={!pickable} onClick={onPick}>
          Pick today
        </Button>
        {!pickable && (
          <Button type="button" variant="secondary" className="w-full" onClick={onPickException}>
            Pick as exception
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          className="w-full text-muted-foreground hover:text-destructive sm:col-span-2"
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
          Remove
        </Button>
      </div>
    </div>
  );
}

function HeldRow({
  held,
  todayTowns,
  townOptions,
  highlightProps,
  onChange,
  onToggleCollection,
  onPick,
  onPickException,
  onRemove,
}: {
  held: HeldInvoice;
  todayTowns: string[];
  townOptions: string[];
  highlightProps?: {
    "data-state"?: "selected";
    onClick: (e: React.MouseEvent) => void;
  };
  onChange: (p: Partial<Pick<HeldInvoice, "weight" | "area" | "doc" | "customer">>) => void;
  onToggleCollection: (v: boolean) => void;
  onPick: () => void;
  onPickException: () => void;
  onRemove: () => void;
}) {
  const pickable = canPickHeld(held, todayTowns);
  const isCollection = !!held.collection || held.reason === "collection";
  return (
    <tr
      className={cn(
        "cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted/50",
        highlightProps?.["data-state"] === "selected" && "bg-primary/10",
      )}
      {...highlightProps}
    >
      <td className="px-3 py-2 align-middle">
        <span className="metric-mono">{held.doc}</span>
      </td>
      <td className="px-3 py-2 align-middle">{held.customer}</td>
      <td className="px-3 py-2 align-middle">
        <Input
          type="number"
          value={weightUnset(held.weight) ? "" : held.weight}
          onChange={(e) => onChange({ weight: Number(e.target.value) })}
          className="metric-mono h-9 w-full min-w-[5.5rem]"
          placeholder="0"
        />
      </td>
      <td className="px-3 py-2 align-middle">
        <TownCombobox
          value={held.area}
          options={townOptions}
          allowEmpty
          emptyOptionLabel="Clear town"
          placeholder="Select town…"
          searchPlaceholder="Search towns…"
          onChange={(town) => onChange({ area: town })}
          buttonClassName="h-9 w-full min-w-[9rem]"
        />
        {!pickable && held.area && (
          <p className="mt-1 text-[11px] text-muted-foreground">Off today’s trips</p>
        )}
      </td>
      <td className="px-3 py-2 align-middle">
        <div className="flex flex-col gap-2">
          {heldTypeBadge(held)}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox
              checked={isCollection}
              onCheckedChange={(v) => onToggleCollection(!!v)}
              className="size-3.5"
            />
            Collection
          </label>
        </div>
      </td>
      <td className="px-3 py-2 align-middle">
        <div className="flex flex-wrap items-center justify-end gap-1">
          <Button type="button" size="sm" disabled={!pickable} onClick={onPick}>
            Pick
          </Button>
          {!pickable && (
            <Button type="button" size="sm" variant="secondary" onClick={onPickException}>
              Exception
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            aria-label="Remove held"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
