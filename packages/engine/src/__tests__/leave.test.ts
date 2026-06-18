import assert from "node:assert/strict";
import { test } from "node:test";

import type { Department, InternSchedule } from "../types.js";
import { applyLeave, carryOverSchedule, revalidateCoverage, LEAVE } from "../leave.js";

// Three 2-week departments: A, B, C (indices 0,1,2). Year = 6 weeks.
const DEPTS: Department[] = [
  { name: "A", weeks: 2, minCoverage: 1 },
  { name: "B", weeks: 2, minCoverage: 1 },
  { name: "C", weeks: 2, minCoverage: 1 },
];
const YEAR = 6;

function intern(id: number, schedule: number[]): InternSchedule {
  return { id, schedule };
}

test("leave keeps the year at its fixed length (never extends)", () => {
  const roster = [intern(1, [0, 0, 1, 1, 2, 2])];
  const r = applyLeave(roster, DEPTS, 1, 2, 1, YEAR);
  assert.equal(r.internSchedules[0]!.schedule.length, YEAR);
  assert.equal(r.yearWeeks, YEAR);
});

test("fits what fits before year-end; restarts in-progress dept; carries the rest", () => {
  // A A B B C C — leave at week 2 (start of B) for 1 week.
  // prefix=[A,A], leave 1wk, then B fits (2wk) into the remaining 3 weeks, C does not.
  const roster = [intern(1, [0, 0, 1, 1, 2, 2])];
  const r = applyLeave(roster, DEPTS, 1, 2, 1, YEAR);
  assert.deepEqual(r.internSchedules[0]!.schedule, [0, 0, LEAVE, 1, 1, LEAVE]);
  assert.equal(r.resumedDept, 1); // B resumed in-year
  assert.deepEqual(r.carryOver, [2]); // C carries to next batch
});

test("mid-department leave restarts that department; partial pre-leave weeks are history", () => {
  // Leave at week 3 (second week of B) for 2 weeks. After prefix [A,A,B] + 2 leave
  // only 1 week remains — B (2wk) no longer fits, so B and C both carry over.
  const roster = [intern(1, [0, 0, 1, 1, 2, 2])];
  const r = applyLeave(roster, DEPTS, 1, 3, 2, YEAR);
  assert.deepEqual(r.internSchedules[0]!.schedule, [0, 0, 1, LEAVE, LEAVE, LEAVE]);
  assert.equal(r.resumedDept, null);
  assert.deepEqual(r.carryOver, [1, 2]); // B (restart) + C carry over
});

test("completed departments before the leave are never carried over", () => {
  // Leave mid-C (week 5): A and B already done, only C remains and can't fit.
  const roster = [intern(1, [0, 0, 1, 1, 2, 2])];
  const r = applyLeave(roster, DEPTS, 1, 5, 1, YEAR);
  assert.deepEqual(r.carryOver, [2]);
  assert.ok(!r.carryOver.includes(0) && !r.carryOver.includes(1));
});

test("leave introduces coverage gaps that re-validation flags", () => {
  const roster = [
    intern(1, [0, 0, 1, 1, 2, 2]),
    intern(2, [1, 1, 2, 2, 0, 0]),
    intern(3, [2, 2, 0, 0, 1, 1]),
  ];
  assert.equal(revalidateCoverage(DEPTS, roster).length, 0, "fully covered before leave");
  const r = applyLeave(roster, DEPTS, 1, 0, 2, YEAR);
  const after = revalidateCoverage(DEPTS, r.internSchedules);
  assert.ok(after.length > 0);
  assert.ok(after.some((v) => v.week === 0 && v.dept === 0 && v.count === 0));
});

test("other interns are untouched and the roster length is unchanged", () => {
  const roster = [intern(1, [0, 0, 1, 1, 2, 2]), intern(2, [1, 1, 2, 2, 0, 0])];
  const r = applyLeave(roster, DEPTS, 1, 1, 2, YEAR);
  const other = r.internSchedules.find((s) => s.id === 2)!.schedule;
  assert.deepEqual(other, [1, 1, 2, 2, 0, 0]);
});

test("carryOverSchedule lays out remaining departments from week 0, idle after", () => {
  // Carry over C (index 2): 2 weeks of C, then idle for the rest of the year.
  assert.deepEqual(carryOverSchedule(DEPTS, [2], YEAR), [2, 2, LEAVE, LEAVE, LEAVE, LEAVE]);
  // Carry over B then C.
  assert.deepEqual(carryOverSchedule(DEPTS, [1, 2], YEAR), [1, 1, 2, 2, LEAVE, LEAVE]);
});

test("invalid inputs throw", () => {
  const roster = [intern(1, [0, 0, 1, 1, 2, 2])];
  assert.throws(() => applyLeave(roster, DEPTS, 1, 0, 0, YEAR), /positive integer/);
  assert.throws(() => applyLeave(roster, DEPTS, 99, 0, 1, YEAR), /Unknown intern/);
  assert.throws(() => applyLeave(roster, DEPTS, 1, 99, 1, YEAR), /out of range/);
});
