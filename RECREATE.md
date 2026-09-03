# SpareLube Load Master — Recreate Guide

This document is a product + engineering brief to rebuild **SpareLube Load Master** from scratch. It describes what the app does, how it is structured, and the rules that must not be lost.

---

## 1. What this app is

A **daily delivery load planner** for a warehouse floor:

1. Choose tomorrow’s **trips** (named runs with ordered towns).
2. Enter / import **invoices** (doc #, customer, town, weight).
3. **Allocate** invoices to **trucks** by town and capacity.
4. **Adjust** loads (move, reorder stops, Round 2).
5. **Lock** the day after reconciling with the system export.
6. **Print** truck load sheets and a master report.

Master data (customers, towns, trips, load numbers, trucks) lives in an **Admin** console. The warehouse can share one Supabase project; the app also works **offline-first** with IndexedDB.

**Brand:** SpareLube — primary red (`#942e3c` / `#c8102e`), light-first UI, Geist Variable fonts, glass/panel surfaces, metric mono for docs/weights.

---

## 2. Stack to recreate

| Layer | Choice |
|-------|--------|
| Runtime | Node ≥ 20 |
| App | TanStack Start + React 19 + Vite |
| Routing | TanStack Router file routes (`src/routes/`) |
| UI | Tailwind CSS v4, shadcn/Radix primitives, Lucide icons |
| DnD | `@dnd-kit/core` + sortable |
| Motion | Framer Motion (respect reduced motion) |
| State | Zustand (`src/lib/store.ts`) |
| Local persist | IndexedDB via `idb-keyval` |
| Cloud | Supabase (shared anon warehouse — no end-user auth) |
| Excel | `xlsx` |
| Toasts | Sonner |
| Admin gate | Server session cookie + `ADMIN_PASSWORD` |
| Manifest unlock | Client `adminPin` stored in warehouse settings |

---

## 3. Routes & shells

| Route | Purpose |
|-------|---------|
| `/` | Planner (6 steps) |
| `/admin-unlock` | Enter server admin password → cookie session |
| `/admin` | Admin console (redirect if locked) |

**Planner chrome**

- Top bar: date, sync status, search, theme, undo
- Stepper: Setup → Enter Invoices → Trucks & Allocation → Adjust → Lock → Print
- Optional Planning Assistant side panel
- Resume modal if an unfinished plan exists for the date
- Read-only when `plan.locked` (except Lock/Print unlock flows)

---

## 4. Domain model (must match)

Canonical types live in `src/lib/types.ts`.

### Truck

- `id`, `name`, `maxWeight`, `active`

### CustomerMemory

Stored as `Record<key, CustomerMemory>` where **key = customer code if present, else name**.

- `code`, `name`, `defaultArea`, `loadingNumber` (0 = unset), `firstSeen`, `collection?`

### Invoice (on a day plan)

- `id`, `doc`, `customer`, `weight` (0 = unset; negatives for credits), `area`
- `source`: `SYSTEM` | `ADHOC`
- `truckId`: string | null
- `round`: 1 | 2
- Flags: `exception?`, `collection?`, `creditNote?`, `comment?`

### HeldInvoice (cross-day warehouse pool)

Same core fields as invoice, plus:

- `heldAt`
- `reason`: `town_not_on_trips` | `manual` | `collection` | `credit_note`

### Trip

- `id`, `name`
- `towns[]` — ordered town names from catalog
- `stopOrder: Record<customerKey, number>` — **trip-specific** load # overrides

### TruckDay (per truck on a plan day)

- `truckId`
- `tripIds[]` (preferred; legacy `tripId` / `areas[]` still normalize)
- `round2TripId?` — which trip Round 2 is for

### Plan (keyed by `YYYY-MM-DD`)

- `date`, `areas[]` (towns derived from selected trips), `tripIds[]`
- `truckDay[]`, `invoices[]`
- `dayStopOrder`: tripId → customerKey → load # (**day-only**; does not mutate Admin trips)
- `dayStopSequence`: tripId → ordered customer keys (**day-only drag order**; does **not** renumber Load #)
- `locked`, `createdAt`, `step`

### AuditEntry

- `id`, `ts`, `type`, `message`, `payload?`

### Warehouse snapshot

Everything synced: trucks, trips, customers, areaHistory, heldInvoices, plans, audit, currentDate, adminPin.

---

## 5. Planner steps — recreate feature-by-feature

### Step 1 — Daily Setup (`SetupScreen`)

- Choose plan date (default tomorrow).
- Multi-select **today’s trips** → derive `plan.areas` from trip towns.
- Open / switch saved plans.

### Step 2 — Enter Invoices (`ImportScreen`)

**Manual add form:** Doc, Customer (search/create), Town, Weight. Buttons: Add / Hold for later / Collection / Credit note.

**Do not** put Comment on the add form. After Excel import, comments belong on **rows** in:

- Today’s invoices
- Collections
- Held for later
- Credit notes

**Excel import:** Invoice Number + Customer Code + Customer Name. Weight is **not** in the sheet — users enter it in the app. Rows without a customer code are skipped. Duplicate docs (plan + held) are skipped. Resolve customer by **code**; create if missing. If town is not on today’s trips and customer is not a collection customer → hold with `town_not_on_trips`.

**Lists sort by document number** (numeric-aware: 2 before 10, including prefixes).

**Sections**

1. Held for later — pick today / exception / edit weight-town-comment / remove  
2. Collections — handling: customer collects vs load on truck  
3. Credit notes — negative / credit until loaded on a truck  
4. Today’s invoices — weights, towns, comments, hold / collection / credit actions  

Confirm import learns empty customer default towns from invoice areas.

### Step 3 — Trucks & Allocation (`AllocateScreen` mode=`allocate`)

- Activate trucks; assign one or more of today’s trips to each truck.
- Show weight-by-town / by-trip summaries.
- **Run Allocation** (`allocation.ts`):
  - Clear all `truckId`, reset `round` to 1
  - Skip collections and credit notes
  - Group by area; sort by load-number rules
  - Assign to an active truck that covers the town and has capacity; prefer lowest utilization
  - Else leave unallocated

### Step 4 — Adjust (`AllocateScreen` mode=`adjust`)

- Move / bulk-move invoices between trucks (capacity preview, undo).
- Drag rows to reorder stops → write **`dayStopSequence` only** (Load # values stay as typed).
- Optional day-only Load # edits → `dayStopOrder`.
- Send selection / overflow to Round 2 (`round: 2`, `round2TripId`).
- Comments editable on rows.

### Step 5 — Lock (`LockScreen`)

- Day stats: allocated / unallocated / util / collections.
- Import system Excel and compare doc numbers to everything entered today (plan + held + collections).
- Matched / missed / extra; optionally add missed docs as unallocated.
- Lock plan. Unlock requires `adminPin` (blank PIN = no gate). Locked plans are read-only on earlier steps.

### Step 6 — Print (`PrintScreen`)

- Truck sheets (Round 1 and Round 2 separate) and master report.
- Group invoices into customer stops; preserve load order via `compareByLoadingNumber`.
- Include comments on print sheets.
- `@media print` hides app chrome; print via `window.print()`.

---

## 6. Admin console — recreate tabs

Gate: `/admin-unlock` with `ADMIN_PASSWORD` → signed cookie (`ADMIN_SESSION_SECRET`, ~12h). Separate from manifest PIN.

| Tab | Behavior |
|-----|----------|
| **Customers** | Excel import (code + name); assign towns; collection flag; town load #; **edit** name/code/town/load/collection; delete. Remap trip stopOrder / day overrides / invoice customer labels when identity changes. |
| **Towns** | Catalog CRUD + Excel import. Deleting a town unassigns customers. |
| **Trips** | Create/edit trip name + ordered towns; Excel import. Per-trip customer list with Load #. **Drag a customer onto another to copy that load #** — do **not** auto-renumber the rest; duplicates stay until fixed manually. Edit customer from here too. |
| **Load #** | Bulk town load numbers (same store fields as Customers). |
| **Trucks** | Name, max weight, active, delete. |
| **Audit** | Action trail (open triggers optional prune). |
| **Plans** | Open date, unlock locked plan, delete day. |
| **Settings** | Manifest unlock PIN only. |
| **Export** | Download warehouse JSON snapshot. |

---

## 7. Load-number & sorting rules (critical)

Resolution order for a stop (`loadingOrder.ts`):

1. If `plan.dayStopSequence[tripId]` exists → use drag sequence index  
2. Else `plan.dayStopOrder[tripId][customerKey]`  
3. Else `trip.stopOrder[customerKey]`  
4. Else customer `loadingNumber` when `defaultArea` matches the invoice town  

**Hard rules**

- Setting a Load # only updates that customer — **never** cascade-renumber others.
- Duplicate load numbers are allowed; the UI may warn (“Shared #”) but the user fixes manually.
- Admin trip reorder via up/down that rewrites 1…n is wrong for this product; prefer set-one / drag-to-copy.
- Day Adjust drag must update `dayStopSequence`, not rewrite Admin `stopOrder`.

Town customer lists sort by load # ascending (unset last), then name.

Invoice lists on Import sort by **doc number** with `localeCompare(..., { numeric: true })`.

---

## 8. Persistence & sync

### Local

Debounced write of warehouse slices to IndexedDB (`lp:trucks`, `lp:trips`, `lp:customers`, `lp:areaHistory`, `lp:heldInvoices`, `lp:plans`, `lp:audit`, `lp:currentDate`, `lp:adminPin`, dirty metadata).

### Cloud (optional)

If `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set:

- Dirty-flag sync of changed slices (and explicit deletes)
- Hydrate on start; **do not** overwrite dirty local data
- Flush on hide / beforeunload; warn if dirty
- Status chip: saved | saving | offline | error | local

Apply SQL migrations in order under `supabase/migrations/`:

1. `001_load_planner.sql`  
2. `002_trips.sql`  
3. `003_held_invoices.sql`  
4. `004_trip_stop_order.sql`  
5. `005_perf_indexes.sql`  
6. `006_manual_entry.sql`  
7. `007_day_stop_order.sql`  
8. `008_day_stop_sequence.sql`  
9. `009_sync_perf.sql`  

RLS: shared read/write for anon (warehouse-shared model).

Without Supabase env → local-only mode still works.

---

## 9. Excel templates

Implement downloadable templates (`excelTemplates.ts`) and fuzzy-header parsers (`parse.ts`):

| File | Columns | Used for |
|------|---------|----------|
| `invoice-import-template.xlsx` | Invoice Number, Customer Code, Customer Name | Import + Lock compare |
| `customer-import-template.xlsx` | Customer Code, Customer Name | Admin customers |
| `area-import-template.xlsx` | Town | Admin towns |
| `trip-import-template.xlsx` | Trip, Town (optional; multi-row) | Admin trips |

---

## 10. Environment

```bash
# .env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=   # ≥ 32 chars
```

```bash
npm install
# apply supabase migrations if using cloud
npm run dev
```

Assets: logo / favicon under `public/` (e.g. `sparelube-logo.png`).

---

## 11. Suggested folder layout

```
src/
  routes/                 # index, admin, admin-unlock, __root
  components/
    planner/              # Planner + all step screens + admin panels
    planner/ui/           # ScreenShell, EmptyState, FormField, StickyStepBar…
    ui/                   # shadcn primitives
  lib/
    types.ts
    store.ts
    cloudSync.ts
    db.ts
    supabase.ts
    allocation.ts
    loadingOrder.ts
    trips.ts
    customers.ts
    parse.ts
    excelTemplates.ts
    adminGate.functions.ts
    theme.ts
    colors.ts
    searchNavigation.ts
    utils.ts              # cn + compareDocNumbers
  hooks/
  styles.css
supabase/migrations/
```

---

## 12. Rebuild order (vertical slices)

1. **Types + Zustand + IDB snapshot** — hydrate, mutate, debounce persist.  
2. **Admin master data** — towns → customers (edit) → trip load #s (no auto-renumber) → trucks.  
3. **Setup** — date + trip selection → derived towns.  
4. **Import** — manual + Excel + held/collections/credits + row comments + doc sort.  
5. **Allocate** — truck↔trip pairing + `allocate()`.  
6. **Adjust** — moves, day sequence DnD, day load overrides, Round 2.  
7. **Lock + PIN + Print**.  
8. **Supabase dirty sync + admin session gate**.  
9. **Assistant / search / sync chip / undo / theme polish**.

---

## 13. Acceptance checklist

- [ ] Six planner steps with locked read-only behavior  
- [ ] Excel invoice import creates/holds correctly; weights entered in UI  
- [ ] Comments on invoice rows (not only on the add form)  
- [ ] Collections / held / today’s invoices sorted by doc number  
- [ ] Allocation skips collections & credit notes; respects capacity  
- [ ] Day drag order does not change typed Load #  
- [ ] Trip admin can set duplicate load numbers without auto-fix  
- [ ] Drag customer onto another trip stop copies that load # only  
- [ ] Admin can edit customer name/code/town/load/collection  
- [ ] Lock reconcile + unlock PIN; print sheets show stops + comments  
- [ ] Works offline; syncs when Supabase configured  

---

## 14. Reference implementation map

If you have this repo, start here:

| Concern | Path |
|---------|------|
| Domain | `src/lib/types.ts` |
| Mutations | `src/lib/store.ts` |
| Sync | `src/lib/cloudSync.ts` |
| Allocation | `src/lib/allocation.ts` |
| Load order | `src/lib/loadingOrder.ts` |
| Trips helpers | `src/lib/trips.ts` |
| Customer keys | `src/lib/customers.ts` |
| Excel | `src/lib/parse.ts`, `src/lib/excelTemplates.ts` |
| Planner shell | `src/components/planner/Planner.tsx` |
| Screens | `SetupScreen`, `ImportScreen`, `AllocateScreen`, `LockScreen`, `PrintScreen` |
| Admin | `src/routes/admin.tsx`, `TripsAdminPanel.tsx`, `CustomerAreaBoard.tsx` |

This file is enough to recreate the product’s behavior and shape; copy UX polish and edge-case handling from those modules when implementing details.
