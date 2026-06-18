import assert from "node:assert/strict";
import { test } from "node:test";

import type { Department, InternSchedule } from "../types.js";
import { applyLeave, revalidateCoverage, internCompletesAll, LEAVE } from "../leave.js";

// Three 2-week departments: A, B, C (indices 0,1,2).
const DEPTS: Department[] = [
  { name: "A", weeks: 2, minCoverage: 1 },
  { name: "B", weeks: 2, minCoverage: 1 },
  { name: "C", weeks: 2, minCoverage: 1 },
];

function intern(id: number, schedule: number[]): InternSchedule {
  return { id, schedule };
}

test("mid-department leave restarts that department on return", () => {
  // A A B B C C — leave at week 3 (second week of B), 2 weeks off.
  const roster = [intern(1, [0, 0, 1, 1, 2, 2])];
  const r = applyLeave(roster, DEPTS, 1, 3, 2);
  const s = r.internSchedules[0]!.schedule;

  // weeks 0-2 history (A,A,B-partial); 3-4 leave; then B restarted full, then C.
  assert.deepEqual(s, [0, 0, 1, LEAVE, LEAVE, 1, 1, 2, 2]);
  assert.equal(r.resumedDept, 1); // restarted B
  assert.equal(r.leaveStart, 3);
  assert.equal(r.leaveEnd, 4);
  assert.equal(r.totalWeeks, 9);

  // The intern still completes every department (a full block of each).
  assert.deepEqual(internCompletesAll(s, DEPTS), { complete: true, missing: [] });
});

test("leave exactly at a department boundary does not waste a partial block", () => {
  // A A B B C C — leave at week 2 (start of B), 1 week off.
  const roster = [intern(1, [0, 0, 1, 1, 2, 2])];
  const r = applyLeave(roster, DEPTS, 1, 2, 1);
  assert.deepEqual(r.internSchedules[0]!.schedule, [0, 0, LEAVE, 1, 1, 2, 2]);
  assert.equal(r.resumedDept, 1);
});

test("departments completed before the leave are preserved untouched", () => {
  // Leave mid-C (week 5). A and B already done; only C is redone.
  const roster = [intern(1, [0, 0, 1, 1, 2, 2])];
  const r = applyLeave(roster, DEPTS, 1, 5, 2);
  const s = r.internSchedules[0]!.schedule;
  assert.deepEqual(s, [0, 0, 1, 1, 2, LEAVE, LEAVE, 2, 2]);
  assert.equal(r.resumedDept, 2);
  assert.deepEqual(internCompletesAll(s, DEPTS), { complete: true, missing: [] });
});

test("leave after the intern has finished only appends idle weeks", () => {
  const roster = [intern(1, [0, 0, 1, 1, 2, 2])];
  const r = applyLeave(roster, DEPTS, 1, 6, 2); // startWeek == length
  assert.deepEqual(r.internSchedules[0]!.schedule, [0, 0, 1, 1, 2, 2, LEAVE, LEAVE]);
  assert.equal(r.resumedDept, null);
});

test("a leave introduces coverage gaps that re-validation flags", () => {
  // Three interns staggered so every (week, dept) has exactly 1 -> fully covered.
  const roster = [
    intern(1, [0, 0, 1, 1, 2, 2]),
    intern(2, [1, 1, 2, 2, 0, 0]),
    intern(3, [2, 2, 0, 0, 1, 1]),
  ];
  assert.equal(revalidateCoverage(DEPTS, roster).length, 0, "fully covered before leave");

  // Intern 1 takes leave at week 0 for 2 weeks -> A uncovered in weeks 0,1.
  const r = applyLeave(roster, DEPTS, 1, 0, 2);
  const after = revalidateCoverage(DEPTS, r.internSchedules);
  assert.ok(after.length > 0, "leave creates coverage shortfalls");
  assert.ok(
    after.some((v) => v.week === 0 && v.dept === 0 && v.count === 0),
    "department A is empty in week 0 during the leave",
  );
});

test("other interns are padded, not modified, and the timeline extends", () => {
  const roster = [intern(1, [0, 0, 1, 1, 2, 2]), intern(2, [1, 1, 2, 2, 0, 0])];
  const r = applyLeave(roster, DEPTS, 1, 1, 3);
  const other = r.internSchedules.find((s) => s.id === 2)!.schedule;
  // original 6 weeks preserved, padded with LEAVE to the new length.
  assert.equal(other.length, r.totalWeeks);
  assert.deepEqual(other.slice(0, 6), [1, 1, 2, 2, 0, 0]);
  assert.ok(other.slice(6).every((w) => w === LEAVE));
});

test("invalid inputs throw", () => {
  const roster = [intern(1, [0, 0, 1, 1, 2, 2])];
  assert.throws(() => applyLeave(roster, DEPTS, 1, 0, 0), /positive integer/);
  assert.throws(() => applyLeave(roster, DEPTS, 99, 0, 1), /Unknown intern/);
  assert.throws(() => applyLeave(roster, DEPTS, 1, 99, 1), /out of range/);
});
