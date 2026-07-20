import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import { areaColor } from "@/lib/colors";

export function SetupScreen() {
  const plan = useStore((s) => s.plans[s.currentDate]);
  const trucks = useStore((s) => s.trucks);
  const areaHistory = useStore((s) => s.areaHistory);
  const setDate = useStore((s) => s.setDate);
  const addArea = useStore((s) => s.addArea);
  const removeArea = useStore((s) => s.removeArea);
  const setTruckDayArea = useStore((s) => s.setTruckDayArea);
  const updateTruck = useStore((s) => s.updateTruck);
  const addTruck = useStore((s) => s.addTruck);
  const deleteTruck = useStore((s) => s.deleteTruck);
  const setStep = useStore((s) => s.setStep);
  const ensureTruckDay = useStore((s) => s.ensureTruckDay);

  const [newArea, setNewArea] = useState("");
  const [showAddTruck, setShowAddTruck] = useState(false);
  const [truckForm, setTruckForm] = useState({ name: "", maxWeight: 3000 });

  const areas = plan?.areas ?? [];
  const truckDayMap = new Map((plan?.truckDay ?? []).map((td) => [td.truckId, td.area]));
  const activeTrucks = trucks.filter((t) => t.active);
  const missingArea = activeTrucks.filter((t) => !truckDayMap.get(t.id));
  const canContinue = activeTrucks.length > 0 && missingArea.length === 0;

  const suggestions = areaHistory.filter((a) => !areas.includes(a));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <section className="panel p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Today's Delivery Areas</h2>
            <label className="text-xs text-muted-foreground flex items-center gap-2">
              Plan date
              <input
                type="date"
                value={plan?.date ?? ""}
                onChange={(e) => setDate(e.target.value)}
                className="bg-panel-2 border border-border rounded px-2 py-1 text-foreground"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {areas.map((a) => {
              const c = areaColor(a);
              return (
                <span
                  key={a}
                  className="chip"
                  style={{ background: c.bg, borderColor: c.border, color: c.text }}
                >
                  {a}
                  <button
                    onClick={() => removeArea(a)}
                    className="ml-1 text-xs opacity-70 hover:opacity-100"
                    aria-label={`Remove ${a}`}
                  >
                    ×
                  </button>
                </span>
              );
            })}
            {areas.length === 0 && (
              <span className="text-sm text-muted-foreground">No areas yet.</span>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addArea(newArea);
              setNewArea("");
            }}
            className="flex gap-2"
          >
            <input
              value={newArea}
              onChange={(e) => setNewArea(e.target.value)}
              placeholder="Add area (e.g. Alberton)"
              className="flex-1 bg-panel-2 border border-border rounded px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
            />
            <button className="px-4 py-2 rounded bg-primary text-primary-foreground font-medium">
              + Add Area
            </button>
          </form>
          {suggestions.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-muted-foreground mb-1">Previously used:</div>
              <div className="flex flex-wrap gap-1">
                {suggestions.map((a) => (
                  <button
                    key={a}
                    onClick={() => addArea(a)}
                    className="chip hover:border-primary/70"
                  >
                    + {a}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="panel p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Trucks</h2>
            <button
              onClick={() => setShowAddTruck((v) => !v)}
              className="text-sm px-3 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80"
            >
              {showAddTruck ? "Cancel" : "+ Add Truck"}
            </button>
          </div>
          {showAddTruck && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!truckForm.name) return;
                addTruck({
                  name: truckForm.name,
                  maxWeight: Number(truckForm.maxWeight) || 0,
                  active: true,
                });
                setTruckForm({ name: "", maxWeight: 3000 });
                setShowAddTruck(false);
                setTimeout(ensureTruckDay, 0);
              }}
              className="flex gap-2 mb-3"
            >
              <input
                autoFocus
                value={truckForm.name}
                onChange={(e) => setTruckForm({ ...truckForm, name: e.target.value })}
                placeholder="Truck name"
                className="flex-1 bg-panel-2 border border-border rounded px-3 py-2"
              />
              <input
                type="number"
                value={truckForm.maxWeight}
                onChange={(e) =>
                  setTruckForm({ ...truckForm, maxWeight: Number(e.target.value) })
                }
                placeholder="Max kg"
                className="w-32 bg-panel-2 border border-border rounded px-3 py-2"
              />
              <button className="px-4 py-2 rounded bg-primary text-primary-foreground">
                Save
              </button>
            </form>
          )}
          <div className="overflow-hidden rounded border border-border">
            <table className="w-full text-sm">
              <thead className="bg-panel-2 text-muted-foreground text-left">
                <tr>
                  <th className="p-2 w-16">Active</th>
                  <th className="p-2">Truck</th>
                  <th className="p-2 w-28">Max kg</th>
                  <th className="p-2 w-64">Today's Area</th>
                  <th className="p-2 w-32">Status</th>
                  <th className="p-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {trucks.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-muted-foreground">
                      No trucks yet. Add one above.
                    </td>
                  </tr>
                )}
                {trucks.map((t) => {
                  const dayArea = truckDayMap.get(t.id) ?? "";
                  const inactive = !t.active;
                  return (
                    <tr
                      key={t.id}
                      className={`border-t border-border ${inactive ? "opacity-50" : ""}`}
                    >
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={t.active}
                          onChange={(e) => updateTruck(t.id, { active: e.target.checked })}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={t.name}
                          onChange={(e) => updateTruck(t.id, { name: e.target.value })}
                          className="bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-1 py-0.5 w-full"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          value={t.maxWeight}
                          onChange={(e) =>
                            updateTruck(t.id, { maxWeight: Number(e.target.value) })
                          }
                          className="bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-1 py-0.5 w-24"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          disabled={inactive}
                          value={dayArea}
                          onChange={(e) => setTruckDayArea(t.id, e.target.value)}
                          className="bg-panel-2 border border-border rounded px-2 py-1 w-full disabled:opacity-40"
                        >
                          <option value="">— Select —</option>
                          {areas.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        {inactive ? (
                          <span className="chip" style={{ color: "var(--muted-foreground)" }}>
                            Off Duty
                          </span>
                        ) : dayArea ? (
                          <span
                            className="chip"
                            style={{ color: "var(--good)", borderColor: "var(--good)" }}
                          >
                            Ready
                          </span>
                        ) : (
                          <span
                            className="chip"
                            style={{ color: "var(--warn)", borderColor: "var(--warn)" }}
                          >
                            Needs area
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <button
                          onClick={() => {
                            if (confirm(`Delete truck ${t.name}?`)) deleteTruck(t.id);
                          }}
                          className="text-xs text-muted-foreground hover:text-destructive"
                          aria-label="Delete truck"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <aside className="panel p-5 h-fit sticky top-4">
        <h3 className="font-semibold mb-2">Ready to continue?</h3>
        <ul className="text-sm space-y-1 mb-4">
          <li>Areas defined: <b>{areas.length}</b></li>
          <li>Active trucks: <b>{activeTrucks.length}</b></li>
          <li>Trucks missing area: <b>{missingArea.length}</b></li>
        </ul>
        {activeTrucks.length === 0 && (
          <p className="text-crit text-sm mb-3">At least one truck must be active.</p>
        )}
        {missingArea.length > 0 && (
          <p className="text-warn text-sm mb-3">
            Assign an area to every active truck before continuing.
          </p>
        )}
        <button
          disabled={!canContinue}
          onClick={() => setStep("import")}
          className="w-full py-3 rounded bg-primary text-primary-foreground font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue to Import →
        </button>
      </aside>
    </div>
  );
}
