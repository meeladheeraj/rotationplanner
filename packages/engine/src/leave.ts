// Intern leave & resume (FEEDBACK #9) — a post-generation adjustment.
//
// Product model (corrected): the academic year is HARD-CAPPED at `yearWeeks`
// (the config's total weeks). A leave never extends the year. Instead:
//  - Departments FULLY completed before the leave are kept.
//  - The department the intern was partway through is RESTARTED on return (the
//    partial pre-leave weeks remain as history but don't count toward
//    completion).
//  - On return we fit as many remaining departments as wholly fit before the
//    year ends; whatever doesn't fit becomes CARRY-OVER for the next batch.
//  - Leave weeks (and any idle weeks at the year's end) use the LEAVE sentinel.
//
// The current roster stays exactly `yearWeeks` long — only the affected intern's
// row changes; everyone else is untouched. Re-validation is coverage-only.
// `carryOverSchedule` lays out a carry-over intern's remaining departments for
// the NEXT batch (a partial schedule that finishes early).

import { schedToBlocks } from "./generate.js";
import type { Department, InternSchedule, Violation } from "./types.js";

/** Sentinel week value meaning "not in any department" (on leave / idle). */
export const LEAVE = -1;

const DEFAULT_MIN_COVERAGE = 2;

export interface LeaveResult {
  /** Updated roster — SAME length (yearWeeks); only the affected intern changed. */
  internSchedules: InternSchedule[];
  weekDeptCount: number[][];
  yearWeeks: number;
  affectedInternId: number;
  /** Department restarted/resumed in-year (first one that fit), or null. */
  resumedDept: number | null;
  /** Departments the intern could NOT finish this year — carry to next batch. */
  carryOver: number[];
  /** Inclusive leave week range within the year (clamped to the year end). */
  leaveStart: number;
  leaveEnd: number;
}

function durations(departments: Department[]): number[] {
  return departments.map((d) => d.weeks);
}

/** Departments FULLY completed in weeks strictly before `before`. */
function completedBefore(schedule: number[], departments: Department[], before: number): Set<number> {
  const dur = durations(departments);
  const done = new Set<number>();
  for (const b of schedToBlocks(schedule)) {
    if (b.dept >= 0 && b.end < before && b.end - b.start + 1 === dur[b.dept]!) done.add(b.dept);
  }
  return done;
}

/**
 * Apply a leave to one intern within a year-capped roster.
 *
 * @param startWeek  0-based week the leave begins (inclusive); 0..yearWeeks.
 * @param leaveWeeks number of consecutive weeks absent (>= 1).
 * @param yearWeeks  the fixed year length; defaults to the roster's row length.
 */
export function applyLeave(
  internSchedules: InternSchedule[],
  departments: Department[],
  internId: number,
  startWeek: number,
  leaveWeeks: number,
  yearWeeks?: number,
): LeaveResult {
  if (!Number.isInteger(leaveWeeks) || leaveWeeks < 1) {
    throw new Error("leaveWeeks must be a positive integer");
  }
  const target = internSchedules.find((s) => s.id === internId);
  if (!target) throw new Error(`Unknown intern id ${internId}`);
  const L = yearWeeks ?? target.schedule.length;
  const sched = target.schedule;
  if (!Number.isInteger(startWeek) || startWeek < 0 || startWeek > L) {
    throw new Error("startWeek out of range");
  }
  const dur = durations(departments);

  const prefix = sched.slice(0, startWeek);
  const completed = completedBefore(sched, departments, startWeek);
  const activeDept = startWeek < sched.length ? sched[startWeek]! : LEAVE;

  // Remaining departments to (re)do, active first, then the rest in order.
  const remaining: number[] = [];
  const pushNeeded = (d: number) => {
    if (d >= 0 && !completed.has(d) && !remaining.includes(d)) remaining.push(d);
  };
  pushNeeded(activeDept);
  for (let w = startWeek; w < sched.length; w++) pushNeeded(sched[w]!);
  for (let d = 0; d < departments.length; d++) pushNeeded(d);

  // Leave occupies weeks within the year only.
  const leaveInYear = Math.max(0, Math.min(leaveWeeks, L - startWeek));
  let available = L - startWeek - leaveInYear; // weeks left this year after the leave

  const placed: number[] = [];
  const carryOver: number[] = [];
  let stopped = false;
  for (const d of remaining) {
    if (!stopped && dur[d]! <= available) {
      placed.push(d);
      available -= dur[d]!;
    } else {
      stopped = true; // preserve order: once one doesn't fit, the rest carry over
      carryOver.push(d);
    }
  }

  const resume: number[] = [];
  for (const d of placed) for (let i = 0; i < dur[d]!; i++) resume.push(d);

  const idle = L - prefix.length - leaveInYear - resume.length;
  const inYear = [
    ...prefix,
    ...new Array<number>(leaveInYear).fill(LEAVE),
    ...resume,
    ...new Array<number>(Math.max(0, idle)).fill(LEAVE),
  ].slice(0, L);

  const out: InternSchedule[] = internSchedules.map((s) =>
    s.id === internId ? { id: s.id, schedule: inYear } : { id: s.id, schedule: s.schedule },
  );

  return {
    internSchedules: out,
    weekDeptCount: buildWeekDeptCount(departments, out, L),
    yearWeeks: L,
    affectedInternId: internId,
    resumedDept: placed.length > 0 ? placed[0]! : null,
    carryOver,
    leaveStart: startWeek,
    leaveEnd: startWeek + leaveInYear - 1,
  };
}

/**
 * Lay out a carry-over intern's remaining departments for the NEXT batch:
 * contiguous full blocks from week 0, idle (LEAVE) for the rest of the year.
 * The intern finishes early — exactly what "people with only certain weeks"
 * means in the new batch.
 */
export function carryOverSchedule(
  departments: Department[],
  carryOver: number[],
  yearWeeks: number,
): number[] {
  const dur = durations(departments);
  const out: number[] = [];
  for (const d of carryOver) {
    if (d < 0 || d >= departments.length) continue;
    for (let i = 0; i < dur[d]!; i++) out.push(d);
  }
  while (out.length < yearWeeks) out.push(LEAVE);
  return out.slice(0, yearWeeks);
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
 * Coverage re-validation, skipping LEAVE/idle weeks. Flags any (week, dept)
 * below its minCoverage across the longest schedule provided.
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
