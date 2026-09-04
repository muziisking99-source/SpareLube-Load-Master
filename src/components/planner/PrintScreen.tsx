import { useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { useStore } from "@/lib/store";
import { compareByLoadingNumber, loadingNumberFor } from "@/lib/loadingOrder";
import {
  tripById,
  tripIdForInvoice,
  tripIdsForTruckDay,
  tripNamesForTruckDay,
} from "@/lib/trips";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { ScreenHeader } from "./ui/ScreenHeader";
import { ScreenShell } from "./ui/ScreenShell";

import type { Invoice } from "@/lib/types";

/** One stop on a truck sheet: same customer combined (count + total weight). */
type LoadStop = {
  key: string;
  customer: string;
  area: string;
  count: number;
  weight: number;
  hasCredit: boolean;
  comment: string;
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
        hasCredit: false,
        comment: "",
      };
      map.set(key, stop);
      order.push(key);
    }
    stop.count += 1;
    stop.weight += inv.weight || 0;
    if (inv.creditNote || inv.weight < 0) stop.hasCredit = true;
    const note = (inv.comment ?? "").trim();
    if (note && !stop.comment.split(" · ").includes(note)) {
      stop.comment = stop.comment ? `${stop.comment} · ${note}` : note;
    }
  }
  return order.map((k) => map.get(k)!);
}

