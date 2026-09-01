import type { HeldInvoice, Invoice, Plan, PlanStep } from "./types";

export type SearchResult =
  | { kind: "invoice"; id: string; doc: string; customer: string; area: string; weight: number }
  | { kind: "held"; id: string; doc: string; customer: string; area: string; weight: number };

export function buildSearchResults(
  q: string,
  plan: Plan | undefined,
  heldInvoices: HeldInvoice[],
): SearchResult[] | null {
  if (!q.trim() || !plan) return null;
  const term = q.toLowerCase();
  const results: SearchResult[] = [];

  for (const i of plan.invoices) {
    if (
      i.doc.toLowerCase().includes(term) ||
      i.customer.toLowerCase().includes(term) ||
      i.area.toLowerCase().includes(term)
    ) {
      results.push({
        kind: "invoice",
        id: i.id,
        doc: i.doc,
        customer: i.customer,
        area: i.area,
        weight: i.weight,
      });
    }
  }

  for (const h of heldInvoices) {
    if (
      h.doc.toLowerCase().includes(term) ||
      h.customer.toLowerCase().includes(term) ||
      (h.area || "").toLowerCase().includes(term)
    ) {
      results.push({
        kind: "held",
        id: h.id,
        doc: h.doc,
        customer: h.customer,
        area: h.area || "",
        weight: h.weight,
      });
    }
  }

  return results.slice(0, 12);
}

export function stepForSearchResult(
  result: SearchResult,
  invoices: Invoice[],
): PlanStep {
  if (result.kind === "held") return "import";
  const inv = invoices.find((i) => i.id === result.id);
  if (!inv) return "import";
  if (inv.truckId) return "adjust";
  return "import";
}

export function scrollToSearchTarget(id: string) {
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-search-target="${id}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}
