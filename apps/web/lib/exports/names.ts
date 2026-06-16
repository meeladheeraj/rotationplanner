/**
 * FEEDBACK #8 — EPHEMERAL student-name mapping for named exports.
 *
 * PRIVACY (DPDP decision 2026-06-16, Dilleswar): names are NEVER persisted.
 * An admin-uploaded spreadsheet of student names is parsed in request scope only,
 * validated against the schedule's intern count, and applied to CSV/Excel/PDF
 * exports on the fly. No student-info table, no names in any DB row, share link, or
 * audit log. Public share links stay anonymous (no session ⇒ no names).
 *
 * This module is the pure parsing/validation core shared by the parse route and
 * its tests. Workbook reading uses exceljs (node runtime only).
 */
import ExcelJS from "exceljs";

export interface NameRow {
  /** 1-based intern index (engine intern id), assigned in upload row order. */
  index: number;
  name: string;
  roll?: string;
}

export type ParsedNames =
  | { ok: true; rows: NameRow[]; nameByIndex: Record<number, string> }
  | { ok: false; error: string };

/** Coerce an exceljs cell value (which may be rich text / formula / hyperlink) to text. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    if (typeof v.text === "string") return v.text.trim();
    if (typeof v.result === "string" || typeof v.result === "number") return String(v.result).trim();
    if (Array.isArray(v.richText)) {
      return v.richText.map((r) => (r as { text?: string }).text ?? "").join("").trim();
    }
    if (typeof v.hyperlink === "string" && typeof v.text === "string") return String(v.text).trim();
  }
  return String(value).trim();
}

/** Build the intern-index → name map from parsed rows. */
export function nameByIndexFrom(rows: NameRow[]): Record<number, string> {
  const out: Record<number, string> = {};
  for (const r of rows) out[r.index] = r.name;
  return out;
}

const NAME_RE = /\b(name|student|intern)\b/i;
const ROLL_RE = /\b(roll|reg|registration|enrol|enroll|admission|id|no\.?|number)\b/i;

/**
 * Parse a student-name workbook (first worksheet) and validate that it has exactly
 * `n` named rows, mapping them in order to intern indices 1..n.
 *
 * Header detection: the first row containing a cell whose text matches NAME_RE is
 * treated as the header (its matching column = name; an adjacent roll/reg column is
 * captured if present). If no header is found, the first non-empty column is taken
 * as the name and every non-empty row is a student.
 */
export async function parseNameWorkbook(buf: Buffer, n: number): Promise<ParsedNames> {
  let wb: ExcelJS.Workbook;
  try {
    wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    return { ok: false, error: "Could not read the file as an Excel (.xlsx) workbook." };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { ok: false, error: "The workbook has no worksheets." };

  // Snapshot rows as text grids (skip fully-empty rows).
  const grid: { rowNumber: number; cells: string[] }[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = cellText(cell.value);
    });
    if (cells.some((c) => c && c.length > 0)) grid.push({ rowNumber, cells });
  });
  if (grid.length === 0) return { ok: false, error: "The spreadsheet is empty." };

  // Locate the header row + name/roll columns.
  let headerIdx = -1;
  let nameCol = -1;
  let rollCol = -1;
  for (let i = 0; i < grid.length; i++) {
    const cells = grid[i]!.cells;
    const nc = cells.findIndex((c) => NAME_RE.test(c));
    if (nc >= 0) {
      headerIdx = i;
      nameCol = nc;
      rollCol = cells.findIndex((c, ci) => ci !== nc && ROLL_RE.test(c));
      break;
    }
  }

  const rows: NameRow[] = [];
  if (headerIdx >= 0) {
    for (let i = headerIdx + 1; i < grid.length; i++) {
      const cells = grid[i]!.cells;
      const name = (cells[nameCol] ?? "").trim();
      if (!name) continue;
      const row: NameRow = { index: rows.length + 1, name };
      if (rollCol >= 0 && (cells[rollCol] ?? "").trim()) row.roll = cells[rollCol]!.trim();
      rows.push(row);
    }
  } else {
    // No header: first non-empty column of each row is the name.
    for (const { cells } of grid) {
      const first = cells.find((c) => c && c.trim().length > 0);
      if (!first) continue;
      rows.push({ index: rows.length + 1, name: first.trim() });
    }
  }

  if (rows.length === 0) {
    return { ok: false, error: "No student names were found in the spreadsheet." };
  }
  if (rows.length !== n) {
    return {
      ok: false,
      error: `Found ${rows.length} student name${rows.length === 1 ? "" : "s"}, but this schedule has ${n} intern${n === 1 ? "" : "s"}. The counts must match.`,
    };
  }
  return { ok: true, rows, nameByIndex: nameByIndexFrom(rows) };
}

/** Validate/sanitise a client-supplied nameByIndex map (from the export POST body). */
export function coerceNameByIndex(raw: unknown, n: number): Record<number, string> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const idx = Number(k);
    if (!Number.isInteger(idx) || idx < 1 || idx > n) continue;
    if (typeof v !== "string") continue;
    const name = v.trim();
    if (name) out[idx] = name.slice(0, 200);
  }
  return Object.keys(out).length > 0 ? out : null;
}
