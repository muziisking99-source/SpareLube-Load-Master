import { useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { useStore } from "@/lib/store";
import { compareByLoadingNumber, loadingNumberFor } from "@/lib/loadingOrder";
import { Button } from "@/components/ui/button";
import { ScreenHeader } from "./ui/ScreenHeader";

export function PrintScreen() {
  const plan = useStore((s) => s.plans[s.currentDate])!;
  const trucks = useStore((s) => s.trucks);
  const setStep = useStore((s) => s.setStep);
  const [view, setView] = useState<"truck" | "master" | null>(null);

  const active = trucks.filter((t) => t.active);
  const customers = useStore((s) => s.customers);
  const dayAreas = new Map(plan.truckDay.map((td) => [td.truckId, td.areas ?? []]));

  function print(v: "truck" | "master") {
    setView(v);
    setTimeout(() => window.print(), 100);
  }

  /** Truck sheets: load # lowest → highest; invoices without a load # last. */
  function sortInvoices(list: typeof plan.invoices) {
    return [...list].sort((a, b) => compareByLoadingNumber(customers, a, b));
  }

  const truckSheets = active.flatMap((t) => {
    const onTruck = plan.invoices.filter((i) => i.truckId === t.id);
    const r1 = sortInvoices(onTruck.filter((i) => (i.round ?? 1) === 1));
    const r2 = sortInvoices(onTruck.filter((i) => (i.round ?? 1) === 2));
    const sheets: { truck: (typeof active)[0]; round: number; list: typeof r1 }[] = [
      { truck: t, round: 1, list: r1 },
    ];
    if (r2.length > 0) sheets.push({ truck: t, round: 2, list: r2 });
    return sheets;
  });

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap gap-3 p-4 no-print">
        <Button variant="outline" onClick={() => setStep("lock")}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button onClick={() => print("truck")}>
          <Printer className="size-4" />
          Truck Load Sheets
        </Button>
        <Button onClick={() => print("master")}>
          <Printer className="size-4" />
          Master Reconciliation
        </Button>
      </div>

      <div className="panel p-4 no-print">
        <ScreenHeader
          title="Print preview"
          description="Print previews open in the browser print dialog. Select a view below to preview on screen."
          className="mb-3"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant={view === "truck" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("truck")}
          >
            Preview Truck Sheets
          </Button>
          <Button
            variant={view === "master" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("master")}
          >
            Preview Master Report
          </Button>
        </div>
      </div>

      {view === "truck" && (
        <div className="print-root" style={{ display: "block" }}>
          {truckSheets.map((sheet, idx) => {
            const { truck: t, round, list } = sheet;
            const wt = list.reduce((s, i) => s + i.weight, 0);
            return (
              <div
                key={`${t.id}-r${round}`}
                style={{
                  padding: "24px",
                  pageBreakAfter: idx < truckSheets.length - 1 ? "always" : "auto",
                }}
              >
                <h1 style={{ fontSize: 22, marginBottom: 6 }}>
                  Truck Load Sheet{round === 2 ? " — Round 2" : ""}
                </h1>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <div>
                    Date: <b>{plan.date}</b>
                  </div>
                  <div>
                    Truck: <b>{t.name}</b>
                  </div>
                  <div>
                    Round: <b>{round}</b>
                  </div>
                  <div>
                    Areas: <b>{(dayAreas.get(t.id) ?? []).join(", ") || "—"}</b>
                  </div>
                  <div>Driver: ______________</div>
                </div>
                <table style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>Load #</th>
                      <th style={{ width: 100 }}>Document</th>
                      <th>Customer</th>
                      <th style={{ width: 100 }}>Weight (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((i) => {
                      const loadNo = loadingNumberFor(customers, i.customer, i.area);
                      return (
                        <tr key={i.id}>
                          <td style={{ textAlign: "right" }}>{loadNo > 0 ? loadNo : ""}</td>
                          <td>{i.doc}</td>
                          <td>{i.customer}</td>
                          <td style={{ textAlign: "right" }}>{i.weight}</td>
                        </tr>
                      );
                    })}
                    {list.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: "center" }}>
                          No invoices
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>
                        <b>Total Weight</b>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <b>{wt.toFixed(0)}</b>
                      </td>
                    </tr>
                  </tfoot>
                </table>
                <div style={{ marginTop: 20, fontSize: 12 }}>
                  Loader Signature: ______________________ Time Departed: ______________
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
            <div style={{ fontSize: 13, marginBottom: 12 }}>
              Date: <b>{plan.date}</b>
            </div>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Load #</th>
                  <th style={{ width: 100 }}>Document</th>
                  <th>Customer</th>
                  <th style={{ width: 100 }}>Weight</th>
                  <th style={{ width: 160 }}>Truck</th>
                  <th style={{ width: 70 }}>Round</th>
                </tr>
              </thead>
              <tbody>
                {sortInvoices(plan.invoices).map((i) => {
                  const loadNo = loadingNumberFor(customers, i.customer, i.area);
                  return (
                    <tr key={i.id}>
                      <td style={{ textAlign: "right" }}>{loadNo > 0 ? loadNo : ""}</td>
                      <td>{i.doc}</td>
                      <td>{i.customer}</td>
                      <td style={{ textAlign: "right" }}>{i.weight}</td>
                      <td>{trucks.find((t) => t.id === i.truckId)?.name ?? "UNALLOCATED"}</td>
                      <td style={{ textAlign: "center" }}>{i.truckId ? (i.round ?? 1) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ marginTop: 24, fontSize: 12 }}>
              Reconciled By: ______________________ Signature: ______________________
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
