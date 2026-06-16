import assert from "node:assert/strict";
import { test } from "node:test";

import ExcelJS from "exceljs";

import { parseNameWorkbook, coerceNameByIndex } from "@/lib/exports/names";

/** Build an .xlsx buffer from a 2D grid of cell values. */
async function makeWorkbook(rows: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Students");
  for (const r of rows) ws.addRow(r);
  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr as ArrayBuffer);
}

test("parseNameWorkbook maps headered rows to intern indices 1..n", async () => {
  const buf = await makeWorkbook([
    ["Name", "Roll No"],
    ["Asha Rao", "R001"],
    ["Bilal Khan", "R002"],
    ["Chen Wei", "R003"],
  ]);
  const res = await parseNameWorkbook(buf, 3);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(
    res.rows.map((r) => [r.index, r.name, r.roll]),
    [
      [1, "Asha Rao", "R001"],
      [2, "Bilal Khan", "R002"],
      [3, "Chen Wei", "R003"],
    ],
  );
  assert.equal(res.nameByIndex[1], "Asha Rao");
  assert.equal(res.nameByIndex[3], "Chen Wei");
});

test("parseNameWorkbook works without a header row (first column = name)", async () => {
  const buf = await makeWorkbook([["Asha Rao"], ["Bilal Khan"]]);
  const res = await parseNameWorkbook(buf, 2);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.rows.length, 2);
  assert.equal(res.nameByIndex[2], "Bilal Khan");
});

test("parseNameWorkbook rejects a count mismatch", async () => {
  const buf = await makeWorkbook([["Name"], ["Only One"]]);
  const res = await parseNameWorkbook(buf, 5);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.error, /1 student name.*5 intern/);
});

test("parseNameWorkbook rejects non-xlsx input", async () => {
  const res = await parseNameWorkbook(Buffer.from("not a spreadsheet"), 1);
  assert.equal(res.ok, false);
});

test("coerceNameByIndex keeps only valid in-range string entries", () => {
  const out = coerceNameByIndex({ "1": "Asha", "2": "Bilal", "9": "OutOfRange", "x": "Bad", "3": 42 }, 2);
  assert.deepEqual(out, { 1: "Asha", 2: "Bilal" });
  assert.equal(coerceNameByIndex({}, 5), null);
  assert.equal(coerceNameByIndex(null, 5), null);
});
