import { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Download, FileSpreadsheet, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { areaColor } from "@/lib/colors";
import { customerKey } from "@/lib/customers";
import { customersForTrip, loadingNumberFor } from "@/lib/loadingOrder";
import { parseTripExcelFile } from "@/lib/parse";
import { downloadTripTemplate } from "@/lib/excelTemplates";
import type { CustomerMemory, Trip } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/planner/ui/EmptyState";
import { FormField } from "@/components/planner/ui/FormField";
import { AdminSearchInput, matchesQuery } from "@/components/planner/AdminSearchInput";
import { usePagination } from "@/hooks/use-pagination";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { TownCombobox } from "@/components/planner/TownCombobox";
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

export function TripsAdminPanel({ townOptions }: { townOptions: string[] }) {
  const trips = useStore((s) => s.trips);
  const customers = useStore((s) => s.customers);
  const addTrip = useStore((s) => s.addTrip);
  const updateTrip = useStore((s) => s.updateTrip);
  const deleteTrip = useStore((s) => s.deleteTrip);
  const importTrips = useStore((s) => s.importTrips);
  const setTripCustomerLoadNumber = useStore((s) => s.setTripCustomerLoadNumber);
  const reorderTripCustomers = useStore((s) => s.reorderTripCustomers);

  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftTowns, setDraftTowns] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [newTowns, setNewTowns] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const filteredTrips = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trips;
    return trips.filter(
      (t) =>
        matchesQuery(t.name, q) ||
        t.towns.some((town) => matchesQuery(town, q)),
    );
  }, [trips, search]);

  const tripsPagination = usePagination(filteredTrips, 30);

  function startEdit(trip: Trip) {
    setEditingId(trip.id);
    setDraftName(trip.name);
    setDraftTowns([...trip.towns]);
    setExpandedId(trip.id);
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
            Import trip names from Excel, then add towns and set load order for customers on this
            trip. Same customer can have a different load # on each trip.
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
            <>
            <ul className="space-y-3">
              {tripsPagination.slice.map((trip) => {
                const editing = editingId === trip.id;
                const expanded = expandedId === trip.id || editing;
                const tripCustomers = customersForTrip(customers, trip);
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
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() =>
                            setExpandedId((id) => (id === trip.id ? null : trip.id))
                          }
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium tracking-tight">{trip.name}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {tripCustomers.length} customers
                            </Badge>
                            <ChevronDown
                              className={`size-4 text-muted-foreground transition-transform ${
                                expanded ? "" : "-rotate-90"
                              }`}
                            />
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {trip.towns.length === 0 ? (
                              <span className="text-xs text-warn">
                                No towns yet — click Edit to add
                              </span>
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
                        </button>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => startEdit(trip)}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => setDeleteTarget({ id: trip.id, name: trip.name })}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {expanded && !editing && (
                      <TripStopOrderEditor
                        trip={trip}
                        list={tripCustomers}
                        customers={customers}
                        onSetLoad={(key, n) => setTripCustomerLoadNumber(trip.id, key, n)}
                        onReorder={(keys) => reorderTripCustomers(trip.id, keys)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
            {tripsPagination.totalPages > 1 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>
                  {(tripsPagination.page - 1) * tripsPagination.pageSize + 1}–
                  {Math.min(
                    tripsPagination.page * tripsPagination.pageSize,
                    tripsPagination.totalItems,
                  )}{" "}
                  of {tripsPagination.totalItems}
                </span>
                <Pagination className="mx-0 w-auto">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          tripsPagination.prevPage();
                        }}
                        className={
                          tripsPagination.page <= 1 ? "pointer-events-none opacity-50" : undefined
                        }
                      />
                    </PaginationItem>
                    <PaginationItem>
                      <span className="px-2">
                        Page {tripsPagination.page} of {tripsPagination.totalPages}
                      </span>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          tripsPagination.nextPage();
                        }}
                        className={
                          tripsPagination.page >= tripsPagination.totalPages
                            ? "pointer-events-none opacity-50"
                            : undefined
                        }
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
            </>
          )}
        </>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="panel border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete trip {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the trip from the catalog. Plans that reference it may need updating.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deleteTrip(deleteTarget.id);
                  toast.success("Trip deleted");
                  setDeleteTarget(null);
                }
              }}
            >
              Delete trip
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TripStopOrderEditor({
  trip,
  list,
  customers,
  onSetLoad,
  onReorder,
}: {
  trip: Trip;
  list: CustomerMemory[];
  customers: Record<string, CustomerMemory>;
  onSetLoad: (customerKey: string, n: number) => void;
  onReorder: (orderedKeys: string[]) => void;
}) {
  const [showAllCustomers, setShowAllCustomers] = useState(false);

  if (trip.towns.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        Add towns to this trip to see customers and set load order.
      </p>
    );
  }

  if (list.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        No customers assigned to towns on this trip yet. Assign towns on the Customers tab.
      </p>
    );
  }

  const keys = list.map((c) => customerKey(c));
  const visibleList = showAllCustomers ? list : list.slice(0, 50);
  const hiddenCount = list.length - visibleList.length;

  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= keys.length) return;
    const next = [...keys];
    [next[index], next[j]] = [next[j], next[index]];
    onReorder(next);
  }

  return (
    <div className="mt-4 space-y-2 border-t border-border pt-3">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Load order for this trip
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {visibleList.map((c, i) => {
          const key = customerKey(c);
          const globalIndex = showAllCustomers ? i : keys.indexOf(key);
          const tripLoad = loadingNumberFor(customers, c.name, c.defaultArea, trip.id, [trip]);
          const hasOverride = (trip.stopOrder?.[key] ?? 0) > 0;
          return (
            <li key={key} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="w-5 metric-mono text-muted-foreground">{globalIndex + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{c.name}</div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{c.defaultArea}</span>
                  {c.code ? <span className="metric-mono">{c.code}</span> : null}
                  {!hasOverride && c.loadingNumber > 0 ? (
                    <span>Town default #{c.loadingNumber}</span>
                  ) : null}
                </div>
              </div>
              <FormField label="Load #" className="w-20 gap-0.5">
                <Input
                  type="number"
                  min={0}
                  value={tripLoad > 0 ? tripLoad : ""}
                  placeholder="—"
                  className="metric-mono h-8"
                  onChange={(e) => {
                    const v = e.target.value === "" ? 0 : Number(e.target.value);
                    onSetLoad(key, v);
                  }}
                />
              </FormField>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={globalIndex === 0}
                onClick={() => move(globalIndex, -1)}
                aria-label="Move up"
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={globalIndex === list.length - 1}
                onClick={() => move(globalIndex, 1)}
                aria-label="Move down"
              >
                <ChevronDown className="size-4" />
              </Button>
            </li>
          );
        })}
      </ul>
      {!showAllCustomers && hiddenCount > 0 && (
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowAllCustomers(true)}>
          Show {hiddenCount} more customers
        </Button>
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
