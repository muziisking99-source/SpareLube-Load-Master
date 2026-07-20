import { useStore } from "@/lib/store";
import { areaColor } from "@/lib/colors";

export function LockScreen() {
  const plan = useStore((s) => s.plans[s.currentDate])!;
  const trucks = useStore((s) => s.trucks);
  const lockPlan = useStore((s) => s.lockPlan);
  const unlockPlan = useStore((s) => s.unlockPlan);
  const setStep = useStore((s) => s.setStep);
  const checkPin = useStore((s) => s.checkPin);

  const active = trucks.filter((t) => t.active);
  const dayArea = new Map(plan.truckDay.map((td) => [td.truckId, td.area]));
  const allocated = plan.invoices.filter((i) => i.truckId);
  const unallocated = plan.invoices.filter((i) => !i.truckId);
  const totalWeight = plan.invoices.reduce((s, i) => s + i.weight, 0);
  const cap = active.reduce((s, t) => s + t.maxWeight, 0);
  const util = cap ? (allocated.reduce((s, i) => s + i.weight, 0) / cap) * 100 : 0;

  function confirmLock() {
    if (unallocated.length > 0) {
      if (
        !confirm(
          `${unallocated.length} invoices are unallocated. Lock anyway?`,
        )
      )
        return;
    } else if (!confirm("Lock manifests? No further edits without admin unlock.")) return;
    lockPlan();
  }

  function doUnlock() {
    const pin = prompt("Admin PIN to unlock:") ?? "";
    if (checkPin(pin)) unlockPlan();
    else alert("Incorrect PIN.");
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-5">
        <StatCard label="Total Invoices" value={plan.invoices.length} />
        <StatCard label="Allocated" value={allocated.length} tone="good" />
        <StatCard
          label="Unallocated"
          value={unallocated.length}
          tone={unallocated.length ? "crit" : "muted"}
        />
        <StatCard label="Total Weight" value={`${totalWeight.toFixed(0)} kg`} />
        <StatCard label="Fleet Utilisation" value={`${util.toFixed(0)}%`} />
      </div>

      {unallocated.length > 0 && (
        <div
          className="panel p-4"
          style={{ borderColor: "var(--crit)", background: "color-mix(in oklab, var(--crit) 10%, transparent)" }}
        >
          ⚠ {unallocated.length} invoice(s) are not yet on a truck.
        </div>
      )}

      <section className="panel p-4">
        <h3 className="font-semibold mb-3">Truck Summary</h3>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left">
              <tr>
                <th className="p-2">Truck</th>
                <th className="p-2">Area</th>
                <th className="p-2">Invoices</th>
                <th className="p-2">Weight</th>
                <th className="p-2">Capacity</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {active.map((t) => {
                const list = plan.invoices.filter((i) => i.truckId === t.id);
                const wt = list.reduce((s, i) => s + i.weight, 0);
                const pct = (wt / t.maxWeight) * 100;
                const status =
                  pct >= 95 ? "text-crit" : pct >= 80 ? "text-warn" : "text-good";
                const area = dayArea.get(t.id) ?? "—";
                const c = areaColor(area);
                return (
                  <tr key={t.id} className="border-t border-border">
                    <td className="p-2 font-medium">{t.name}</td>
                    <td className="p-2">
                      <span
                        className="chip"
                        style={{ borderColor: c.border, color: c.text, background: c.bg }}
                      >
                        {area}
                      </span>
                    </td>
                    <td className="p-2 font-mono">{list.length}</td>
                    <td className="p-2 font-mono">
                      {wt.toFixed(0)} / {t.maxWeight}
                    </td>
                    <td className="p-2 font-mono">{pct.toFixed(0)}%</td>
                    <td className={`p-2 font-semibold ${status}`}>
                      {pct >= 95 ? "Overfilling" : pct >= 80 ? "Near max" : "OK"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="panel p-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setStep("adjust")}
          className="px-4 py-2 rounded border border-border hover:bg-panel-2"
        >
          ← Back to Adjust
        </button>
        {!plan.locked ? (
          <button
            onClick={confirmLock}
            className="ml-auto px-6 py-2 rounded bg-primary text-primary-foreground font-semibold"
          >
            🔒 Lock Manifests
          </button>
        ) : (
          <>
            <span
              className="chip ml-auto"
              style={{ color: "var(--good)", borderColor: "var(--good)" }}
            >
              LOCKED
            </span>
            <button
              onClick={doUnlock}
              className="px-4 py-2 rounded border border-border hover:bg-panel-2"
            >
              Admin Unlock
            </button>
            <button
              onClick={() => setStep("print")}
              className="px-4 py-2 rounded bg-primary text-primary-foreground font-semibold"
            >
              Print / Export →
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "good" | "warn" | "crit" | "muted";
}) {
  const color =
    tone === "good"
      ? "text-good"
      : tone === "warn"
        ? "text-warn"
        : tone === "crit"
          ? "text-crit"
          : "";
  return (
    <div className="panel p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-mono ${color}`}>{value}</div>
    </div>
  );
}
