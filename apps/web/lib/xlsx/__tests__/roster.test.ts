import assert from "node:assert/strict";
import { test } from "node:test";

import ExcelJS from "exceljs";

import { renderRosterXlsx } from "@/lib/xlsx/roster";

test("renderRosterXlsx produces a valid multi-sheet workbook", async () => {
  const buf = await renderRosterXlsx({
    configName: "Demo Roster",
    totalWeeks: 4,
    version: 2,
    status: "published",
    generatedAt: new Date("2026-06-16"),
    departments: [
      { name: "Medicine", weeks: 2, minCoverage: 2 },
      { name: "Surgery", weeks: 2, minCoverage: 2 },
    ],
    assignments: [
      {
        internIndex: 1,
        internLabel: "Intern 1",
        rotation: [
          { dept: 0, deptName: "Medicine", start: 0, end: 1 },
          { dept: 1, deptName: "Surgery", start: 2, end: 3 },
        ],
      },
      {
        internIndex: 2,
        internLabel: "Intern 2",
        rotation: [
          { dept: 1, deptName: "Surgery", start: 0, end: 1 },
          { dept: 0, deptName: "Medicine", start: 2, end: 3 },
        ],
      },
    ],
  });

  // .xlsx is a ZIP archive — magic header "PK".
  assert.ok(buf.length > 1000, "workbook should be non-trivial in size");
  assert.equal(buf.subarray(0, 2).toString("latin1"), "PK");

  // Re-open it and assert structure/content round-trips.
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  assert.deepEqual(
    wb.worksheets.map((w) => w.name),
    ["Summary", "Roster", "Coverage"],
  );

  const roster = wb.getWorksheet("Roster")!;
  // header + 4 (intern,block) rows.
  assert.equal(roster.rowCount, 5);

  const coverage = wb.getWorksheet("Coverage")!;
  // header + 2 department rows.
  assert.equal(coverage.rowCount, 3);
  // Medicine wk1 (col C) has 1 intern but min is 2 → below minimum.
  const medWk1 = coverage.getRow(2).getCell(3);
  assert.equal(medWk1.value, 1);
});
