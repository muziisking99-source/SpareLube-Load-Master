# Load Planner

A fast, keyboard-first offline web app for planning next-day deliveries. Dark theme, all data in IndexedDB (via `idb-keyval`), no backend.

## Tech
- TanStack Start (existing), React, Tailwind v4 dark tokens matching the spec (bg `#0f172a`, panels `#1e293b`, accent cyan `#38bdf8`, green/yellow/red status).
- `idb-keyval` for persistence; Zustand store hydrated from IDB with autosave on every mutation.
- Vanilla `window.print()` with print-only CSS for load sheets & master report.

## Routes (single-app shell with step navigation)
```
/                → redirects to /plan
/plan            → shell with Planning Assistant side panel + step router
   step=setup    → Screen 1 Daily Setup (areas + active trucks + today's area per truck)
   step=import   → Screen 2 Import & Area Assignment (paste + adhoc + weights)
   step=allocate → Screen 3 Auto Allocation (truck cards, area summary)
   step=adjust   → Screen 4 Manual Adjustment (move dialog, bulk, undo, audit)
   step=lock     → Screen 5 Reconciliation & Lock
   step=print    → Screen 6 Print / Export
/admin           → Customer memory, trucks, audit trail, export JSON, delete/unlock day
```

Uses query-param stepper inside `/plan` to keep the Planning Assistant + global search + sticky headers mounted across steps.

## Data model (IndexedDB keys)
- `trucks[]` {id, name, maxWeight, active}
- `customers{}` keyed by exact name → {name, defaultArea, firstSeen}
- `areaHistory[]` — distinct area names ever used (for quick pick)
- `plans{}` keyed by ISO date → {date, areas[], truckDay[{truckId, area}], invoices[{id, doc, customer, weight, area, source, truckId|null}], locked, createdAt}
- `audit[]` — {ts, type, payload}
- `currentPlanDate` — for resume prompt

## Core logic
- **Import parser**: split lines, accept tab or comma, ignore blanks, dedupe warn (highlight but keep).
- **Customer memory**: on confirm-import, write area for any new customer.
- **Even-balance allocation**: group by area → for each invoice pick active truck with matching today-area + remaining capacity + lowest utilisation %; else UNALLOCATED.
- **Dynamic area colours**: hash area name to HSL each day, stored on plan so consistent.
- **Undo**: action stack in memory (last 50) with inverse operations; every undo logged to audit.
- **Autosave**: Zustand middleware writes to IDB after every action (debounced 150ms).
- **Resume prompt**: on app open, if `currentPlanDate` exists and not locked show modal.

## Screens (component list)
- `DailySetup` — area chips manager, truck rows with active toggle + today-area select, validation.
- `ImportReview` — paste box, parse, review table with row-level status (Known/New), adhoc table, live validation dashboard, live weight summary, keyboard nav (Tab/Enter/Shift+Tab/arrows/Ctrl+Enter).
- `Allocation` — Run Allocation button, area summary cards, truck cards with capacity bar + invoice chips.
- `Adjust` — same truck cards, chip menu → move dialog (destination picker w/ capacity preview + reason), bulk selection toolbar, undo button, live audit drawer, capacity validation.
- `Lock` — summary cards, unallocated warning banner, confirm dialog, lock/unlock (admin) actions.
- `Print` — two print views with `@media print` styles; buttons trigger `window.print()` after switching view.
- `PlanningAssistant` — collapsible right panel, shows pre/post allocation metrics live from store selectors.
- `GlobalSearch` — top-bar input filtering current plan's invoices/trucks/areas, ⌘K.
- `AdminScreen` — password gate (localStorage-set pin), tabs for customers, trucks, audit, export JSON, delete day, unlock.

## Design system
Update `src/styles.css`: dark-first tokens, force `.dark` on `<html>`, set background/foreground/card/border/accent to spec hex via oklch equivalents; add `--status-good/warn/crit` tokens and `.capacity-bar` utility. Keep shadcn tokens mapped.

## Print
Dedicated `PrintTruckSheet` and `PrintMasterReport` components rendered inside a print-only container; global `@media print { body * { visibility:hidden } .print-root, .print-root * { visibility:visible } }` pattern.

## Out of scope for v1
- Multi-user sync, real auth, fuzzy customer matching, route optimisation math beyond even-balance, mobile layout polish (desktop-first per spec).

## Deliverables order
1. Tokens + shell layout + Zustand store + IDB persistence + resume modal.
2. Daily Setup + Trucks admin + area memory.
3. Import parser + review table + customer memory write + keyboard flow.
4. Allocation engine + truck/area cards + area colours.
5. Adjust (move dialog, bulk, undo, audit).
6. Lock + reconciliation.
7. Print views + master report.
8. Planning Assistant panel + global search + Admin screen + JSON export.
