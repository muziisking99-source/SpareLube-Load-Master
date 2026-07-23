import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { parseExcelFile } from "@/lib/parse";
import { downloadInvoiceTemplate } from "@/lib/excelTemplates";
import { customerKey, findCustomer } from "@/lib/customers";
import { loadingNumberFor } from "@/lib/loadingOrder";
import { areaColor } from "@/lib/colors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScreenHeader } from "./ui/ScreenHeader";
import { EmptyState } from "./ui/EmptyState";
import { StatTile } from "./ui/StatTile";
import type { Invoice } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ImportScreen() {
  const plan = useStore((s) => s.plans[s.currentDate])!;
  const customers = useStore((s) => s.customers);
  const addInvoices = useStore((s) => s.addInvoices);
  const addAdhoc = useStore((s) => s.addAdhoc);
  const updateInvoice = useStore((s) => s.updateInvoice);
  const removeInvoice = useStore((s) => s.removeInvoice);
  const confirmImport = useStore((s) => s.confirmImport);
  const setCustomerLoadingNumber = useStore((s) => s.setCustomerLoadingNumber);
  const setStep = useStore((s) => s.setStep);

  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState("");
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pendingLoads, setPendingLoads] = useState<Record<string, number>>({});

  const areas = plan.areas;
  const invoices = plan.invoices;
  const systemInvoices = invoices.filter((i) => i.source === "SYSTEM");
  const adhocInvoices = invoices.filter((i) => i.source === "ADHOC");

  const docCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of invoices) m.set(i.doc, (m.get(i.doc) ?? 0) + 1);
    return m;
  }, [invoices]);

  const missingWeights = invoices.filter((i) => !i.weight || i.weight <= 0).length;
  const missingAreas = invoices.filter((i) => !i.area).length;
  const totalWeight = invoices.reduce((s, i) => s + (i.weight || 0), 0);
  const entered = invoices.filter((i) => i.weight > 0).length;
  const avg = entered ? totalWeight / entered : 0;
  const canConfirm = invoices.length > 0 && missingWeights === 0 && missingAreas === 0;
  const progressPct = invoices.length ? (entered / invoices.length) * 100 : 0;

  async function handleExcelFile(file: File) {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls") && !lower.endsWith(".csv")) {
      setMessage("Please upload an Excel file (.xlsx or .xls).");
      toast.error("Invalid file type");
      return;
    }

    setParsing(true);
    setFileName(file.name);
    setMessage("");
    try {
      const rows = await parseExcelFile(file);
      if (rows.length === 0) {
        setMessage("No valid rows found. Sheet needs Doc and Customer columns.");
        toast.error("No valid rows found");
        return;
      }
      const existingDocs = new Set(systemInvoices.map((i) => i.doc));
      const fresh = rows.filter((r) => !existingDocs.has(r.doc));
      addInvoices(
        fresh.map((r) => {
          const known = findCustomer(customers, r.customer);
          return {
            doc: r.doc,
            customer: r.customer,
            weight: 0,
            area: known?.defaultArea ?? "",
            source: "SYSTEM" as const,
          };
        }),
      );
      const loads: Record<string, number> = { ...pendingLoads };
      for (const r of fresh) {
        if (r.loadingNumber) loads[r.customer] = r.loadingNumber;
      }
      setPendingLoads(loads);
      // Apply immediately when customer already has an area
      for (const r of fresh) {
        if (!r.loadingNumber) continue;
        const known = findCustomer(customers, r.customer);
        if (known?.defaultArea) {
          setCustomerLoadingNumber(customerKey(known), known.defaultArea, r.loadingNumber);
        }
      }
      const withLoad = fresh.filter((r) => r.loadingNumber).length;
      const msg = `Parsed ${rows.length} row${rows.length === 1 ? "" : "s"} from ${file.name}. Added ${fresh.length}${withLoad ? ` (${withLoad} with load #)` : ""}.`;
      setMessage(msg);
      toast.success(msg);
    } catch {
      setMessage("Could not read that Excel file. Check the format and try again.");
      toast.error("Failed to read Excel file");
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleConfirm() {
    if (!canConfirm) return;
    const { known, learned } = confirmImport();
    // Apply pending Excel load numbers now that areas are confirmed
    const s = useStore.getState();
    for (const inv of s.plans[s.currentDate]?.invoices ?? []) {
      const n = pendingLoads[inv.customer];
      if (n && inv.area) {
        const known = findCustomer(s.customers, inv.customer);
        setCustomerLoadingNumber(known ? customerKey(known) : inv.customer, inv.area, n);
      }
    }
    setPendingLoads({});
    toast.success(`Saved. ${known} known customers, ${learned} newly learned.`);
    setStep("allocate");
  }

  return (
    <div className="space-y-6">
      <section className="panel p-5">
        <ScreenHeader
          title="Excel Import"
          description="Upload an .xlsx or .xls sheet with Doc and Customer columns. Optional Load # is stored as you enter it; truck sheets print lowest → highest."
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                downloadInvoiceTemplate();
                toast.success("Invoice template downloaded");
              }}
            >
              <Download className="size-4" />
              Download template
            </Button>
          }
          className="mb-4"
        />

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleExcelFile(f);
          }}
        />

        <button
          type="button"
          disabled={parsing}
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
            if (f) void handleExcelFile(f);
          }}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-10 text-center transition-colors",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border bg-panel-2/50 hover:border-primary/50 hover:bg-panel-2",
            parsing && "opacity-60",
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
            <p className="text-sm font-medium text-foreground">
              {parsing ? "Reading workbook…" : "Drop Excel file here, or click to browse"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              .xlsx / .xls — Doc, Customer, optional Load #
            </p>
          </div>
          {fileName && !parsing && (
            <Badge variant="outline" className="metric-mono font-normal">
              {fileName}
            </Badge>
          )}
        </button>

        {message && <p className="mt-3 text-sm text-muted-foreground">{message}</p>}
      </section>

      <section className="panel p-5">
        <ScreenHeader
          title="Adhoc Invoices"
          description="Manually add one-off deliveries not in the system export."
          action={
            <Button variant="secondary" size="sm" onClick={addAdhoc}>
              Add Row
            </Button>
          }
          className="mb-4"
        />
        {adhocInvoices.length === 0 ? (
          <EmptyState title="No adhoc invoices" description="Use Add Row for manual entries." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead className="bg-panel-2">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium w-[9rem]">Doc</th>
                  <th className="px-3 py-2.5 font-medium">Customer</th>
                  <th className="px-3 py-2.5 font-medium w-[7rem]">Weight</th>
                  <th className="px-3 py-2.5 font-medium w-[11rem]">Area</th>
                  <th className="px-3 py-2.5 font-medium w-[4.5rem]">Load #</th>
                  <th className="px-3 py-2.5 font-medium w-[3rem]" />
                </tr>
              </thead>
              <tbody>
                {adhocInvoices.map((i) => (
                  <AdhocRow
                    key={i.id}
                    inv={i}
                    areas={areas}
                    loadNumber={
                      (i.area && loadingNumberFor(customers, i.customer, i.area)) ||
                      pendingLoads[i.customer] ||
                      0
                    }
                    onChange={(patch) => updateInvoice(i.id, patch)}
                    onRemove={() => removeInvoice(i.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {invoices.length > 0 && (
        <section className="panel p-5">
          <ScreenHeader
            title="Review — Enter Weights"
            description="Tab or Enter to move between weight fields. All weights and areas must be complete."
            className="mb-4"
          />
          <div className="max-h-[520px] overflow-auto rounded-xl border border-border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-panel-2">
                <TableRow className="hover:bg-panel-2">
                  <TableHead className="w-16">Load #</TableHead>
                  <TableHead className="w-28">Doc</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="w-28">Weight (kg)</TableHead>
                  <TableHead className="w-40">Area</TableHead>
                  <TableHead className="w-40">Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((i, idx) => {
                  const knownCust = findCustomer(customers, i.customer);
                  const known = i.source === "SYSTEM" && !!knownCust;
                  const dup = (docCounts.get(i.doc) ?? 0) > 1;
                  return (
                    <InvoiceRow
                      key={i.id}
                      inv={i}
                      areas={areas}
                      known={known}
                      duplicate={dup}
                      index={idx}
                      loadNumber={
                        (i.area && loadingNumberFor(customers, i.customer, i.area)) ||
                        pendingLoads[i.customer] ||
                        0
                      }
                      onChange={(patch) => updateInvoice(i.id, patch)}
                      onRemove={() => removeInvoice(i.id)}
                    />
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="panel p-4">
          <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Validation</div>
          <div className="space-y-2 text-sm">
            {canConfirm ? (
              <div className="flex items-center gap-2 text-good">
                <CheckCircle2 className="size-4" />
                Complete
              </div>
            ) : (
              <div className="text-muted-foreground">Incomplete</div>
            )}
            <div className={`flex items-center gap-2 ${missingWeights ? "text-warn" : "text-muted-foreground"}`}>
              <TriangleAlert className="size-3.5" />
              Missing weights: {missingWeights}
            </div>
            <div className={`flex items-center gap-2 ${missingAreas ? "text-warn" : "text-muted-foreground"}`}>
              <TriangleAlert className="size-3.5" />
              Missing areas: {missingAreas}
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
            <Button disabled={!canConfirm} className="w-full" onClick={handleConfirm}>
              Confirm and Save
              <ArrowRight className="size-4" />
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setStep("setup")}>
              <ArrowLeft className="size-4" />
              Back to Setup
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdhocRow({
  inv,
  areas,
  loadNumber,
  onChange,
  onRemove,
}: {
  inv: Invoice;
  areas: string[];
  loadNumber: number;
  onChange: (p: Partial<Invoice>) => void;
  onRemove: () => void;
}) {
  const customers = useStore((s) => s.customers);
  const [docDraft, setDocDraft] = useState(inv.doc);
  const [customerDraft, setCustomerDraft] = useState(inv.customer);

  useEffect(() => {
    setDocDraft(inv.doc);
  }, [inv.doc]);
  useEffect(() => {
    setCustomerDraft(inv.customer);
  }, [inv.customer]);

  const badWeight = !inv.weight || inv.weight <= 0;
  const badArea = !inv.area;

  function commitCustomer() {
    const name = customerDraft.trim();
    if (name === inv.customer) return;
    const known = findCustomer(customers, name);
    onChange({
      customer: name,
      ...(known?.defaultArea && areas.includes(known.defaultArea)
        ? { area: known.defaultArea }
        : {}),
    });
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-2 align-middle">
        <Input
          value={docDraft}
          onChange={(e) => setDocDraft(e.target.value)}
          onBlur={() => {
            if (docDraft !== inv.doc) onChange({ doc: docDraft });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="Doc #"
          className="h-9 min-w-[7rem] metric-mono text-foreground"
          autoComplete="off"
        />
      </td>
      <td className="px-3 py-2 align-middle">
        <Input
          value={customerDraft}
          onChange={(e) => setCustomerDraft(e.target.value)}
          onBlur={commitCustomer}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="Customer"
          className="h-9 min-w-[10rem] text-foreground"
          autoComplete="off"
        />
      </td>
      <td className="px-3 py-2 align-middle">
        <Input
          type="number"
          min={0}
          value={inv.weight || ""}
          onChange={(e) => onChange({ weight: Number(e.target.value) })}
          className={`weight-input h-9 w-full min-w-[5.5rem] metric-mono text-foreground ${
            badWeight ? "border-crit" : ""
          }`}
          placeholder="0"
        />
      </td>
      <td className="px-3 py-2 align-middle">
        <select
          value={inv.area}
          onChange={(e) => onChange({ area: e.target.value })}
          className={`h-9 w-full min-w-[9rem] rounded-lg border bg-panel-2 px-2 text-sm text-foreground ${
            badArea ? "border-warn" : "border-input"
          }`}
        >
          <option value="">Select area</option>
          {areas.map((a) => {
            const c = areaColor(a);
            return (
              <option key={a} value={a} style={{ color: c.text }}>
                {a}
              </option>
            );
          })}
        </select>
      </td>
      <td className="px-3 py-2 align-middle">
        <span className="metric-mono text-muted-foreground">
          {loadNumber > 0 ? loadNumber : "—"}
        </span>
      </td>
      <td className="px-3 py-2 align-middle">
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
      </td>
    </tr>
  );
}

function InvoiceRow({
  inv,
  areas,
  known,
  duplicate,
  index,
  loadNumber,
  onChange,
  onRemove,
}: {
  inv: Invoice;
  areas: string[];
  known: boolean;
  duplicate?: boolean;
  index?: number;
  loadNumber?: number;
  onChange: (p: Partial<Invoice>) => void;
  onRemove: () => void;
}) {
  const badWeight = !inv.weight || inv.weight <= 0;
  const badArea = !inv.area;
  const rowStyle = known
    ? { background: "color-mix(in oklab, var(--good) 8%, transparent)" }
    : duplicate
      ? { background: "color-mix(in oklab, var(--crit) 10%, transparent)" }
      : { background: "color-mix(in oklab, var(--warn) 6%, transparent)" };

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const inputs = Array.from(
        (e.currentTarget.closest("tbody") as HTMLElement).querySelectorAll<HTMLInputElement>(
          "input.weight-input",
        ),
      );
      const idx = inputs.indexOf(e.target as HTMLInputElement);
      inputs[idx + 1]?.focus();
    }
  }

  return (
    <TableRow
      style={
        {
          ...rowStyle,
          ...(index !== undefined ? { "--index": index } : {}),
        } as React.CSSProperties
      }
      className={index !== undefined ? "stagger-item" : undefined}
    >
      <TableCell className="metric-mono text-muted-foreground">
        {loadNumber && loadNumber > 0 ? loadNumber : "—"}
      </TableCell>
      <TableCell className="metric-mono text-foreground">{inv.doc}</TableCell>
      <TableCell>
        <span className="flex flex-wrap items-center gap-2">
          {inv.customer}
          {duplicate && <Badge variant="crit">Duplicate</Badge>}
        </span>
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          value={inv.weight || ""}
          onChange={(e) => onChange({ weight: Number(e.target.value) })}
          onKeyDown={onKey}
          className={`weight-input h-8 w-24 metric-mono text-foreground ${badWeight ? "border-crit" : ""}`}
          placeholder="0"
        />
      </TableCell>
      <TableCell>
        <select
          value={inv.area}
          onChange={(e) => onChange({ area: e.target.value })}
          className={`h-9 w-full rounded-lg border bg-panel-2 px-2 text-sm text-foreground ${
            badArea ? "border-warn" : "border-input"
          }`}
        >
          <option value="">Select area</option>
          {areas.map((a) => {
            const c = areaColor(a);
            return (
              <option key={a} value={a} style={{ color: c.text }}>
                {a}
              </option>
            );
          })}
        </select>
      </TableCell>
      <TableCell>
        {known ? <Badge variant="good">Known</Badge> : <Badge variant="warn">New</Badge>}
        {inv.source === "ADHOC" && (
          <Badge variant="outline" className="ml-1">
            Adhoc
          </Badge>
        )}
      </TableCell>
      <TableCell>
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
      </TableCell>
    </TableRow>
  );
}
