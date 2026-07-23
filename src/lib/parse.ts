import * as XLSX from "xlsx";

export type ParsedRow = {
  doc: string;
  customer: string;
  /** Optional load # from Excel (applied after area is known) */
  loadingNumber?: number;
};

export function parseImport(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let parts: string[];
    if (line.includes("\t")) parts = line.split("\t");
    else if (line.includes(",")) {
      const idx = line.indexOf(",");
      parts = [line.slice(0, idx), line.slice(idx + 1)];
    } else {
      const m = line.match(/^(\S+)\s+(.+)$/);
      if (!m) continue;
      parts = [m[1], m[2]];
    }
    const doc = (parts[0] ?? "").trim();
    const customer = (parts[1] ?? "").trim();
    if (!doc || !customer) continue;
    rows.push({ doc, customer });
  }
  return rows;
}

const DOC_HEADERS = [
  "doc",
  "document",
  "doc no",
  "docno",
  "invoice",
  "invoice no",
  "invoiceno",
  "number",
  "no",
];
const CUSTOMER_HEADERS = ["customer", "customer name", "name", "account name", "client", "client name"];
const CUSTOMER_CODE_HEADERS = [
  "customer code",
  "cust code",
  "code",
  "account",
  "account code",
  "account no",
  "account number",
  "cust no",
  "customer no",
  "customer id",
  "id",
];
const LOAD_HEADERS = [
  "load",
  "load #",
  "load no",
  "loadno",
  "loading",
  "loading #",
  "loading number",
  "loadingnumber",
  "seq",
  "sequence",
  "order",
];

function normalizeHeader(h: unknown): string {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    if (candidates.includes(headers[i])) return i;
  }
  for (let i = 0; i < headers.length; i++) {
    if (candidates.some((c) => headers[i].includes(c) || c.includes(headers[i]))) return i;
  }
  return -1;
}

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  return String(v).trim();
}

function cellToLoadNumber(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.floor(n);
}

/** Parse an Excel workbook (.xlsx / .xls) into Doc + Customer (+ optional Load #) rows. */
export function parseExcel(buffer: ArrayBuffer): ParsedRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (matrix.length === 0) return [];

  const first = (matrix[0] ?? []).map(normalizeHeader);
  let docIdx = findColumnIndex(first, DOC_HEADERS);
  let custIdx = findColumnIndex(first, CUSTOMER_HEADERS);
  const loadIdx = findColumnIndex(first, LOAD_HEADERS);
  let startRow = 0;

  if (docIdx >= 0 && custIdx >= 0) {
    startRow = 1;
  } else {
    docIdx = 0;
    custIdx = 1;
    startRow = 0;
  }

  const rows: ParsedRow[] = [];
  for (let r = startRow; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    const doc = cellToString(line[docIdx]);
    const customer = cellToString(line[custIdx]);
    if (!doc || !customer) continue;
    if (normalizeHeader(doc) === "doc" || DOC_HEADERS.includes(normalizeHeader(doc))) continue;
    const loadingNumber = loadIdx >= 0 ? cellToLoadNumber(line[loadIdx]) : undefined;
    rows.push({ doc, customer, ...(loadingNumber ? { loadingNumber } : {}) });
  }
  return rows;
}

export async function parseExcelFile(file: File): Promise<ParsedRow[]> {
  const buffer = await file.arrayBuffer();
  return parseExcel(buffer);
}

/** Parse customer code + name from Excel. */
export type ParsedCustomer = { code: string; name: string };

export function parseCustomerExcel(buffer: ArrayBuffer): ParsedCustomer[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  if (matrix.length === 0) return [];

  const first = (matrix[0] ?? []).map(normalizeHeader);
  let codeIdx = findColumnIndex(first, CUSTOMER_CODE_HEADERS);
  let nameIdx = findColumnIndex(first, CUSTOMER_HEADERS);
  if (codeIdx >= 0 && nameIdx === codeIdx) {
    nameIdx = -1;
    for (let i = 0; i < first.length; i++) {
      if (i === codeIdx) continue;
      if (CUSTOMER_HEADERS.includes(first[i]) || CUSTOMER_HEADERS.some((c) => first[i].includes(c))) {
        nameIdx = i;
        break;
      }
    }
  }

  let startRow = 0;
  if (codeIdx >= 0 && nameIdx >= 0) {
    startRow = 1;
  } else if (nameIdx >= 0) {
    startRow = 1;
    codeIdx = -1;
  } else if (codeIdx >= 0) {
    // Code header but no name — use next column as name
    startRow = 1;
    nameIdx = codeIdx + 1;
  } else {
    codeIdx = 0;
    nameIdx = 1;
    startRow = 0;
  }

  const rows: ParsedCustomer[] = [];
  const seen = new Set<string>();
  for (let r = startRow; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    let code = codeIdx >= 0 ? cellToString(line[codeIdx]) : "";
    let name = nameIdx >= 0 ? cellToString(line[nameIdx]) : "";
    // Single-column sheet (no header or name-only): value is the name
    if (!name && code && nameIdx < 0) {
      name = code;
      code = "";
    }
    if (!name && code && (line.length <= 1 || nameIdx === codeIdx)) {
      name = code;
      code = "";
    }
    if (!name) continue;
    if (CUSTOMER_HEADERS.includes(normalizeHeader(name))) continue;
    if (code && CUSTOMER_CODE_HEADERS.includes(normalizeHeader(code))) continue;
    const key = (code || name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ code, name });
  }
  return rows;
}

