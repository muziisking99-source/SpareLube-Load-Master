import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Load Planner" },
      { name: "description", content: "Load Planner admin console." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const hydrated = useStore((s) => s.hydrated);
  const hydrate = useStore((s) => s.hydrate);
  const adminPin = useStore((s) => s.adminPin);
  const setPin = useStore((s) => s.setPin);
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPinInput] = useState("");

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!hydrated) return <div className="p-8 text-muted-foreground">Loading…</div>;

  if (adminPin && !unlocked) {
    return (
      <div className="min-h-screen grid place-items-center p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pin === adminPin) setUnlocked(true);
            else alert("Incorrect PIN");
          }}
          className="panel p-6 w-full max-w-sm space-y-3"
        >
          <h1 className="text-lg font-semibold">Admin PIN</h1>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPinInput(e.target.value)}
            className="w-full bg-panel-2 border border-border rounded px-3 py-2"
            autoFocus
          />
          <button className="w-full py-2 rounded bg-primary text-primary-foreground font-semibold">
            Unlock
          </button>
          <Link to="/" className="block text-center text-xs text-muted-foreground">
            ← Back to planner
          </Link>
        </form>
      </div>
    );
  }

  return <AdminConsole onSetPin={setPin} currentPin={adminPin} />;
}

function AdminConsole({
  onSetPin,
  currentPin,
}: {
  onSetPin: (p: string) => void;
  currentPin: string;
}) {
  const customers = useStore((s) => s.customers);
  const trucks = useStore((s) => s.trucks);
  const audit = useStore((s) => s.audit);
  const plans = useStore((s) => s.plans);
  const exportJSON = useStore((s) => s.exportJSON);
  const deleteDay = useStore((s) => s.deleteDay);
  const unlockPlan = useStore((s) => s.unlockPlan);
  const setDate = useStore((s) => s.setDate);
  const addTruck = useStore((s) => s.addTruck);
  const updateTruck = useStore((s) => s.updateTruck);
  const deleteTruck = useStore((s) => s.deleteTruck);
  const [tab, setTab] = useState<"customers" | "trucks" | "audit" | "plans" | "settings">(
    "customers",
  );

  function download() {
    const data = exportJSON();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `loadplanner-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-4">
          <Link to="/" className="font-semibold">
            ← Load Planner
          </Link>
          <div className="text-muted-foreground text-sm">Admin</div>
          <button
            onClick={download}
            className="ml-auto px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm"
          >
            Export All (JSON)
          </button>
        </div>
      </header>
      <nav className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 flex gap-1">
          {(["customers", "trucks", "audit", "plans", "settings"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm border-b-2 capitalize ${
                tab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-6xl p-4">
        {tab === "customers" && (
          <div className="panel p-4">
            <div className="text-sm text-muted-foreground mb-2">
              {Object.keys(customers).length} customers remembered
            </div>
            <div className="overflow-auto max-h-[70vh]">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="p-2">Customer</th>
                    <th className="p-2">Default Area</th>
                    <th className="p-2">First Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(customers).map((c) => (
                    <tr key={c.name} className="border-t border-border">
                      <td className="p-2">{c.name}</td>
                      <td className="p-2">{c.defaultArea}</td>
                      <td className="p-2 text-muted-foreground">
                        {c.firstSeen.slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "trucks" && (
          <div className="panel p-4">
            <div className="flex justify-between mb-3">
              <div className="text-sm text-muted-foreground">
                {trucks.length} trucks
              </div>
              <button
                onClick={() => addTruck({ name: "New Truck", maxWeight: 3000, active: true })}
                className="text-sm px-3 py-1 rounded bg-secondary text-secondary-foreground"
              >
                + Add Truck
              </button>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="p-2">Active</th>
                  <th className="p-2">Name</th>
                  <th className="p-2">Max Weight</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {trucks.map((t) => (
                  <tr key={t.id} className="border-t border-border">
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
                        className="bg-panel-2 border border-border rounded px-2 py-1"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={t.maxWeight}
                        onChange={(e) =>
                          updateTruck(t.id, { maxWeight: Number(e.target.value) })
                        }
                        className="bg-panel-2 border border-border rounded px-2 py-1 w-28"
                      />
                    </td>
                    <td className="p-2 text-right">
                      <button
                        onClick={() => confirm(`Delete ${t.name}?`) && deleteTruck(t.id)}
                        className="text-muted-foreground hover:text-destructive text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "audit" && (
          <div className="panel p-4">
            <div className="overflow-auto max-h-[70vh]">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="p-2">Time</th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((a) => (
                    <tr key={a.id} className="border-t border-border">
                      <td className="p-2 font-mono text-xs">
                        {new Date(a.ts).toLocaleString()}
                      </td>
                      <td className="p-2 font-mono text-xs">{a.type}</td>
                      <td className="p-2">{a.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "plans" && (
          <div className="panel p-4">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="p-2">Date</th>
                  <th className="p-2">Invoices</th>
                  <th className="p-2">Locked</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {Object.values(plans)
                  .sort((a, b) => (a.date < b.date ? 1 : -1))
                  .map((p) => (
                    <tr key={p.date} className="border-t border-border">
                      <td className="p-2 font-mono">{p.date}</td>
                      <td className="p-2">{p.invoices.length}</td>
                      <td className="p-2">
                        {p.locked ? (
                          <span className="chip" style={{ color: "var(--good)" }}>
                            Locked
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-2 text-right space-x-2">
                        <button
                          onClick={() => setDate(p.date)}
                          className="text-primary text-xs"
                        >
                          Open
                        </button>
                        {p.locked && (
                          <button
                            onClick={() => {
                              setDate(p.date);
                              unlockPlan();
                            }}
                            className="text-xs text-warn"
                          >
                            Unlock
                          </button>
                        )}
                        <button
                          onClick={() => confirm(`Delete plan ${p.date}?`) && deleteDay(p.date)}
                          className="text-xs text-destructive"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "settings" && (
          <div className="panel p-4 max-w-md space-y-3">
            <h3 className="font-semibold">Admin PIN</h3>
            <p className="text-sm text-muted-foreground">
              {currentPin ? "PIN is set." : "No PIN set — admin is open."}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                onSetPin(String(fd.get("pin") ?? ""));
                (e.currentTarget as HTMLFormElement).reset();
                alert("Updated.");
              }}
              className="flex gap-2"
            >
              <input
                name="pin"
                type="password"
                placeholder="New PIN (blank to clear)"
                className="flex-1 bg-panel-2 border border-border rounded px-3 py-2"
              />
              <button className="px-4 py-2 rounded bg-primary text-primary-foreground">
                Save
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
