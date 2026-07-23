import { useState } from "react";
import { ArrowLeft, ArrowRight, Lock, TriangleAlert, Unlock } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { areaColor } from "@/lib/colors";
import { townsForTruckDay, tripById } from "@/lib/trips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatTile } from "./ui/StatTile";
import { FormField } from "./ui/FormField";

export function LockScreen() {
  const plan = useStore((s) => s.plans[s.currentDate])!;
  const trucks = useStore((s) => s.trucks);
  const trips = useStore((s) => s.trips);
  const lockPlan = useStore((s) => s.lockPlan);
  const unlockPlan = useStore((s) => s.unlockPlan);
  const setStep = useStore((s) => s.setStep);
  const checkPin = useStore((s) => s.checkPin);

  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");

  const active = trucks.filter((t) => t.active);
  const dayTowns = new Map(
    plan.truckDay.map((td) => [td.truckId, townsForTruckDay(td, trips)]),
  );
  const dayTripName = new Map(
    plan.truckDay.map((td) => {
      const trip = tripById(trips, td.tripId);
      return [td.truckId, trip?.name ?? null] as const;
    }),
  );
  const allocated = plan.invoices.filter((i) => i.truckId);
  const unallocated = plan.invoices.filter((i) => !i.truckId);
  const totalWeight = plan.invoices.reduce((s, i) => s + i.weight, 0);
  const cap = active.reduce((s, t) => s + t.maxWeight, 0);
  const util = cap ? (allocated.reduce((s, i) => s + i.weight, 0) / cap) * 100 : 0;

  function doLock() {
    lockPlan();
    setShowLockConfirm(false);
    toast.success("Manifests locked");
  }

  function doUnlock() {
    if (checkPin(pin)) {
      unlockPlan();
      setShowUnlock(false);
      setPin("");
      setPinError("");
      toast.success("Plan unlocked");
    } else {
      setPinError("Incorrect PIN");
      toast.error("Incorrect PIN");
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-5">
        <StatTile label="Total Invoices" value={plan.invoices.length} />
        <StatTile label="Allocated" value={allocated.length} tone="good" />
        <StatTile
          label="Unallocated"
          value={unallocated.length}
          tone={unallocated.length ? "crit" : "muted"}
        />
        <StatTile label="Total Weight" value={`${totalWeight.toFixed(0)} kg`} />
        <StatTile label="Fleet Utilisation" value={`${util.toFixed(0)}%`} />
      </div>

      {unallocated.length > 0 && (
        <div className="panel flex items-center gap-2 border-crit/40 bg-crit/5 p-4 text-sm text-crit">
          <TriangleAlert className="size-4 shrink-0" />
          {unallocated.length} invoice(s) are not yet on a truck.
        </div>
      )}

      <section className="panel p-4">
        <h3 className="mb-3 font-semibold tracking-tight">Truck Summary</h3>
        <div className="overflow-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Truck</TableHead>
                <TableHead>Trip</TableHead>
                <TableHead>Invoices</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.map((t, idx) => {
                const list = plan.invoices.filter((i) => i.truckId === t.id);
                const r1 = list.filter((i) => (i.round ?? 1) === 1);
                const r2 = list.filter((i) => (i.round ?? 1) === 2);
                const wt = r1.reduce((s, i) => s + i.weight, 0);
                const pct = (wt / t.maxWeight) * 100;
                const status =
                  pct >= 95 ? "text-crit" : pct >= 80 ? "text-warn" : "text-good";
                const areas = dayTowns.get(t.id) ?? [];
                const tripName = dayTripName.get(t.id);
                return (
                  <TableRow
                    key={t.id}
                    style={{ "--index": idx } as React.CSSProperties}
                    className="stagger-item"
                  >
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {tripName && (
                          <div className="text-sm font-medium">{tripName}</div>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {areas.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            areas.map((area) => {
                              const c = areaColor(area);
                              return (
                                <span
                                  key={area}
                                  className="chip"
                                  style={{ borderColor: c.border, color: c.text, background: c.bg }}
                                >
                                  {area}
                                </span>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="metric-mono">
                      {list.length}
                      {r2.length > 0 ? ` (R2: ${r2.length})` : ""}
                    </TableCell>
                    <TableCell className="metric-mono">
                      {wt.toFixed(0)} / {t.maxWeight}
                    </TableCell>
                    <TableCell className="metric-mono">{pct.toFixed(0)}%</TableCell>
                    <TableCell className={`font-medium ${status}`}>
                      {pct >= 95 ? "Overfilling" : pct >= 80 ? "Near max" : "OK"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <div className="panel flex flex-wrap items-center gap-3 p-4">
        <Button variant="outline" onClick={() => setStep("adjust")}>
          <ArrowLeft className="size-4" />
          Back to Adjust
        </Button>
        {!plan.locked ? (
          <Button className="ml-auto" onClick={() => setShowLockConfirm(true)}>
            <Lock className="size-4" />
            Lock Manifests
          </Button>
        ) : (
          <>
            <Badge variant="good" className="ml-auto gap-1">
              <Lock className="size-3" />
              Locked
            </Badge>
            <Button variant="outline" onClick={() => setShowUnlock(true)}>
              <Unlock className="size-4" />
              Admin Unlock
            </Button>
            <Button onClick={() => setStep("print")}>
              Print / Export
              <ArrowRight className="size-4" />
            </Button>
          </>
        )}
      </div>

      <AlertDialog open={showLockConfirm} onOpenChange={setShowLockConfirm}>
        <AlertDialogContent className="panel border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Lock manifests?</AlertDialogTitle>
            <AlertDialogDescription>
              {unallocated.length > 0
                ? `${unallocated.length} invoices are still unallocated. Locking will prevent further edits without admin unlock.`
                : "No further edits will be allowed without admin unlock."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doLock}>Lock manifests</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showUnlock} onOpenChange={(o) => { setShowUnlock(o); if (!o) { setPin(""); setPinError(""); } }}>
        <DialogContent className="panel max-w-sm border-border">
          <DialogHeader>
            <DialogTitle>Admin unlock</DialogTitle>
          </DialogHeader>
          <FormField label="Admin PIN" error={pinError}>
            <Input
              type="password"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setPinError(""); }}
              autoFocus
            />
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUnlock(false)}>Cancel</Button>
            <Button onClick={doUnlock}>Unlock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
