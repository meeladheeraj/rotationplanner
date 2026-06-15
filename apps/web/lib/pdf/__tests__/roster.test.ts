import assert from "node:assert/strict";
import { test } from "node:test";

import { renderRosterPdf } from "@/lib/pdf/roster";

test("renderRosterPdf produces a valid PDF buffer", async () => {
  const buf = await renderRosterPdf({
    configName: "Demo Roster",
    totalWeeks: 52,
    version: 1,
    status: "published",
    generatedAt: new Date("2026-06-16"),
    assignments: [
      {
        internIndex: 1,
        internLabel: "Intern 1",
        rotation: [
          { dept: 0, deptName: "Medicine", start: 0, end: 11 },
          { dept: 1, deptName: "Surgery", start: 12, end: 23 },
        ],
      },
      {
        internIndex: 2,
        internLabel: "Intern 2",
        rotation: [{ dept: 1, deptName: "Surgery", start: 0, end: 11 }],
      },
    ],
  });
  assert.ok(buf.length > 1000, "PDF should be non-trivial in size");
  // PDF files start with the "%PDF" magic header.
  assert.equal(buf.subarray(0, 4).toString("latin1"), "%PDF");
});
