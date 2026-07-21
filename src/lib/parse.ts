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
const CUSTOMER_HEADERS = ["customer", "customer name", "name", "account", "client"];
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

/** Parse customer names from Excel (Customer / Name column, or first column). */
export function parseCustomerExcel(buffer: ArrayBuffer): string[] {
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
  let custIdx = findColumnIndex(first, CUSTOMER_HEADERS);
  let startRow = 0;
  if (custIdx >= 0) {
    startRow = 1;
  } else {
    custIdx = 0;
    startRow = 0;
  }

  const names: string[] = [];
  const seen = new Set<string>();
  for (let r = startRow; r < matrix.length; r++) {
    const name = cellToString((matrix[r] ?? [])[custIdx]);
    if (!name) continue;
    if (CUSTOMER_HEADERS.includes(normalizeHeader(name))) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

export async function parseCustomerExcelFile(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer();
  return parseCustomerExcel(buffer);
}
