// Manual-edit validation. When a planner manually changes an intern's rotation
// (or swaps two interns' rotations), the server must re-run the engine to confirm
// the whole roster is still legal before persisting. This module applies a set of
// proposed edits to a copy of the roster and returns the resulting violations.
//
// Pure & side-effect-free: never mutates the input arrays.

import type {
  Config,
  InternSchedule,
  ValidationResult,
  Violation,
} from "./types.js";
import { validate } from "./validate.js";
import { schedToBlocks } from "./generate.js";

/** A proposed replacement of one intern's full-year per-week schedule. */
export interface RotationEdit {
  /** InternSchedule.id to replace. */
  internId: number;
  /** New per-week department index array (length must equal total weeks). */
  newSchedule: number[];
}

export interface RepairEditResult extends ValidationResult {
  /** The roster after applying the edits (new array; inputs untouched). */
  applied: InternSchedule[];
  /** Edits that referenced an intern id not present in the roster. */
  unknownInternIds: number[];
}

/**
 * Check a single intern schedule is structurally legal on its own:
 * correct length, each department appears exactly once, as one contiguous block
 * of the correct duration. Returns the violations (empty === valid).
 */
export function validateInternSchedule(
  config: Config,
  schedule: number[],
  internId = -1,
): Violation[] {
  const depts = config.departments;
  const M = depts.length;
  const dur = depts.map((d) => d.weeks);
  const TW = dur.reduce((a, b) => a + b, 0);
  const out: Violation[] = [];

  if (schedule.length !== TW) {
    out.push({ week: -1, dept: -1, count: schedule.length, required: TW });
    return out;
  }
  for (const w of schedule) {
    if (w < 0 || w >= M || !Number.isInteger(w)) {
      out.push({ week: -1, dept: w, count: -internId, required: -1 });
      return out;
    }
  }
  const blocks = schedToBlocks(schedule);
  const seen = new Set<number>();
  for (const blk of blocks) {
    if (seen.has(blk.dept)) {
      out.push({ week: blk.start, dept: blk.dept, count: -internId, required: -1 });
    }
    seen.add(blk.dept);
    const span = blk.end - blk.start + 1;
    if (span !== dur[blk.dept]) {
      out.push({ week: blk.start, dept: blk.dept, count: span, required: dur[blk.dept]! });
    }
  }
  // Every department must appear exactly once.
  if (seen.size !== M) {
    for (let d = 0; d < M; d++)
      if (!seen.has(d)) out.push({ week: -1, dept: d, count: 0, required: dur[d]! });
  }
  return out;
}

/**
 * Apply a set of manual edits to the roster and validate the result.
 * Validates both each edited schedule's own structure AND the whole roster's
 * per-department weekly coverage.
 */
export function repairEdit(
  config: Config,
  internSchedules: InternSchedule[],
  edits: RotationEdit[],
): RepairEditResult {
  const byId = new Map(internSchedules.map((s) => [s.id, s]));
  const unknownInternIds: number[] = [];
  const structural: Violation[] = [];

  // Build the post-edit roster without mutating inputs.
  const editMap = new Map<number, number[]>();
  for (const e of edits) {
    if (!byId.has(e.internId)) {
      unknownInternIds.push(e.internId);
      continue;
    }
    editMap.set(e.internId, e.newSchedule);
    structural.push(...validateInternSchedule(config, e.newSchedule, e.internId));
  }

  const applied: InternSchedule[] = internSchedules.map((s) =>
    editMap.has(s.id) ? { id: s.id, schedule: [...editMap.get(s.id)!] } : s,
  );

  const coverage = validate(config, applied);
  const violations = [...structural, ...coverage.violations];

  return {
    ok: violations.length === 0 && unknownInternIds.length === 0,
    violations,
    applied,
    unknownInternIds,
  };
}

/**
 * Convenience: produce the two edits that exchange the full-year rotations of
 * two interns. Exchanging whole permutations is coverage-neutral (the multiset
 * of schedules is unchanged) and always valid, but it lets a planner reassign
 * which physical intern follows which path. For a coverage-changing edit, build
 * RotationEdit objects with bespoke newSchedule arrays and pass them to
 * repairEdit directly.
 */
export function proposeSwap(
  internSchedules: InternSchedule[],
  idA: number,
  idB: number,
): RotationEdit[] {
  const a = internSchedules.find((s) => s.id === idA);
  const b = internSchedules.find((s) => s.id === idB);
  if (!a || !b) return [];
  return [
    { internId: idA, newSchedule: [...b.schedule] },
    { internId: idB, newSchedule: [...a.schedule] },
  ];
}
