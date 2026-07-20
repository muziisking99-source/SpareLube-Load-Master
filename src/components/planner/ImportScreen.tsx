import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { parseImport } from "@/lib/parse";
import { areaColor } from "@/lib/colors";

export function ImportScreen() {
  const plan = useStore((s) => s.plans[s.currentDate])!;
  const customers = useStore((s) => s.customers);
  const addInvoices = useStore((s) => s.addInvoices);
  const addAdhoc = useStore((s) => s.addAdhoc);
  const updateInvoice = useStore((s) => s.updateInvoice);
  const removeInvoice = useStore((s) => s.removeInvoice);
  const confirmImport = useStore((s) => s.confirmImport);
  const setStep = useStore((s) => s.setStep);

  const [paste, setPaste] = useState("");
  const [message, setMessage] = useState("");

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
  const canConfirm =
    invoices.length > 0 && missingWeights === 0 && missingAreas === 0;

  function doParse() {
    const rows = parseImport(paste);
    if (rows.length === 0) {
      setMessage("No valid rows found. Use TAB or comma-separated Doc,Customer.");
      return;
    }
    // filter duplicates against existing SYSTEM rows already imported
    const existingDocs = new Set(systemInvoices.map((i) => i.doc));
    const fresh = rows.filter((r) => !existingDocs.has(r.doc));
    addInvoices(
      fresh.map((r) => ({
        doc: r.doc,
        customer: r.customer,
        weight: 0,
        area: customers[r.customer]?.defaultArea ?? "",
        source: "SYSTEM",
      })),
    );
    setPaste("");
    setMessage(
      `Parsed ${rows.length} row${rows.length === 1 ? "" : "s"}. Added ${fresh.length}.`,
    );
  }

  function handleConfirm() {
    if (!canConfirm) return;
    const { known, learned } = confirmImport();
    alert(`Saved. ${known} known customers, ${learned} newly learned.`);
    setStep("allocate");
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="text-lg font-semibold mb-2">Paste Import</h2>
          <p className="text-xs text-muted-foreground mb-2">
            One row per line — <code>DOC[TAB]Customer</code> or <code>DOC,Customer</code>.
            Weights are added below.
          </p>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={10}
            placeholder={"12345\tABC Stores\n12346,XYZ Depot"}
            className="w-full bg-panel-2 border border-border rounded p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={doParse}
              className="px-4 py-2 rounded bg-primary text-primary-foreground font-medium"
            >
              Parse & Review
            </button>
            {message && <span className="text-sm text-muted-foreground">{message}</span>}
          </div>
        </section>

        <section className="panel p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Adhoc Invoices</h2>
            <button
              onClick={addAdhoc}
              className="text-sm px-3 py-1 rounded bg-secondary text-secondary-foreground"
            >
              + Add Row
            </button>
          </div>
          {adhocInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No adhoc invoices yet.</p>
          ) : (
            <div className="overflow-auto max-h-80">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-left">
                  <tr>
                    <th className="p-2">Doc</th>
                    <th className="p-2">Customer</th>
                    <th className="p-2 w-24">Weight</th>
                    <th className="p-2 w-40">Area</th>
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {adhocInvoices.map((i) => (
                    <InvoiceRow
                      key={i.id}
                      inv={i}
                      areas={areas}
                      onChange={(patch) => updateInvoice(i.id, patch)}
                      onRemove={() => removeInvoice(i.id)}
                      known={false}
                      adhoc
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {invoices.length > 0 && (
        <section className="panel p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Review — Enter Weights</h2>
            <div className="text-xs text-muted-foreground">
              Tab / Enter to move. Numeric only. Blank or 0 blocks confirmation.
            </div>
          </div>
          <div className="overflow-auto max-h-[520px] border border-border rounded">
            <table className="w-full text-sm">
              <thead className="bg-panel-2 text-muted-foreground text-left sticky top-0">
                <tr>
                  <th className="p-2 w-28">Doc</th>
                  <th className="p-2">Customer</th>
                  <th className="p-2 w-28">Weight (kg)</th>
                  <th className="p-2 w-40">Area</th>
                  <th className="p-2 w-40">Status</th>
                  <th className="p-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => {
                  const known = i.source === "SYSTEM" && !!customers[i.customer];
                  const dup = (docCounts.get(i.doc) ?? 0) > 1;
                  return (
                    <InvoiceRow
                      key={i.id}
                      inv={i}
                      areas={areas}
                      known={known}
                      duplicate={dup}
                      onChange={(patch) => updateInvoice(i.id, patch)}
                      onRemove={() => removeInvoice(i.id)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="panel p-4">
          <div className="text-xs text-muted-foreground mb-1">Validation</div>
          <div className="space-y-1 text-sm">
            <div className={missingWeights === 0 && missingAreas === 0 && invoices.length > 0 ? "text-good" : ""}>
              {missingWeights === 0 && missingAreas === 0 && invoices.length > 0
                ? "✓ Complete"
                : "Incomplete"}
            </div>
            <div className={missingWeights ? "text-warn" : "text-muted-foreground"}>
              ⚠ Missing Weights: {missingWeights}
            </div>
            <div className={missingAreas ? "text-warn" : "text-muted-foreground"}>
              ⚠ Missing Areas: {missingAreas}
            </div>
          </div>
          <div className="mt-2 h-2 bg-panel-2 rounded overflow-hidden">
            <div
              className="h-full bg-primary"
              style={{
                width: `${invoices.length ? (entered / invoices.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
        <div className="panel p-4">
          <div className="text-xs text-muted-foreground mb-1">Live Weight Summary</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Total Invoices</div><div className="font-mono">{invoices.length}</div>
            <div>Weights Entered</div><div className="font-mono">{entered}</div>
            <div>Total Weight</div><div className="font-mono">{totalWeight.toFixed(0)} kg</div>
            <div>Average Weight</div><div className="font-mono">{avg.toFixed(1)} kg</div>
          </div>
        </div>
        <div className="panel p-4 flex flex-col justify-between">
          <div className="text-xs text-muted-foreground mb-2">Confirm & continue</div>
          <button
            disabled={!canConfirm}
            onClick={handleConfirm}
            className="w-full py-3 rounded bg-primary text-primary-foreground font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Confirm & Save (Ctrl+Enter)
          </button>
          <button
            onClick={() => setStep("setup")}
            className="w-full py-2 mt-2 rounded border border-border text-sm hover:bg-panel-2"
          >
            ← Back to Setup
          </button>
        </div>
      </div>
    </div>
  );
}

function InvoiceRow({
  inv,
  areas,
  known,
  duplicate,
  adhoc,
  onChange,
  onRemove,
}: {
  inv: import("@/lib/types").Invoice;
  areas: string[];
  known: boolean;
  duplicate?: boolean;
  adhoc?: boolean;
  onChange: (p: Partial<import("@/lib/types").Invoice>) => void;
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
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      // handled at parent via button; blur to trigger update
      (e.target as HTMLElement).blur();
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const inputs = Array.from(
        (e.currentTarget.closest("tbody") as HTMLElement).querySelectorAll<HTMLInputElement>(
          "input.weight-input",
        ),
      );
      const idx = inputs.indexOf(e.target as HTMLInputElement);
      const next = inputs[idx + 1];
      next?.focus();
    }
  }

  return (
    <tr className="border-t border-border" style={rowStyle}>
      <td className="p-2 font-mono">
        {adhoc ? (
          <input
            value={inv.doc}
            onChange={(e) => onChange({ doc: e.target.value })}
            className="bg-transparent border border-border rounded px-1 py-0.5 w-full"
          />
        ) : (
          <span>{inv.doc}</span>
        )}
      </td>
      <td className="p-2">
        {adhoc ? (
          <input
            value={inv.customer}
            onChange={(e) => onChange({ customer: e.target.value })}
            className="bg-transparent border border-border rounded px-1 py-0.5 w-full"
          />
        ) : (
          <>
            <span>{inv.customer}</span>
            {duplicate && (
              <span className="ml-2 chip" style={{ color: "var(--crit)", borderColor: "var(--crit)" }}>
                Duplicate
              </span>
            )}
          </>
        )}
      </td>
      <td className="p-2">
        <input
          type="number"
          min={0}
          value={inv.weight || ""}
          onChange={(e) => onChange({ weight: Number(e.target.value) })}
          onKeyDown={onKey}
          className={`weight-input w-24 bg-panel-2 border rounded px-2 py-1 font-mono ${
            badWeight ? "border-crit" : "border-border"
          }`}
          placeholder="0"
        />
      </td>
      <td className="p-2">
        <select
          value={inv.area}
          onChange={(e) => onChange({ area: e.target.value })}
          disabled={known && !!inv.area}
          className={`w-full bg-panel-2 border rounded px-2 py-1 disabled:opacity-70 ${
            badArea ? "border-warn" : "border-border"
          }`}
        >
          <option value="">— Area —</option>
          {areas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2">
        {adhoc ? (
          <span className="chip" style={{ color: "var(--primary)", borderColor: "var(--primary)" }}>
            Adhoc
          </span>
        ) : known ? (
          <span className="chip" style={{ color: "var(--good)", borderColor: "var(--good)" }}>
            Known
          </span>
        ) : (
          <span className="chip" style={{ color: "var(--warn)", borderColor: "var(--warn)" }}>
            New — Assign Area
          </span>
        )}
      </td>
      <td className="p-2 text-right">
        <button
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive text-xs"
          aria-label="Remove"
        >
          ✕
        </button>
      </td>
    </tr>
  );
}