function TickCell() {
  return (
    <td style={{ textAlign: "center", verticalAlign: "middle" }}>
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 11,
          height: 11,
          border: "1.25px solid #333",
          verticalAlign: "middle",
        }}
      />
    </td>
  );
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
          fontSize: 8,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "#555",
          marginBottom: 1,
          lineHeight: 1.2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: blank ? 400 : 600,
          borderBottom: "1px solid #222",
          minHeight: 16,
          paddingBottom: 1,
          lineHeight: 1.2,
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
  tripId,
  trips,
  dayStopOrder,
  truckDay,
}: {
  stops: LoadStop[];
  customers: Record<string, import("@/lib/types").CustomerMemory>;
  totalWeight: number;
  tripId?: string | null;
  trips?: import("@/lib/types").Trip[];
  dayStopOrder?: Record<string, Record<string, number>>;
  truckDay?: import("@/lib/types").TruckDay;
}) {
  const invoiceCount = stops.reduce((n, s) => n + s.count, 0);
  return (
    <table style={{ marginTop: 0, width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ width: 44 }}>Load #</th>
          <th>Customer</th>
          <th style={{ width: 110 }}>Comment</th>
          <th style={{ width: 80 }}>Town</th>
          <th style={{ width: 72, textAlign: "right" }}>Weight (kg)</th>
          <th style={{ width: 36, textAlign: "center" }}>Cash</th>
          <th style={{ width: 36, textAlign: "center" }}>EFT</th>
        </tr>
      </thead>
      <tbody>
        {stops.map((stop) => {
          const stopTripId = truckDay
            ? tripIdForInvoice({ area: stop.area }, truckDay, trips ?? [])
            : tripId;
          const loadNo = loadingNumberFor(
            customers,
            stop.customer,
            stop.area,
            stopTripId,
            trips,
            dayStopOrder,
          );
          return (
            <tr key={stop.key}>
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {loadNo > 0 ? loadNo : ""}
              </td>
              <td>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span>{stop.customer}</span>
                  {stop.count > 1 && (
                    <span
                      className="inv-count-chip"
                      style={{
                        display: "inline-block",
                        padding: "0 5px",
                        borderRadius: 999,
                        fontSize: 9,
                        fontWeight: 700,
                        lineHeight: 1.3,
                        background: "#efefef",
                        border: "1px solid #bbb",
                      }}
                      title={`${stop.count} invoices`}
                    >
                      {stop.count}
                    </span>
                  )}
                  {stop.hasCredit && (
                    <span
                      className="inv-credit-chip"
                      style={{
                        display: "inline-block",
                        padding: "0 5px",
                        borderRadius: 999,
                        fontSize: 9,
                        fontWeight: 700,
                        lineHeight: 1.3,
                        background: "#fff4e5",
                        border: "1px solid #d4a574",
                      }}
                      title="Includes credit note"
                    >
                      CR
                    </span>
                  )}
                </span>
              </td>
              <td style={{ fontSize: 10, color: "#333" }}>{stop.comment || ""}</td>
              <td>{stop.area}</td>
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {stop.weight}
              </td>
              <TickCell />
              <TickCell />
            </tr>
          );
        })}
        {stops.length === 0 && (
          <tr>
            <td colSpan={7} style={{ textAlign: "center", color: "#666" }}>
              No invoices
            </td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={4} style={{ fontWeight: 700 }}>
            Total — {invoiceCount} invoice{invoiceCount === 1 ? "" : "s"}
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
          <td />
        </tr>
      </tfoot>
    </table>
  );
}

type TruckSheetData = {
  truck: { id: string; name: string };
  truckDay: import("@/lib/types").TruckDay | undefined;
  rounds: Array<{
    round: 1 | 2;
    list: Invoice[];
    stops: LoadStop[];
    tripId: string | null;
  }>;
};

function TruckSheetsContent({
  planDate,
  truckSheets,
  customers,
  trips,
  dayStopOrder,
}: {
  planDate: string;
  truckSheets: TruckSheetData[];
  customers: Record<string, import("@/lib/types").CustomerMemory>;
  trips: import("@/lib/types").Trip[];
  dayStopOrder: import("@/lib/types").Plan["dayStopOrder"];
}) {
  return (
    <>
      {truckSheets.flatMap((sheet) => {
        const { truck: t, truckDay, rounds } = sheet;
        return rounds.map((r) => {
          const sheetTripId =
            r.tripId ??
            (truckDay
              ? tripIdForInvoice({ area: r.list[0]?.area ?? "" }, truckDay, trips) ??
                tripIdsForTruckDay(truckDay)[0] ??
                null
              : null);
          const tripLabel =
            r.round === 2 && r.tripId
              ? tripById(trips, r.tripId)?.name ||
                tripNamesForTruckDay(truckDay, trips) ||
                "—"
              : tripNamesForTruckDay(truckDay, trips) || "—";
          const wt = r.list.reduce((s, i) => s + i.weight, 0);
          return (
            <div key={`${t.id}-r${r.round}`} className="load-sheet">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  borderBottom: "1.5px solid #111",
                  paddingBottom: 4,
                  marginBottom: 8,
                }}
              >
                <div>
                  <h1
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      margin: 0,
                      letterSpacing: "-0.02em",
                      lineHeight: 1.2,
                    }}
                  >
                    Truck Load Sheet
                    {r.round === 2 ? " — Round 2" : ""}
                  </h1>
                  <div style={{ fontSize: 9, color: "#444", lineHeight: 1.2 }}>
                    SpareLube Load Master
                  </div>
                </div>
                <Logo variant="light" className="load-sheet-logo" />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "6px 16px",
                  marginBottom: 8,
                }}
              >
                <MetaField label="Date" value={planDate} />
                <MetaField label="Truck" value={t.name} />
                <MetaField label="Trip" value={tripLabel} />
                <MetaField label="Driver" blank />
                <MetaField label="Petty cash" blank />
                <MetaField label="Round" value={String(r.round)} />
              </div>

              <LoadStopsTable
                stops={r.stops}
                customers={customers}
                totalWeight={wt}
                tripId={sheetTripId}
                trips={trips}
                dayStopOrder={dayStopOrder}
                truckDay={truckDay}
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 1.4fr 1fr 1fr",
                  gap: 16,
                  marginTop: 10,
                  fontSize: 11,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 8,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      color: "#555",
                      marginBottom: 1,
                    }}
                  >
                    Loader name
                  </div>
                  <div style={{ borderBottom: "1px solid #222", minHeight: 14 }} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 8,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      color: "#555",
                      marginBottom: 1,
                    }}
                  >
                    Loader signature
                  </div>
                  <div style={{ borderBottom: "1px solid #222", minHeight: 14 }} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 8,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      color: "#555",
                      marginBottom: 1,
                    }}
                  >
                    Time departed
                  </div>
                  <div style={{ borderBottom: "1px solid #222", minHeight: 14 }} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 8,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      color: "#555",
                      marginBottom: 1,
                    }}
                  >
                    Time arrived
                  </div>
                  <div style={{ borderBottom: "1px solid #222", minHeight: 14 }} />
                </div>
              </div>
            </div>
          );
        });
      })}
    </>
  );
}