export async function parseCustomerExcelFile(file: File): Promise<ParsedCustomer[]> {
  const buffer = await file.arrayBuffer();
  return parseCustomerExcel(buffer);
}

const AREA_HEADERS = [
  "area",
  "areas",
  "region",
  "regions",
  "zone",
  "zones",
  "route",
  "routes",
  "location",
  "town",
];

/** Parse area names from Excel (Area column, or first column). */
export function parseAreaExcel(buffer: ArrayBuffer): string[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  if (matrix.length === 0) return [];

  const first = (matrix[0] ?? []).map(normalizeHeader);
  let areaIdx = findColumnIndex(first, AREA_HEADERS);
  let startRow = 0;
  if (areaIdx >= 0) {
    startRow = 1;
  } else {
    areaIdx = 0;
    startRow = 0;
  }

  const names: string[] = [];
  const seen = new Set<string>();
  for (let r = startRow; r < matrix.length; r++) {
    const name = cellToString((matrix[r] ?? [])[areaIdx]);
    if (!name) continue;
    if (AREA_HEADERS.includes(normalizeHeader(name))) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

export async function parseAreaExcelFile(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer();
  return parseAreaExcel(buffer);
}

const TRIP_HEADERS = ["trip", "trip name", "name", "run", "route name"];
const TRIP_TOWN_HEADERS = ["town", "towns", "area", "areas"];

export type ParsedTrip = {
  name: string;
  towns: string[];
};

/**
 * Parse trips from Excel.
 * - Trip column (or first column): trip names
 * - Optional Town column: one town per row (order preserved), or comma-separated list
 */
export function parseTripExcel(buffer: ArrayBuffer): ParsedTrip[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  if (matrix.length === 0) return [];

  const first = (matrix[0] ?? []).map(normalizeHeader);
  let tripIdx = findColumnIndex(first, TRIP_HEADERS);
  let townIdx = findColumnIndex(first, TRIP_TOWN_HEADERS);
  let startRow = 0;

  if (tripIdx >= 0) {
    startRow = 1;
    // Avoid matching the same column as both trip and town
    if (townIdx === tripIdx) townIdx = -1;
  } else {
    tripIdx = 0;
    startRow = 0;
    if (matrix[0] && TRIP_HEADERS.includes(normalizeHeader(matrix[0][0]))) {
      startRow = 1;
    }
  }

  const order: string[] = [];
  const byKey = new Map<string, { name: string; towns: string[]; seenTown: Set<string> }>();

  for (let r = startRow; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const name = cellToString(row[tripIdx]);
    if (!name) continue;
    if (TRIP_HEADERS.includes(normalizeHeader(name))) continue;

    const key = name.toLowerCase();
    let entry = byKey.get(key);
    if (!entry) {
      entry = { name, towns: [], seenTown: new Set() };
      byKey.set(key, entry);
      order.push(key);
    }

    if (townIdx < 0) continue;
    const rawTown = cellToString(row[townIdx]);
    if (!rawTown) continue;
    const parts = rawTown.split(/[,;|/]+/).map((t) => t.trim()).filter(Boolean);
    for (const town of parts) {
      const tKey = town.toLowerCase();
      if (entry.seenTown.has(tKey)) continue;
      entry.seenTown.add(tKey);
      entry.towns.push(town);
    }
  }

  return order.map((key) => {
    const e = byKey.get(key)!;
    return { name: e.name, towns: e.towns };
  });
}

export async function parseTripExcelFile(file: File): Promise<ParsedTrip[]> {
  const buffer = await file.arrayBuffer();
  return parseTripExcel(buffer);
}
