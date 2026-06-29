/**
 * Server-side Excel (.xlsx) rendering of a roster via exceljs.
 * Node runtime only (imported from a route handler with runtime = "nodejs").
 *
 * Produces a polished, multi-sheet workbook:
 *   1. "Summary"  — a report-style cover: title banner + key-stat cards.
 *   2. "Roster"   — one row per (intern, rotation block), department-colour-coded,
 *                   with banded rows and borders.
 *   3. "Coverage" — per-department × week staffing matrix rendered as a heatmap
 *                   (graduated fill by staffing level), below-minimum cells flagged red.
 *   4. one sheet PER department — week-by-week who-is-staffed + count, below-min flagged.
 *
 * NOTE: the cell grid (sheet order, header rows, row/column positions) is kept stable
 * because the test-suite asserts on exact structure; everything new here is styling.
 */
import ExcelJS from "exceljs";

import type { ScheduleDetail } from "@/lib/data/schedules";

export interface RosterXlsxDepartment {
  name: string;
  weeks: number;
  minCoverage: number;
}

export interface RosterXlsxInput {
  configName: string;
  totalWeeks: number;
  version: number;
  status: string;
  generatedAt: Date;
  assignments: ScheduleDetail["assignments"];
  departments: RosterXlsxDepartment[];
  /**
   * FEEDBACK #8 — optional EPHEMERAL student-name mapping (intern index → name).
   * When present, intern labels are replaced by real names for this render only;
   * nothing is persisted. Absent ⇒ anonymous "Intern N" labels (default).
   */
  nameByIndex?: Record<number, string>;
}

/* ── Brand palette ─────────────────────────────────────────────────────── */
const INK = "FF0F172A"; // slate-900 text
const MUTED = "FF64748B"; // slate-500 meta text
const BRAND = "FF4F46E5"; // indigo-600 — headers / accents
const BRAND_DEEP = "FF3730A3"; // indigo-800 — cover banner
const GRID = "FFE2E8F0"; // slate-200 — hairline borders
const BAND = "FFF8FAFC"; // slate-50 — zebra band
const BELOW_MIN_BG = "FFFEE2E2"; // red-100
const BELOW_MIN_FG = "FFB91C1C"; // red-700
const CARD_BG = "FFEEF2FF"; // indigo-50 — stat cards

/** Consistent per-department colours (mirror the in-app timeline/cards palette). */
const DEPT_PALETTE = [
  "FF2563EB", "FFDC2626", "FF059669", "FFD97706", "FF7C3AED", "FFDB2777",
  "FF0891B2", "FF65A30D", "FFEA580C", "FF4F46E5", "FF0D9488", "FFB91C1C",
  "FF1D4ED8", "FF9333EA", "FFC026D3", "FFCA8A04", "FF16A34A", "FFE11D48",
  "FF0284C7", "FF6D28D9",
];

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };

function solid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function thinBorder(argb = GRID): Partial<ExcelJS.Borders> {
  const s: ExcelJS.Border = { style: "thin", color: { argb } };
  return { top: s, left: s, bottom: s, right: s };
}

/** Linear-interpolate two ARGB colours (alpha kept from `a`). t in [0,1]. */
function mix(a: string, b: string, t: number): string {
  const pa = [parseInt(a.slice(2, 4), 16), parseInt(a.slice(4, 6), 16), parseInt(a.slice(6, 8), 16)];
  const pb = [parseInt(b.slice(2, 4), 16), parseInt(b.slice(4, 6), 16), parseInt(b.slice(6, 8), 16)];
  const c = pa.map((v, i) => Math.round(v + (pb[i]! - v) * t));
  return "FF" + c.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function deptColor(i: number): string {
  return DEPT_PALETTE[i % DEPT_PALETTE.length]!;
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.height = 22;
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = thinBorder(BRAND);
  });
}

/** Build the week × dept staffing-count matrix from the persisted assignments. */
function weekDeptCounts(input: RosterXlsxInput): number[][] {
  const M = input.departments.length;
  const TW = input.totalWeeks;
  const counts: number[][] = Array.from({ length: TW }, () => new Array<number>(M).fill(0));
  for (const a of input.assignments) {
    for (const b of a.rotation) {
      if (b.dept < 0 || b.dept >= M) continue;
      for (let w = b.start; w <= b.end; w++) {
        if (w >= 0 && w < TW) counts[w]![b.dept]! += 1;
      }
    }
  }
  return counts;
}

