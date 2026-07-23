import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { areaColor } from "@/lib/colors";
import type { Trip } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/planner/ui/EmptyState";
import { FormField } from "@/components/planner/ui/FormField";

export function TripsAdminPanel({ townOptions }: { townOptions: string[] }) {
  const trips = useStore((s) => s.trips);
  const addTrip = useStore((s) => s.addTrip);
  const updateTrip = useStore((s) => s.updateTrip);
  const deleteTrip = useStore((s) => s.deleteTrip);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftTowns, setDraftTowns] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [newTowns, setNewTowns] = useState<string[]>([]);

  function startEdit(trip: Trip) {
    setEditingId(trip.id);
    setDraftName(trip.name);
    setDraftTowns([...trip.towns]);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraftName("");
    setDraftTowns([]);
  }

  function saveEdit() {
    if (!editingId) return;
    const name = draftName.trim();
    if (!name) {
      toast.error("Trip name is required");
      return;
    }
    updateTrip(editingId, { name, towns: draftTowns });
    toast.success("Trip updated");
    cancelEdit();
  }

  function moveTown(list: string[], index: number, dir: -1 | 1): string[] {
    const j = index + dir;
    if (j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[index], next[j]] = [next[j], next[index]];
    return next;
  }

  function addTownTo(list: string[], town: string, setList: (v: string[]) => void) {
    if (!town || list.includes(town)) return;
    setList([...list, town]);
  }

  return (
    <div className="panel p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold tracking-tight">Trips</h3>
          <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
            Named multi-town runs. Assign one trip per truck on Daily Setup. Town order is the
            route sequence.
          </p>
        </div>
        <Badge variant="outline">{trips.length} trips</Badge>
      </div>

      <form
        className="mb-6 space-y-3 rounded-xl border border-border bg-panel-2/40 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim();
          if (!name) {
            toast.error("Enter a trip name");
            return;
          }
          if (newTowns.length === 0) {
            toast.error("Add at least one town");
            return;
          }
          addTrip(name, newTowns);
          setNewName("");
          setNewTowns([]);
          toast.success(`Trip "${name}" created`);
        }}
      >
        <FormField label="New trip name">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. North run"
            className="max-w-sm"
          />
        </FormField>
        <TownPicker
          towns={newTowns}
          options={townOptions}
          onAdd={(t) => addTownTo(newTowns, t, setNewTowns)}
          onRemove={(t) => setNewTowns(newTowns.filter((x) => x !== t))}
          onMove={(i, d) => setNewTowns(moveTown(newTowns, i, d))}
        />
        <Button type="submit" size="sm" variant="secondary">
          <Plus className="size-4" />
          Create trip
        </Button>
      </form>

      {trips.length === 0 ? (
        <EmptyState
          title="No trips yet"
          description="Create a trip with ordered towns, then assign it to trucks on Daily Setup."
        />
      ) : (
        <ul className="space-y-3">
          {trips.map((trip) => {
            const editing = editingId === trip.id;
            return (
              <li
                key={trip.id}
                className="rounded-xl border border-border px-4 py-3 transition-colors hover:bg-panel-2/40"
              >
                {editing ? (
                  <div className="space-y-3">
                    <FormField label="Trip name">
                      <Input
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        className="max-w-sm"
                      />
                    </FormField>
                    <TownPicker
                      towns={draftTowns}
                      options={townOptions}
                      onAdd={(t) => addTownTo(draftTowns, t, setDraftTowns)}
                      onRemove={(t) => setDraftTowns(draftTowns.filter((x) => x !== t))}
                      onMove={(i, d) => setDraftTowns(moveTown(draftTowns, i, d))}
                    />
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={saveEdit}>
                        Save
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={cancelEdit}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium tracking-tight">{trip.name}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {trip.towns.length === 0 ? (
                          <span className="text-xs text-muted-foreground">No towns</span>
                        ) : (
                          trip.towns.map((town, i) => {
                            const c = areaColor(town);
                            return (
                              <span
                                key={`${town}-${i}`}
                                className="chip text-xs"
                                style={{
                                  borderColor: c.border,
                                  color: c.text,
                                  background: c.bg,
                                }}
                              >
                                {i + 1}. {town}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button type="button" size="sm" variant="outline" onClick={() => startEdit(trip)}>
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => {
                          if (!confirm(`Delete trip "${trip.name}"?`)) return;
                          deleteTrip(trip.id);
                          toast.success("Trip deleted");
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TownPicker({
  towns,
  options,
  onAdd,
  onRemove,
  onMove,
}: {
  towns: string[];
  options: string[];
  onAdd: (town: string) => void;
  onRemove: (town: string) => void;
  onMove: (index: number, dir: -1 | 1) => void;
}) {
  const available = options.filter((t) => !towns.includes(t));
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">Towns (in order)</div>
      {towns.length === 0 ? (
        <p className="text-sm text-muted-foreground">No towns selected yet.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {towns.map((town, i) => (
            <li key={`${town}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="w-5 metric-mono text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{town}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={i === 0}
                onClick={() => onMove(i, -1)}
                aria-label="Move up"
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={i === towns.length - 1}
                onClick={() => onMove(i, 1)}
                aria-label="Move down"
              >
                <ChevronDown className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-destructive"
                onClick={() => onRemove(town)}
                aria-label={`Remove ${town}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {available.length > 0 ? (
        <select
          className="h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm"
          value=""
          onChange={(e) => {
            if (e.target.value) onAdd(e.target.value);
          }}
        >
          <option value="">Add town…</option>
          {available.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-xs text-muted-foreground">
          {options.length === 0
            ? "Add towns in the Towns tab first."
            : "All catalog towns are already on this trip."}
        </p>
      )}
    </div>
  );
}
