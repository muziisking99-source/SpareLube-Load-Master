import { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Download, FileSpreadsheet, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { areaColor } from "@/lib/colors";
import { parseTripExcelFile } from "@/lib/parse";
import { downloadTripTemplate } from "@/lib/excelTemplates";
import type { Trip } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/planner/ui/EmptyState";
import { FormField } from "@/components/planner/ui/FormField";
import { AdminSearchInput, matchesQuery } from "@/components/planner/AdminSearchInput";
import { TownCombobox } from "@/components/planner/TownCombobox";

export function TripsAdminPanel({ townOptions }: { townOptions: string[] }) {
  const trips = useStore((s) => s.trips);
  const addTrip = useStore((s) => s.addTrip);
  const updateTrip = useStore((s) => s.updateTrip);
  const deleteTrip = useStore((s) => s.deleteTrip);
  const importTrips = useStore((s) => s.importTrips);

  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftTowns, setDraftTowns] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [newTowns, setNewTowns] = useState<string[]>([]);

  const filteredTrips = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trips;
    return trips.filter(
      (t) =>
        matchesQuery(t.name, q) ||
        t.towns.some((town) => matchesQuery(town, q)),
    );
  }, [trips, search]);

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

  async function handleExcel(file: File) {
    setImporting(true);
    try {
      const rows = await parseTripExcelFile(file);
      if (rows.length === 0) {
        toast.error("No trips found in the file");
        return;
      }
      const { added, skipped, updated } = importTrips(rows);
      toast.success(
        `Trips: ${added} added` +
          (updated ? `, ${updated} updated` : "") +
          (skipped ? `, ${skipped} skipped` : ""),
      );
    } catch {
      toast.error("Could not read that Excel file");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="panel p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold tracking-tight">Trips</h3>
          <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
            Import trip names from Excel, then add towns with Edit. Or create a trip below.
            Assign one trip per truck on Daily Setup.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleExcel(f);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              downloadTripTemplate();
              toast.success("Trip template downloaded");
            }}
          >
            <Download className="size-4" />
            Download template
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={importing}
            onClick={() => fileRef.current?.click()}
          >
            {importing ? (
              <Upload className="size-4 animate-pulse" />
            ) : (
              <FileSpreadsheet className="size-4" />
            )}
            Import Excel
          </Button>
          <Badge variant="outline">{trips.length} trips</Badge>
        </div>
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
          addTrip(name, newTowns);
          setNewName("");
          setNewTowns([]);
          toast.success(
            newTowns.length
              ? `Trip "${name}" created`
              : `Trip "${name}" created — add towns with Edit`,
          );
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
          description="Download the template, import trip names, then Edit each trip to add towns."
        />
      ) : (
        <>
          <AdminSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search trips by name or town…"
          />
          {filteredTrips.length === 0 ? (
            <EmptyState
              title="No matching trips"
              description={`Nothing matched “${search.trim()}”.`}
            />
          ) : (
        <ul className="space-y-3">
          {filteredTrips.map((trip) => {
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
                          <span className="text-xs text-warn">No towns yet — click Edit to add</span>
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
        </>
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
        <p className="text-sm text-muted-foreground">Optional — add towns now or after import.</p>
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
        <TownCombobox
          value=""
          options={available}
          placeholder="Add town…"
          searchPlaceholder="Search towns…"
          emptyLabel="No matching town."
          onChange={(town) => {
            if (town) onAdd(town);
          }}
          buttonClassName="h-9 w-full max-w-sm"
        />
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
