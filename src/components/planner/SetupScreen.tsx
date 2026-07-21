import { useState } from "react";
import { ArrowRight, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { areaColor } from "@/lib/colors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { EmptyState } from "./ui/EmptyState";
import { FormField } from "./ui/FormField";

export function SetupScreen() {
  const plan = useStore((s) => s.plans[s.currentDate]);
  const trucks = useStore((s) => s.trucks);
  const areaHistory = useStore((s) => s.areaHistory);
  const setDate = useStore((s) => s.setDate);
  const addArea = useStore((s) => s.addArea);
  const removeArea = useStore((s) => s.removeArea);
  const setTruckDayAreas = useStore((s) => s.setTruckDayAreas);
  const updateTruck = useStore((s) => s.updateTruck);
  const addTruck = useStore((s) => s.addTruck);
  const deleteTruck = useStore((s) => s.deleteTruck);
  const setStep = useStore((s) => s.setStep);
  const ensureTruckDay = useStore((s) => s.ensureTruckDay);

  const [newArea, setNewArea] = useState("");
  const [showAddTruck, setShowAddTruck] = useState(false);
  const [truckForm, setTruckForm] = useState({ name: "", maxWeight: 3000 });
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const areas = plan?.areas ?? [];
  const truckDayMap = new Map(
    (plan?.truckDay ?? []).map((td) => [td.truckId, td.areas ?? []] as const),
  );
  const activeTrucks = trucks.filter((t) => t.active);
  const missingArea = activeTrucks.filter((t) => (truckDayMap.get(t.id) ?? []).length === 0);
  const canContinue = activeTrucks.length > 0 && missingArea.length === 0;
  const suggestions = areaHistory.filter((a) => !areas.includes(a));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <section className="panel p-5">
          <ScreenHeader
            title="Today's Delivery Areas"
            description="Define the delivery zones active for this plan date."
            action={
              <FormField label="Plan date" className="gap-1">
                <Input
                  type="date"
                  value={plan?.date ?? ""}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-8 w-auto"
                />
              </FormField>
            }
            className="mb-4"
          />

          {areas.length === 0 ? (
            <div className="mb-3">
              <EmptyState
                title="No areas yet"
                description="Add delivery areas below or pick from previously used zones."
              />
            </div>
          ) : (
            <ul className="mb-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
              {areas.map((a) => {
                const c = areaColor(a);
                return (
                  <li
                    key={a}
                    className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-panel-2/60"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: c.border }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: c.text }}>
                      {a}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeArea(a)}
                      aria-label={`Remove ${a}`}
                    >
                      <X className="size-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              addArea(newArea);
              setNewArea("");
            }}
            className="flex gap-2"
          >
            <Input
              value={newArea}
              onChange={(e) => setNewArea(e.target.value)}
              placeholder="Add area (e.g. Alberton)"
              className="flex-1"
            />
            <Button type="submit">
              <Plus className="size-4" />
              Add Area
            </Button>
          </form>

          {suggestions.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-xs text-muted-foreground">Previously used</div>
              <div className="flex flex-wrap gap-1">
                {suggestions.map((a) => (
                  <Button key={a} type="button" variant="outline" size="sm" onClick={() => addArea(a)}>
                    + {a}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="panel p-5">
          <ScreenHeader
            title="Trucks"
            description="Assign each active truck to a delivery area for today."
            action={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowAddTruck((v) => !v)}
              >
                {showAddTruck ? "Cancel" : "Add Truck"}
              </Button>
            }
            className="mb-4"
          />

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
                toast.success(`Truck "${truckForm.name}" added`);
              }}
              className="mb-4 flex flex-wrap gap-2"
            >
              <Input
                autoFocus
                value={truckForm.name}
                onChange={(e) => setTruckForm({ ...truckForm, name: e.target.value })}
                placeholder="Truck name"
                className="min-w-[140px] flex-1"
              />
              <Input
                type="number"
                value={truckForm.maxWeight}
                onChange={(e) =>
                  setTruckForm({ ...truckForm, maxWeight: Number(e.target.value) })
                }
                placeholder="Max kg"
                className="w-32"
              />
              <Button type="submit">Save</Button>
            </form>
          )}

          <div className="overflow-hidden rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-panel-2 hover:bg-panel-2">
                  <TableHead className="w-16">Active</TableHead>
                  <TableHead>Truck</TableHead>
                  <TableHead className="w-28">Max kg</TableHead>
                  <TableHead className="min-w-[220px]">Today's Areas</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {trucks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <EmptyState title="No trucks yet" description="Add a truck using the button above." />
                    </TableCell>
                  </TableRow>
                )}
                {trucks.map((t, idx) => {
                  const dayAreas = truckDayMap.get(t.id) ?? [];
                  const inactive = !t.active;
                  return (
                    <TableRow
                      key={t.id}
                      style={{ "--index": idx } as React.CSSProperties}
                      className={`stagger-item ${inactive ? "opacity-50" : ""}`}
                    >
                      <TableCell>
                        <Checkbox
                          checked={t.active}
                          onCheckedChange={(v) => updateTruck(t.id, { active: !!v })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={t.name}
                          onChange={(e) => updateTruck(t.id, { name: e.target.value })}
                          className="h-8 border-transparent bg-transparent hover:border-border focus:border-ring"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={t.maxWeight}
                          onChange={(e) =>
                            updateTruck(t.id, { maxWeight: Number(e.target.value) })
                          }
                          className="h-8 w-24 border-transparent bg-transparent hover:border-border focus:border-ring metric-mono"
                        />
                      </TableCell>
                      <TableCell>
                        {areas.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Add areas first</span>
                        ) : (
                          <div className="flex flex-wrap gap-2 py-1">
                            {areas.map((a) => {
                              const checked = dayAreas.includes(a);
                              return (
                                <label
                                  key={a}
                                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${
                                    checked
                                      ? "border-primary/50 bg-primary/10 text-primary"
                                      : "border-border text-muted-foreground"
                                  } ${inactive ? "pointer-events-none opacity-40" : "cursor-pointer"}`}
                                >
                                  <Checkbox
                                    disabled={inactive}
                                    checked={checked}
                                    onCheckedChange={(v) => {
                                      const next = v
                                        ? [...dayAreas, a]
                                        : dayAreas.filter((x) => x !== a);
                                      setTruckDayAreas(t.id, next);
                                    }}
                                  />
                                  {a}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {inactive ? (
                          <Badge variant="outline">Off Duty</Badge>
                        ) : dayAreas.length > 0 ? (
                          <Badge variant="good">Ready</Badge>
                        ) : (
                          <Badge variant="warn">Needs area</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget({ id: t.id, name: t.name })}
                          aria-label="Delete truck"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>

      <aside className="panel sticky top-20 h-fit p-5">
        <h3 className="font-semibold tracking-tight">Ready to continue?</h3>
        <ul className="mb-4 mt-3 space-y-2 text-sm">
          <li className="flex justify-between">
            <span className="text-muted-foreground">Areas defined</span>
            <span className="metric-mono font-medium">{areas.length}</span>
          </li>
          <li className="flex justify-between">
            <span className="text-muted-foreground">Active trucks</span>
            <span className="metric-mono font-medium">{activeTrucks.length}</span>
          </li>
          <li className="flex justify-between">
            <span className="text-muted-foreground">Missing area</span>
            <span className={`metric-mono font-medium ${missingArea.length ? "text-warn" : ""}`}>
              {missingArea.length}
            </span>
          </li>
        </ul>
        {activeTrucks.length === 0 && (
          <p className="mb-3 text-sm text-crit">At least one truck must be active.</p>
        )}
        {missingArea.length > 0 && (
          <p className="mb-3 text-sm text-warn">
            Assign an area to every active truck before continuing.
          </p>
        )}
        <Button disabled={!canContinue} className="w-full" size="lg" onClick={() => setStep("import")}>
          Continue to Import
          <ArrowRight className="size-4" />
        </Button>
      </aside>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="panel border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete truck?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{deleteTarget?.name}</strong> from the fleet. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deleteTruck(deleteTarget.id);
                  toast.success(`Truck "${deleteTarget.name}" removed`);
                  setDeleteTarget(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
