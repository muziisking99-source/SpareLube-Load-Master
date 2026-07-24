import { useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { useStore } from "@/lib/store";
import { compareByLoadingNumber, loadingNumberFor } from "@/lib/loadingOrder";
import { tripById } from "@/lib/trips";
import { Button } from "@/components/ui/button";
import { ScreenHeader } from "./ui/ScreenHeader";
import type { Invoice } from "@/lib/types";

/** One stop on a truck sheet: same customer combined (count + total weight). */
type LoadStop = {
  key: string;
  customer: string;
  area: string;
  count: number;
  weight: number;
};

/** Group invoices by customer, preserving load-number order from a sorted list. */
function groupStopsForLoadSheet(list: Invoice[]): LoadStop[] {
  const order: string[] = [];
  const map = new Map<string, LoadStop>();
  for (const inv of list) {
    const key = inv.customer.trim().toLowerCase() || `__anon_${inv.id}`;
    let stop = map.get(key);
    if (!stop) {
      stop = {
        key,
        customer: inv.customer,
        area: inv.area,
        count: 0,
        weight: 0,
      };
      map.set(key, stop);
      order.push(key);
    }
    stop.count += 1;
    stop.weight += inv.weight || 0;
  }
  return order.map((k) => map.get(k)!);
}

function MetaField({
  label,
  value,
  blank,
}: {
  label: string;
  value?: string;
  blank?: boolean;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#555",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: blank ? 400 : 600,
          borderBottom: "1px solid #222",
          minHeight: 22,
          paddingBottom: 2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {blank ? "\u00a0" : (value ?? "—")}
      </div>
    </div>
  );
}

function LoadStopsTable({
  stops,
  customers,
  totalWeight,
}: {
  stops: LoadStop[];
  customers: Record<string, import("@/lib/types").CustomerMemory>;
  totalWeight: number;
}) {
  return (
    <table style={{ marginTop: 4, width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ width: 56 }}>Load #</th>
          <th>Customer</th>
          <th style={{ width: 96, textAlign: "right" }}>Weight (kg)</th>
          <th style={{ width: 88, textAlign: "center" }}>Cash / EFT</th>
        </tr>
      </thead>
      <tbody>
        {stops.map((stop) => {
          const loadNo = loadingNumberFor(customers, stop.customer, stop.area);
          return (
            <tr key={stop.key}>
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {loadNo > 0 ? loadNo : ""}
              </td>
              <td>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span>{stop.customer}</span>
                  {stop.count > 1 && (
                    <span
                      className="inv-count-chip"
                      style={{
                        display: "inline-block",
                        padding: "1px 7px",
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 700,
                        lineHeight: 1.4,
                        background: "#efefef",
                        border: "1px solid #bbb",
                      }}
                      title={`${stop.count} invoices`}
                    >
                      {stop.count}
                    </span>
                  )}
                </span>
              </td>
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {stop.weight}
              </td>
              <td style={{ textAlign: "center", color: "#999" }}>&nbsp;</td>
            </tr>
          );
        })}
        {stops.length === 0 && (
          <tr>
            <td colSpan={4} style={{ textAlign: "center", color: "#666" }}>
              No invoices
            </td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={2} style={{ fontWeight: 700 }}>
            Total weight
          </td>
          <td
            style={{
              textAlign: "right",
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {totalWeight.toFixed(0)}
          </td>
          <td />
        </tr>
      </tfoot>
    </table>
  );
}

export function PrintScreen() {
  const plan = useStore((s) => s.plans[s.currentDate])!;
  const trucks = useStore((s) => s.trucks);
  const trips = useStore((s) => s.trips);
  const setStep = useStore((s) => s.setStep);
  const [view, setView] = useState<"truck" | "master" | null>(null);

  const active = trucks.filter((t) => t.active);
  const customers = useStore((s) => s.customers);
  const dayTripName = new Map(
    plan.truckDay.map((td) => {
      const trip = tripById(trips, td.tripId);
      return [td.truckId, trip?.name ?? null] as const;
    }),
  );

  function print(v: "truck" | "master") {
    setView(v);
    setTimeout(() => window.print(), 100);
  }

  /** Truck sheets: load # lowest → highest; invoices without a load # last. */
  function sortInvoices(list: typeof plan.invoices) {
    return [...list].sort((a, b) => compareByLoadingNumber(customers, a, b));
  }

  /** One page per truck. Round 2 (if any) prints on the same page under Round 1. */
  const truckSheets = active.map((t) => {
    const onTruck = plan.invoices.filter((i) => i.truckId === t.id);
    const r1 = sortInvoices(onTruck.filter((i) => (i.round ?? 1) === 1));
    const r2 = sortInvoices(onTruck.filter((i) => (i.round ?? 1) === 2));
    return {
      truck: t,
      rounds: [
        { round: 1, list: r1, stops: groupStopsForLoadSheet(r1) },
        ...(r2.length > 0
          ? [{ round: 2, list: r2, stops: groupStopsForLoadSheet(r2) }]
          : []),
      ],
    };
  });

  return (
    <div className="space-y-4">
      <div className="panel flex flex-col gap-3 p-4 no-print sm:flex-row sm:flex-wrap">
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => setStep("lock")}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button className="w-full sm:w-auto" onClick={() => print("truck")}>
          <Printer className="size-4" />
          Truck Load Sheets
        </Button>
        <Button className="w-full sm:w-auto" onClick={() => print("master")}>
          <Printer className="size-4" />
          Master Reconciliation
        </Button>
      </div>

      <div className="panel p-4 no-print">
        <ScreenHeader
          title="Print preview"
          description="Each truck prints on its own page. Select a view below to preview on screen."
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
          {truckSheets.map((sheet) => {
            const { truck: t, rounds } = sheet;
            return (
              <div key={t.id} className="load-sheet">
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 16,
                    borderBottom: "2px solid #111",
                    paddingBottom: 10,
                    marginBottom: 18,
                  }}
                >
                  <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
                    Truck Load Sheet
                  </h1>
                  <div style={{ fontSize: 12, color: "#444" }}>SpareLube Load Master</div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "14px 28px",
                    marginBottom: 20,
                  }}
                >
                  <MetaField label="Date" value={plan.date} />
                  <MetaField label="Truck" value={t.name} />
                  <MetaField label="Trip" value={dayTripName.get(t.id) || "—"} />
                  <MetaField label="Driver" blank />
                  <MetaField label="Petty cash" blank />
                  <MetaField
                    label="Rounds"
                    value={rounds.length > 1 ? "1 + 2" : "1"}
                  />
                </div>

                {rounds.map((r) => {
                  const wt = r.list.reduce((s, i) => s + i.weight, 0);
                  return (
                    <div key={r.round} style={{ marginBottom: r.round === 1 && rounds.length > 1 ? 28 : 0 }}>
                      {rounds.length > 1 && (
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            marginBottom: 8,
                            color: "#333",
                          }}
                        >
                          Round {r.round}
                        </div>
                      )}
                      <LoadStopsTable
                        stops={r.stops}
                        customers={customers}
                        totalWeight={wt}
                      />
                    </div>
                  );
                })}

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.4fr 1fr",
                    gap: 32,
                    marginTop: 28,
                    fontSize: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "#555",
                        marginBottom: 4,
                      }}
                    >
                      Loader signature
                    </div>
                    <div style={{ borderBottom: "1px solid #222", minHeight: 22 }} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "#555",
                        marginBottom: 4,
                      }}
                    >
                      Time departed
                    </div>
                    <div style={{ borderBottom: "1px solid #222", minHeight: 22 }} />
                  </div>
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
