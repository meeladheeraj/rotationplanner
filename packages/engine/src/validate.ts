// Server-authoritative validation: every published schedule must pass this.
// Checks (a) contiguity — each department appears as a single contiguous block
// of the correct duration, and (b) per-department minimum coverage every week.
//
// The two concerns are separable: `validateStructure` checks ONLY (a), and
// `validate` checks both. A structurally-broken roster is corrupt data and must
// never be persisted; a structurally-sound roster that merely falls below a
// department's `minCoverage` is a legitimate DRAFT (it can be saved and surfaced)
// and is only rejected at PUBLISH time.

import type {
  Config,
  InternSchedule,
  ValidationResult,
  Violation,
} from "./types.js";
import { schedToBlocks } from "./generate.js";

const DEFAULT_MIN_COVERAGE = 2;

/** Structural violations only: per-intern contiguity + correct block durations. */
function structuralViolations(
  config: Config,
  internSchedules: InternSchedule[],
): Violation[] {
  const depts = config.departments;
  const dur = depts.map((d) => d.weeks);
  const TW = dur.reduce((a, b) => a + b, 0);
  const violations: Violation[] = [];

  for (const { id, schedule } of internSchedules) {
    if (schedule.length !== TW) {
      violations.push({ week: -1, dept: -1, count: schedule.length, required: TW });
      continue;
    }
    const blocks = schedToBlocks(schedule);
    const seenDepts = new Set<number>();
    for (const blk of blocks) {
      if (seenDepts.has(blk.dept)) {
        // department appears more than once → not contiguous
        violations.push({ week: blk.start, dept: blk.dept, count: -id, required: -1 });
      }
      seenDepts.add(blk.dept);
      const span = blk.end - blk.start + 1;
      if (span !== dur[blk.dept]) {
        violations.push({
          week: blk.start,
          dept: blk.dept,
          count: span,
          required: dur[blk.dept]!,
        });
      }
    }
  }
  return violations;
}

/** Coverage violations only: each (week, dept) below its minCoverage. */
function coverageViolations(
  config: Config,
  internSchedules: InternSchedule[],
): Violation[] {
  const depts = config.departments;
  const M = depts.length;
  const dur = depts.map((d) => d.weeks);
  const minCov = depts.map((d) => d.minCoverage ?? DEFAULT_MIN_COVERAGE);
  const TW = dur.reduce((a, b) => a + b, 0);
  const violations: Violation[] = [];

  const weekDeptCount: number[][] = Array.from({ length: TW }, () =>
    new Array<number>(M).fill(0),
  );
  for (const { schedule } of internSchedules)
    for (let w = 0; w < TW; w++) {
      const d = schedule[w]!;
      if (d >= 0 && d < M) weekDeptCount[w]![d]!++;
    }

  for (let w = 0; w < TW; w++)
    for (let d = 0; d < M; d++) {
      const c = weekDeptCount[w]![d]!;
      if (c < minCov[d]!) {
        violations.push({ week: w, dept: d, count: c, required: minCov[d]! });
      }
    }
  return violations;
}

/**
 * Structural-only validation (contiguity + durations). A roster that fails this
 * is corrupt and must NEVER be persisted, regardless of draft/publish status.
 */
export function validateStructure(
  config: Config,
  internSchedules: InternSchedule[],
): ValidationResult {
  const violations = structuralViolations(config, internSchedules);
  return { ok: violations.length === 0, violations };
}

/**
 * Full validation: structural AND per-department weekly coverage. Required to
 * PUBLISH a schedule (an immutable, distributed roster must be fully staffed).
 */
export function validate(
  config: Config,
  internSchedules: InternSchedule[],
): ValidationResult {
  const violations = [
    ...structuralViolations(config, internSchedules),
    ...coverageViolations(config, internSchedules),
  ];
  return { ok: violations.length === 0, violations };
}
