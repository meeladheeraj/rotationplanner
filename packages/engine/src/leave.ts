// Intern leave & resume (FEEDBACK #9) — a post-generation adjustment.
//
// Product rules (decided with the planner):
//  - Departments FULLY completed before the leave are kept untouched.
//  - The department the intern is partway through when leave begins is
//    RESTARTED in full on return. The partial pre-leave weeks stay as history
//    (they count toward coverage for those past weeks) but do NOT count toward
//    completion — the intern redoes that department from scratch.
//  - The remaining not-yet-completed departments follow, in their existing
//    order.
//  - Leave weeks are marked with the LEAVE sentinel. The intern's personal
//    timeline (and therefore the roster) extends to fit the resumed blocks;
//    other interns are unchanged and padded with LEAVE on the extended tail.
//
// Re-validation after a leave is COVERAGE-ONLY and length-agnostic: the classic
// fixed-length / each-department-exactly-once structural rule no longer applies
// once a leave has been introduced (a restart legitimately repeats a block, and
// the timeline is longer). Use `revalidateCoverage` for the adjusted roster.

import { schedToBlocks } from "./generate.js";
import type { Department, InternSchedule, Violation } from "./types.js";

/** Sentinel week value meaning "not in any department" (on leave / idle tail). */
export const LEAVE = -1;

const DEFAULT_MIN_COVERAGE = 2;

export interface LeaveResult {
  internSchedules: InternSchedule[];
  /** weekDeptCount[week][dept] over the (possibly extended) timeline. */
  weekDeptCount: number[][];
  totalWeeks: number;
  affectedInternId: number;
  /** Department the intern resumed (restarted) on return, or null if none remained. */
  resumedDept: number | null;
  /** Inclusive leave week range. */
  leaveStart: number;
  leaveEnd: number;
}

function durations(departments: Department[]): number[] {
  return departments.map((d) => d.weeks);
}

/** Departments the intern has FULLY completed in weeks strictly before `before`. */
function completedBefore(
  schedule: number[],
  departments: Department[],
  before: number,
): Set<number> {
  const dur = durations(departments);
  const done = new Set<number>();
  for (const b of schedToBlocks(schedule)) {
    if (b.dept < 0) continue;
    if (b.end < before && b.end - b.start + 1 === dur[b.dept]!) done.add(b.dept);
  }
  return done;
}

/**
 * Apply a leave to one intern and return the adjusted roster.
 *
 * @param startWeek  0-based week the leave begins (inclusive); 0..schedule.length.
 * @param leaveWeeks number of consecutive weeks absent (>= 1).
 */
export function applyLeave(
  internSchedules: InternSchedule[],
  departments: Department[],
  internId: number,
  startWeek: number,
  leaveWeeks: number,
): LeaveResult {
  if (!Number.isInteger(leaveWeeks) || leaveWeeks < 1) {
    throw new Error("leaveWeeks must be a positive integer");
  }
  const target = internSchedules.find((s) => s.id === internId);
  if (!target) throw new Error(`Unknown intern id ${internId}`);
  const sched = target.schedule;
  if (!Number.isInteger(startWeek) || startWeek < 0 || startWeek > sched.length) {
    throw new Error("startWeek out of range");
  }
  const dur = durations(departments);

  const prefix = sched.slice(0, startWeek);
  const completed = completedBefore(sched, departments, startWeek);
  const activeDept = startWeek < sched.length ? sched[startWeek]! : LEAVE;

  // Remaining departments to (re)do, active department first, then the rest in
  // the order they currently appear from startWeek onward.
  const remaining: number[] = [];
  const pushNeeded = (d: number) => {
    if (d >= 0 && !completed.has(d) && !remaining.includes(d)) remaining.push(d);
  };
  pushNeeded(activeDept);
  for (let w = startWeek; w < sched.length; w++) pushNeeded(sched[w]!);
  // Safety net: any not-yet-completed department that didn't appear ahead
  // (possible after prior leaves) is still owed — append in config order.
  for (let d = 0; d < departments.length; d++) pushNeeded(d);

  const resume: number[] = [];
  for (const d of remaining) for (let i = 0; i < dur[d]!; i++) resume.push(d);

  const newSched = [...prefix, ...new Array<number>(leaveWeeks).fill(LEAVE), ...resume];

  // Pad every intern to the new maximum length with LEAVE.
  const lengths = internSchedules.map((s) => s.schedule.length);
  const newLen = Math.max(newSched.length, ...lengths);
  const pad = (arr: number[]): number[] =>
    arr.length >= newLen
      ? arr.slice(0, newLen)
      : [...arr, ...new Array<number>(newLen - arr.length).fill(LEAVE)];

  const out: InternSchedule[] = internSchedules.map((s) =>
    s.id === internId ? { id: s.id, schedule: pad(newSched) } : { id: s.id, schedule: pad(s.schedule) },
  );

  return {
    internSchedules: out,
    weekDeptCount: buildWeekDeptCount(departments, out, newLen),
    totalWeeks: newLen,
    affectedInternId: internId,
    resumedDept: remaining.length > 0 ? remaining[0]! : null,
    leaveStart: startWeek,
    leaveEnd: startWeek + leaveWeeks - 1,
  };
}

function buildWeekDeptCount(
  departments: Department[],
  internSchedules: InternSchedule[],
  len: number,
): number[][] {
  const M = departments.length;
  const grid: number[][] = Array.from({ length: len }, () => new Array<number>(M).fill(0));
  for (const { schedule } of internSchedules)
    for (let w = 0; w < schedule.length && w < len; w++) {
      const d = schedule[w]!;
      if (d >= 0 && d < M) grid[w]![d]!++;
    }
  return grid;
}

/**
 * Coverage re-validation over a (possibly leave-extended, variable-length)
 * roster. Counts presence per week across the longest schedule, skipping
 * LEAVE/idle weeks, and flags any (week, dept) below its minCoverage.
 */
export function revalidateCoverage(
  departments: Department[],
  internSchedules: InternSchedule[],
): Violation[] {
  const M = departments.length;
  const minCov = departments.map((d) => d.minCoverage ?? DEFAULT_MIN_COVERAGE);
  const len = Math.max(0, ...internSchedules.map((s) => s.schedule.length));
  const grid = buildWeekDeptCount(departments, internSchedules, len);
  const violations: Violation[] = [];
  for (let w = 0; w < len; w++)
    for (let d = 0; d < M; d++) {
      const c = grid[w]![d]!;
      if (c < minCov[d]!) violations.push({ week: w, dept: d, count: c, required: minCov[d]! });
    }
  return violations;
}

/** Whether an intern has at least one FULL contiguous block of every department. */
export function internCompletesAll(
  schedule: number[],
  departments: Department[],
): { complete: boolean; missing: number[] } {
  const dur = durations(departments);
  const have = new Set<number>();
  for (const b of schedToBlocks(schedule)) {
    if (b.dept >= 0 && b.end - b.start + 1 === dur[b.dept]!) have.add(b.dept);
  }
  const missing: number[] = [];
  for (let d = 0; d < departments.length; d++) if (!have.has(d)) missing.push(d);
  return { complete: missing.length === 0, missing };
}
