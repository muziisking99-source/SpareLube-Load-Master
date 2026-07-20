export type ParsedRow = { doc: string; customer: string };

export function parseImport(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let parts: string[];
    if (line.includes("\t")) parts = line.split("\t");
    else if (line.includes(",")) {
      // only split on FIRST comma to preserve customer name containing commas
      const idx = line.indexOf(",");
      parts = [line.slice(0, idx), line.slice(idx + 1)];
    } else {
      // whitespace fallback
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
