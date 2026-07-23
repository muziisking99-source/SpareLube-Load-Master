import * as XLSX from "xlsx";

function downloadWorkbook(filename: string, sheetName: string, rows: (string | number)[][]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = rows[0].map((_, i) => ({
    wch: Math.max(
      12,
      ...rows.map((r) => String(r[i] ?? "").length + 2),
    ),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

/** Invoice import: Doc + Customer + optional Load # */
export function downloadInvoiceTemplate() {
  downloadWorkbook("invoice-import-template.xlsx", "Invoices", [
    ["Doc", "Customer", "Load #"],
    ["INV-1001", "Acme Motors", 1],
    ["INV-1002", "Fast Lube", 2],
    ["INV-1003", "Charis Spares", 3],
  ]);
}

/** Customer import: Customer Code + Customer Name */
export function downloadCustomerTemplate() {
  downloadWorkbook("customer-import-template.xlsx", "Customers", [
    ["Customer Code", "Customer Name"],
    ["C001", "Acme Motors"],
    ["C002", "Fast Lube"],
    ["C003", "Charis Spares"],
  ]);
}

/** Area import: Area / Town column */
export function downloadAreaTemplate() {
  downloadWorkbook("area-import-template.xlsx", "Areas", [
    ["Town"],
    ["Brits"],
    ["Pretoria"],
    ["Johannesburg"],
  ]);
}

/**
 * Trip import: Trip name required; Town optional (add later in Admin).
 * Use one row per trip, or Trip + Town rows for ordered towns.
 */
export function downloadTripTemplate() {
  downloadWorkbook("trip-import-template.xlsx", "Trips", [
    ["Trip", "Town"],
    ["North run", ""],
    ["South run", ""],
    ["West loop", "Brits"],
  ]);
}