/* ── Summary: a report-style cover ─────────────────────────────────────── */
function buildSummarySheet(wb: ExcelJS.Workbook, input: RosterXlsxInput): void {
  const ws = wb.addWorksheet("Summary", {
    properties: { defaultColWidth: 18 },
    views: [{ showGridLines: false }],
  });
  ws.columns = [
    { key: "a", width: 26 },
    { key: "b", width: 22 },
    { key: "c", width: 22 },
    { key: "d", width: 22 },
  ];

  // Title banner across A1:D2.
  ws.mergeCells("A1:D2");
  const banner = ws.getCell("A1");
  banner.value = "RotationPlanner";
  banner.fill = solid(BRAND_DEEP);
  banner.font = { bold: true, size: 22, color: { argb: "FFFFFFFF" } };
  banner.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 26;
  ws.getRow(2).height = 26;

  // Sub-banner: config + status.
  ws.mergeCells("A3:D3");
  const sub = ws.getCell("A3");
  sub.value = `${input.configName}  ·  v${input.version}  ·  ${input.status.toUpperCase()}`;
  sub.fill = solid(BRAND);
  sub.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  sub.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(3).height = 20;

  // Stat "cards" on row 5 (label row 5, value row 6).
  const stats: [string, string | number][] = [
    ["Interns", input.assignments.length],
    ["Departments", input.departments.length],
    ["Total weeks", input.totalWeeks],
    ["Generated", new Date(input.generatedAt).toISOString().slice(0, 10)],
  ];
  stats.forEach(([label, value], i) => {
    const col = i + 1; // A..D
    const labelCell = ws.getCell(5, col);
    labelCell.value = String(label).toUpperCase();
    labelCell.fill = solid(CARD_BG);
    labelCell.font = { size: 9, bold: true, color: { argb: MUTED } };
    labelCell.alignment = { horizontal: "center", vertical: "middle" };
    labelCell.border = thinBorder();

    const valueCell = ws.getCell(6, col);
    valueCell.value = value;
    valueCell.fill = solid(CARD_BG);
    valueCell.font = { size: 18, bold: true, color: { argb: BRAND_DEEP } };
    valueCell.alignment = { horizontal: "center", vertical: "middle" };
    valueCell.border = thinBorder();
  });
  ws.getRow(5).height = 16;
  ws.getRow(6).height = 30;

  // Footer.
  ws.mergeCells("A8:D8");
  const foot = ws.getCell("A8");
  foot.value = "Generated by rotationplanner.in  ·  schedules are anonymous; names appear only on named exports";
  foot.font = { size: 9, italic: true, color: { argb: MUTED } };
}

/* ── Roster: dept-coloured, banded, bordered ───────────────────────────── */
function buildRosterSheet(wb: ExcelJS.Workbook, input: RosterXlsxInput): void {
  const ws = wb.addWorksheet("Roster", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Intern", key: "intern", width: 18 },
    { header: "Department", key: "dept", width: 26 },
    { header: "Start Week", key: "start", width: 12 },
    { header: "End Week", key: "end", width: 12 },
    { header: "Duration (weeks)", key: "duration", width: 16 },
  ];
  styleHeaderRow(ws.getRow(1));

  // Map dept name → palette index for consistent colouring.
  const deptIndexByName = new Map<string, number>();
  input.departments.forEach((d, i) => deptIndexByName.set(d.name, i));

  let band = false;
  let prevIntern: string | null = null;
  for (const a of input.assignments) {
    const blocks = a.rotation.slice().sort((x, y) => x.start - y.start);
    // Alternate the zebra band per-intern so each intern's block group is visually grouped.
    if (prevIntern !== null && a.internLabel !== prevIntern) band = !band;
    prevIntern = a.internLabel;
    for (const b of blocks) {
      const row = ws.addRow({
        intern: a.internLabel,
        dept: b.deptName,
        start: b.start + 1,
        end: b.end + 1,
        duration: b.end - b.start + 1,
      });
      row.height = 18;
      row.eachCell((cell, col) => {
        cell.border = thinBorder();
        if (col >= 3) cell.alignment = { horizontal: "center" };
        if (band) cell.fill = solid(BAND);
      });
      // Colour the Department cell with its department's colour (tinted).
      const di = deptIndexByName.get(b.deptName);
      if (di !== undefined) {
        const c = deptColor(di);
        const cell = row.getCell(2);
        cell.fill = solid(mix("FFFFFFFF", c, 0.18));
        cell.font = { bold: true, color: { argb: mix(c, INK, 0.35) } };
      }
      row.getCell(1).font = { bold: true, color: { argb: INK } };
    }
  }
  ws.autoFilter = { from: "A1", to: "E1" };
}

/* ── Coverage: heatmap matrix ──────────────────────────────────────────── */
function buildCoverageSheet(wb: ExcelJS.Workbook, input: RosterXlsxInput): void {
  const ws = wb.addWorksheet("Coverage", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 1 }],
  });
  const counts = weekDeptCounts(input);
  const TW = input.totalWeeks;

  const columns: Partial<ExcelJS.Column>[] = [
    { header: "Department", key: "dept", width: 24 },
    { header: "Min required", key: "min", width: 13 },
  ];
  for (let w = 0; w < TW; w++) columns.push({ header: `Wk ${w + 1}`, key: `w${w}`, width: 6 });
  ws.columns = columns;
  styleHeaderRow(ws.getRow(1));

  // Heatmap scale runs white → indigo, scaled by the busiest cell in the grid.
  let maxC = 1;
  for (let w = 0; w < TW; w++) for (let d = 0; d < input.departments.length; d++) maxC = Math.max(maxC, counts[w]![d]!);

  input.departments.forEach((d, di) => {
    const row = ws.addRow([d.name, d.minCoverage]);
    row.height = 16;
    const nameCell = row.getCell(1);
    nameCell.font = { bold: true, color: { argb: INK } };
    nameCell.border = thinBorder();
    // Department colour chip on the name cell's left edge.
    nameCell.fill = solid(mix("FFFFFFFF", deptColor(di), 0.16));
    const minCell = row.getCell(2);
    minCell.alignment = { horizontal: "center" };
    minCell.border = thinBorder();

    for (let w = 0; w < TW; w++) {
      const c = counts[w]![di]!;
      const cell = row.getCell(3 + w);
      cell.value = c;
      cell.alignment = { horizontal: "center" };
      cell.border = thinBorder();
      if (c < d.minCoverage) {
        cell.fill = solid(BELOW_MIN_BG);
        cell.font = { color: { argb: BELOW_MIN_FG }, bold: true };
      } else {
        const ratio = c / maxC; // 0..1
        cell.fill = solid(mix("FFFFFFFF", BRAND, 0.1 + ratio * 0.8));
        cell.font = { color: { argb: ratio > 0.55 ? "FFFFFFFF" : INK } };
      }
    }
  });
}