function MasterReportContent({
  planDate,
  invoices,
  trucks,
  trips,
  customers,
  dayStopOrder,
  truckDayById,
  sortInvoices,
}: {
  planDate: string;
  invoices: Invoice[];
  trucks: { id: string; name: string }[];
  trips: import("@/lib/types").Trip[];
  customers: Record<string, import("@/lib/types").CustomerMemory>;
  dayStopOrder: import("@/lib/types").Plan["dayStopOrder"];
  truckDayById: Map<string, import("@/lib/types").TruckDay>;
  sortInvoices: (list: Invoice[]) => Invoice[];
}) {
  return (
    <div style={{ padding: "24px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, margin: "0 0 6px" }}>Master Reconciliation</h1>
          <div style={{ fontSize: 13 }}>
            Date: <b>{planDate}</b>
          </div>
        </div>
        <Logo variant="light" className="load-sheet-logo" />
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
          {sortInvoices(invoices).map((i) => {
            const truckDay = i.truckId ? truckDayById.get(i.truckId) : undefined;
            const invTripId = truckDay ? tripIdForInvoice(i, truckDay, trips) : null;
            const loadNo = loadingNumberFor(
              customers,
              i.customer,
              i.area,
              invTripId,
              trips,
              dayStopOrder,
            );
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
  );
}

export function PrintScreen() {
  const plan = useStore((s) => s.plans[s.currentDate])!;
  const trucks = useStore((s) => s.trucks);
  const trips = useStore((s) => s.trips);
  const setStep = useStore((s) => s.setStep);
  const [view, setView] = useState<"truck" | "master">("truck");

  const active = trucks.filter((t) => t.active);
  const customers = useStore((s) => s.customers);
  const truckDayById = new Map(plan.truckDay.map((td) => [td.truckId, td] as const));

  function print(v: "truck" | "master") {
    setView(v);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  }

  /** Truck sheets: load # lowest → highest; invoices without a load # last. */
  function sortInvoices(
    list: typeof plan.invoices,
    truckDay?: (typeof plan.truckDay)[number],
    fixedTripId?: string | null,
  ) {
    return [...list].sort((a, b) => {
      const tripA =
        fixedTripId ??
        (truckDay ? tripIdForInvoice(a, truckDay, trips) : null);
      const tripB =
        fixedTripId ??
        (truckDay ? tripIdForInvoice(b, truckDay, trips) : null);
      return compareByLoadingNumber(
        customers,
        a,
        b,
        tripA,
        trips,
        plan.dayStopOrder,
        plan.dayStopSequence,
      );
    });
  }

  /** One page per truck round. Round 2 (if any) prints on its own page. */
  const truckSheets = active.map((t) => {
    const truckDay = truckDayById.get(t.id);
    const onTruck = plan.invoices.filter((i) => i.truckId === t.id);
    const r1 = sortInvoices(
      onTruck.filter((i) => (i.round ?? 1) === 1),
      truckDay,
    );
    const r2TripId = truckDay?.round2TripId ?? null;
    const r2 = sortInvoices(
      onTruck.filter((i) => (i.round ?? 1) === 2),
      truckDay,
      r2TripId,
    );
    return {
      truck: t,
      truckDay,
      rounds: [
        { round: 1 as const, list: r1, stops: groupStopsForLoadSheet(r1), tripId: null as string | null },
        ...(r2.length > 0
          ? [
              {
                round: 2 as const,
                list: r2,
                stops: groupStopsForLoadSheet(r2),
                tripId: r2TripId,
              },
            ]
          : []),
      ],
    };
  });

  return (
    <>
      <ScreenShell className="space-y-4">
      <div className="glass-panel flex flex-col gap-3 p-4 no-print sm:flex-row sm:flex-wrap sm:items-center">
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => setStep("lock")}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button
            variant={view === "truck" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("truck")}
          >
            Truck sheets
          </Button>
          <Button
            variant={view === "master" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("master")}
          >
            Master report
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => print(view)}>
            <Printer className="size-4" />
            Print {view === "truck" ? "truck sheets" : "master report"}
          </Button>
        </div>
      </div>

      <div className="glass-panel p-4 no-print">
        <ScreenHeader
          title="Print preview"
          description="Each truck round prints on its own page. Round 2 sheets follow Round 1. Preview updates as you switch views above."
          className="mb-3"
        />
        <div className="overflow-auto rounded-xl border border-border bg-panel-2 p-4">
          <div className="load-sheet-document mx-auto max-w-4xl bg-white text-black shadow-lg">
            {view === "truck" && (
              <TruckSheetsContent
                planDate={plan.date}
                truckSheets={truckSheets}
                customers={customers}
                trips={trips}
                dayStopOrder={plan.dayStopOrder}
              />
            )}
            {view === "master" && (
              <MasterReportContent
                planDate={plan.date}
                invoices={plan.invoices}
                trucks={trucks}
                trips={trips}
                customers={customers}
                dayStopOrder={plan.dayStopOrder}
                truckDayById={truckDayById}
                sortInvoices={(list) => sortInvoices(list)}
              />
            )}
          </div>
        </div>
      </div>
      </ScreenShell>

      {/* Must sit outside any .no-print ancestor — parent display:none hides all descendants */}
      <div className="print-root load-sheet-document">
        {view === "truck" && (
          <TruckSheetsContent
            planDate={plan.date}
            truckSheets={truckSheets}
            customers={customers}
            trips={trips}
            dayStopOrder={plan.dayStopOrder}
          />
        )}
        {view === "master" && (
          <MasterReportContent
            planDate={plan.date}
            invoices={plan.invoices}
            trucks={trucks}
            trips={trips}
            customers={customers}
            dayStopOrder={plan.dayStopOrder}
            truckDayById={truckDayById}
            sortInvoices={(list) => sortInvoices(list)}
          />
        )}
      </div>
    </>
  );
}
