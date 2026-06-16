/**
 * Server-side Excel (.xlsx) rendering of a roster via exceljs.
 * Node runtime only (imported from a route handler with runtime = "nodejs").
 *
 * Produces a formatted, multi-sheet workbook:
 *   1. "Roster"   — one row per (intern, rotation block): intern, dept, weeks, duration.
 *   2. "Coverage" — per-department × week matrix of how many interns are staffed,
 *                   with the per-dept minimum required and below-minimum cells flagged.
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
}

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E293B" },
};
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" } };
const BELOW_MIN_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFEE2E2" },
};

function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "center" };
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

function buildRosterSheet(wb: ExcelJS.Workbook, input: RosterXlsxInput): void {
  const ws = wb.addWorksheet("Roster", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Intern", key: "intern", width: 14 },
    { header: "Department", key: "dept", width: 24 },
    { header: "Start Week", key: "start", width: 12 },
    { header: "End Week", key: "end", width: 12 },
    { header: "Duration (weeks)", key: "duration", width: 16 },
  ];
  styleHeaderRow(ws.getRow(1));

  for (const a of input.assignments) {
    const blocks = a.rotation.slice().sort((x, y) => x.start - y.start);
    for (const b of blocks) {
      ws.addRow({
        intern: a.internLabel,
        dept: b.deptName,
        start: b.start + 1,
        end: b.end + 1,
        duration: b.end - b.start + 1,
      });
    }
  }
  ws.autoFilter = { from: "A1", to: "E1" };
}

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
  for (let w = 0; w < TW; w++) {
    columns.push({ header: `Wk ${w + 1}`, key: `w${w}`, width: 6 });
  }
  ws.columns = columns;
  styleHeaderRow(ws.getRow(1));

  input.departments.forEach((d, di) => {
    const row = ws.addRow([d.name, d.minCoverage]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { horizontal: "center" };
    for (let w = 0; w < TW; w++) {
      const c = counts[w]![di]!;
      const cell = row.getCell(3 + w);
      cell.value = c;
      cell.alignment = { horizontal: "center" };
      if (c < d.minCoverage) {
        cell.fill = BELOW_MIN_FILL;
        cell.font = { color: { argb: "FFB91C1C" }, bold: true };
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

    ws.mergeCells("A1:C1");
    const title = ws.getCell("A1");
    title.value = d.name;
    title.font = { bold: true, size: 14, color: { argb: "FF1E293B" } };

    ws.mergeCells("A2:C2");
    const meta = ws.getCell("A2");
    meta.value = `Block length ${d.weeks} week(s) · minimum ${d.minCoverage} student(s)/week`;
    meta.font = { size: 9, color: { argb: "FF64748B" } };

    const header = ws.getRow(3);
    header.values = ["Week", "# Students", "Students"];
    styleHeaderRow(header);

    const weekly = deptWeeklyStudents(input, di);
    for (let w = 0; w < TW; w++) {
      const students = weekly[w]!;
      const row = ws.addRow([w + 1, students.length, students.join(", ")]);
      row.getCell(1).alignment = { horizontal: "center" };
      const cnt = row.getCell(2);
      cnt.alignment = { horizontal: "center" };
      if (students.length < d.minCoverage) {
        cnt.fill = BELOW_MIN_FILL;
        cnt.font = { color: { argb: "FFB91C1C" }, bold: true };
      }
    }
  });
}

function buildSummarySheet(wb: ExcelJS.Workbook, input: RosterXlsxInput): void {
  const ws = wb.addWorksheet("Summary");
  ws.columns = [
    { header: "Field", key: "k", width: 22 },
    { header: "Value", key: "v", width: 40 },
  ];
  styleHeaderRow(ws.getRow(1));
  const rows: [string, string | number][] = [
    ["Configuration", input.configName],
    ["Version", input.version],
    ["Status", input.status],
    ["Interns", input.assignments.length],
    ["Total weeks", input.totalWeeks],
    ["Departments", input.departments.length],
    ["Generated", new Date(input.generatedAt).toISOString().slice(0, 10)],
  ];
  for (const [k, v] of rows) {
    const row = ws.addRow({ k, v });
    row.getCell(1).font = { bold: true };
  }
}

export async function renderRosterXlsx(input: RosterXlsxInput): Promise<Buffer> {
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
