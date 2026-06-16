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
    ["Summary", "Roster", "Coverage", "Medicine", "Surgery"],
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

  // Per-department sheet: title (1) + meta (2) + header (3) + 4 week rows = 7.
  const medicine = wb.getWorksheet("Medicine")!;
  assert.equal(medicine.rowCount, 7);
  // Week 1 row (row 4): only Intern 1 is in Medicine → count 1, students "Intern 1".
  assert.equal(medicine.getRow(4).getCell(1).value, 1);
  assert.equal(medicine.getRow(4).getCell(2).value, 1);
  assert.equal(medicine.getRow(4).getCell(3).value, "Intern 1");
  // Week 3 row (row 6): Intern 2 rotates into Medicine.
  assert.equal(medicine.getRow(6).getCell(3).value, "Intern 2");
});

test("renderRosterXlsx substitutes ephemeral student names when provided", async () => {
  const buf = await renderRosterXlsx({
    configName: "Demo Roster",
    totalWeeks: 4,
    version: 1,
    status: "draft",
    generatedAt: new Date("2026-06-16"),
    departments: [
      { name: "Medicine", weeks: 2, minCoverage: 2 },
      { name: "Surgery", weeks: 2, minCoverage: 2 },
    ],
    assignments: [
      {
        internIndex: 1,
        internLabel: "Intern 1",
        rotation: [{ dept: 0, deptName: "Medicine", start: 0, end: 1 }],
      },
      {
        internIndex: 2,
        internLabel: "Intern 2",
        rotation: [{ dept: 0, deptName: "Medicine", start: 2, end: 3 }],
      },
    ],
    nameByIndex: { 1: "Asha Rao", 2: "Bilal Khan" },
  });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const roster = wb.getWorksheet("Roster")!;
  // Names replace "Intern N" in the roster sheet's first column.
  assert.equal(roster.getRow(2).getCell(1).value, "Asha Rao");
  // And in the per-department sheet's student lists.
  const medicine = wb.getWorksheet("Medicine")!;
  assert.equal(medicine.getRow(4).getCell(3).value, "Asha Rao");
});