/** For one department index, the intern labels present in each week of the year. */
function deptWeeklyStudents(input: RosterXlsxInput, deptIndex: number): string[][] {
  const TW = input.totalWeeks;
  const weeks: string[][] = Array.from({ length: TW }, () => []);
  for (const a of input.assignments) {
    for (const b of a.rotation) {
      if (b.dept !== deptIndex) continue;
      for (let w = b.start; w <= b.end; w++) {
        if (w >= 0 && w < TW) weeks[w]!.push(a.internLabel);
      }
    }
  }
  for (const list of weeks) list.sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
  return weeks;
}

/** Excel sheet names: max 31 chars, none of \ / ? * [ ] :, must be unique. */
function uniqueSheetName(raw: string, used: Set<string>): string {
  const base = (raw.replace(/[\\/?*[\]:]/g, " ").trim() || "Dept").slice(0, 28);
  let candidate = base;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base.slice(0, 25)} ${i++}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/** One worksheet PER department: a week-by-week breakdown of who is staffed and
 *  the count, with below-minimum weeks flagged. */
function buildDepartmentSheets(wb: ExcelJS.Workbook, input: RosterXlsxInput): void {
  const used = new Set<string>(wb.worksheets.map((w) => w.name.toLowerCase()));
  const TW = input.totalWeeks;

  input.departments.forEach((d, di) => {
    const ws = wb.addWorksheet(uniqueSheetName(d.name, used), {
      views: [{ state: "frozen", ySplit: 3 }],
    });
    ws.getColumn(1).width = 8;
    ws.getColumn(2).width = 12;
    ws.getColumn(3).width = 90;

    const accent = deptColor(di);

    ws.mergeCells("A1:C1");
    const title = ws.getCell("A1");
    title.value = `  ${d.name}`;
    title.fill = solid(mix("FFFFFFFF", accent, 0.2));
    title.font = { bold: true, size: 14, color: { argb: mix(accent, INK, 0.3) } };
    title.alignment = { vertical: "middle" };
    ws.getRow(1).height = 24;

    ws.mergeCells("A2:C2");
    const meta = ws.getCell("A2");
    meta.value = `  Block length ${d.weeks} week(s) · minimum ${d.minCoverage} student(s)/week`;
    meta.font = { size: 9, color: { argb: MUTED } };

    const header = ws.getRow(3);
    header.values = ["Week", "# Students", "Students"];
    styleHeaderRow(header);

    const weekly = deptWeeklyStudents(input, di);
    for (let w = 0; w < TW; w++) {
      const students = weekly[w]!;
      const row = ws.addRow([w + 1, students.length, students.join(", ")]);
      row.height = 16;
      row.eachCell((cell) => (cell.border = thinBorder()));
      if (w % 2 === 1) row.eachCell((cell) => (cell.fill = solid(BAND)));
      row.getCell(1).alignment = { horizontal: "center" };
      const cnt = row.getCell(2);
      cnt.alignment = { horizontal: "center" };
      if (students.length < d.minCoverage) {
        cnt.fill = solid(BELOW_MIN_BG);
        cnt.font = { color: { argb: BELOW_MIN_FG }, bold: true };
      }
    }
  });
}

/** Apply an ephemeral name map (if any) by overriding each intern's display label. */
function withNames(input: RosterXlsxInput): RosterXlsxInput {
  const map = input.nameByIndex;
  if (!map) return input;
  return {
    ...input,
    assignments: input.assignments.map((a) => ({
      ...a,
      internLabel: map[a.internIndex] ?? a.internLabel,
    })),
  };
}

export async function renderRosterXlsx(rawInput: RosterXlsxInput): Promise<Buffer> {
  const input = withNames(rawInput);
  const wb = new ExcelJS.Workbook();
  wb.creator = "RotationPlanner";
  wb.created = new Date(input.generatedAt);
  buildSummarySheet(wb, input);
  buildRosterSheet(wb, input);
  buildCoverageSheet(wb, input);
  buildDepartmentSheets(wb, input);
  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr as ArrayBuffer);
}
