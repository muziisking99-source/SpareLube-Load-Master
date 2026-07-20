import { useState } from "react";
import { useStore } from "@/lib/store";

export function PrintScreen() {
  const plan = useStore((s) => s.plans[s.currentDate])!;
  const trucks = useStore((s) => s.trucks);
  const setStep = useStore((s) => s.setStep);
  const [view, setView] = useState<"truck" | "master" | null>(null);

  const active = trucks.filter((t) => t.active);
  const dayArea = new Map(plan.truckDay.map((td) => [td.truckId, td.area]));

  function print(v: "truck" | "master") {
    setView(v);
    setTimeout(() => window.print(), 100);
  }

  return (
    <div className="space-y-4">
      <div className="panel p-4 flex flex-wrap gap-3 no-print">
        <button
          onClick={() => setStep("lock")}
          className="px-4 py-2 rounded border border-border hover:bg-panel-2"
        >
          ← Back
        </button>
        <button
          onClick={() => print("truck")}
          className="px-4 py-2 rounded bg-primary text-primary-foreground font-semibold"
        >
          🖨 Truck Load Sheets
        </button>
        <button
          onClick={() => print("master")}
          className="px-4 py-2 rounded bg-primary text-primary-foreground font-semibold"
        >
          🖨 Master Reconciliation
        </button>
      </div>

      <div className="panel p-4 no-print">
        <p className="text-sm text-muted-foreground">
          Print previews open in the browser's print dialog. Adjust the print
          view to preview here:
        </p>
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => setView("truck")}
            className={`px-3 py-1.5 rounded border ${view === "truck" ? "border-primary" : "border-border"}`}
          >
            Preview Truck Sheets
          </button>
          <button
            onClick={() => setView("master")}
            className={`px-3 py-1.5 rounded border ${view === "master" ? "border-primary" : "border-border"}`}
          >
            Preview Master Report
          </button>
        </div>
      </div>

      {view === "truck" && (
        <div className="print-root" style={{ display: "block" }}>
          {active.map((t, idx) => {
            const list = plan.invoices
              .filter((i) => i.truckId === t.id)
              .sort((a, b) => a.doc.localeCompare(b.doc));
            const wt = list.reduce((s, i) => s + i.weight, 0);
            return (
              <div
                key={t.id}
                style={{
                  padding: "24px",
                  pageBreakAfter: idx < active.length - 1 ? "always" : "auto",
                }}
              >
                <h1 style={{ fontSize: 22, marginBottom: 6 }}>Truck Load Sheet</h1>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <div>Date: <b>{plan.date}</b></div>
                  <div>Truck: <b>{t.name}</b></div>
                  <div>Area: <b>{dayArea.get(t.id) ?? "—"}</b></div>
                  <div>Driver: ______________</div>
                </div>
                <table style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 100 }}>Document</th>
                      <th>Customer</th>
                      <th style={{ width: 100 }}>Weight (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((i) => (
                      <tr key={i.id}>
                        <td>{i.doc}</td>
                        <td>{i.customer}</td>
                        <td style={{ textAlign: "right" }}>{i.weight}</td>
                      </tr>
                    ))}
                    {list.length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ textAlign: "center" }}>
                          No invoices
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}><b>Total Weight</b></td>
                      <td style={{ textAlign: "right" }}><b>{wt.toFixed(0)}</b></td>
                    </tr>
                  </tfoot>
                </table>
                <div style={{ marginTop: 20, fontSize: 12 }}>
                  Loader Signature: ______________________ Time Departed:
                  ______________
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "master" && (
        <div className="print-root" style={{ display: "block" }}>
          <div style={{ padding: "24px" }}>
            <h1 style={{ fontSize: 22, marginBottom: 6 }}>Master Reconciliation</h1>
            <div style={{ fontSize: 13, marginBottom: 12 }}>Date: <b>{plan.date}</b></div>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Document</th>
                  <th>Customer</th>
                  <th style={{ width: 100 }}>Weight</th>
                  <th style={{ width: 160 }}>Truck</th>
                </tr>
              </thead>
              <tbody>
                {[...plan.invoices]
                  .sort((a, b) => a.doc.localeCompare(b.doc))
                  .map((i) => (
                    <tr key={i.id}>
                      <td>{i.doc}</td>
                      <td>{i.customer}</td>
                      <td style={{ textAlign: "right" }}>{i.weight}</td>
                      <td>
                        {trucks.find((t) => t.id === i.truckId)?.name ?? "UNALLOCATED"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <div style={{ marginTop: 24, fontSize: 12 }}>
              Reconciled By: ______________________ Signature:
              ______________________
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
