// Server-authoritative validation: every published schedule must pass this.
// Checks (a) contiguity — each department appears as a single contiguous block
// of the correct duration, and (b) per-department minimum coverage every week.

import type {
  Config,
  InternSchedule,
  ValidationResult,
  Violation,
} from "./types.js";
import { schedToBlocks } from "./generate.js";

const DEFAULT_MIN_COVERAGE = 2;

export function validate(
  config: Config,
  internSchedules: InternSchedule[],
): ValidationResult {
  const depts = config.departments;
  const M = depts.length;
  const dur = depts.map((d) => d.weeks);
  const minCov = depts.map((d) => d.minCoverage ?? DEFAULT_MIN_COVERAGE);
  const TW = dur.reduce((a, b) => a + b, 0);
  const violations: Violation[] = [];

  // (a) Contiguity + correct durations per intern.
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

  // (b) Per-department weekly coverage.
  const weekDeptCount: number[][] = Array.from({ length: TW }, () =>
    new Array<number>(M).fill(0),
  );
  for (const { schedule } of internSchedules)
    for (let w = 0; w < TW; w++) weekDeptCount[w]![schedule[w]!]!++;

  for (let w = 0; w < TW; w++)
    for (let d = 0; d < M; d++) {
      const c = weekDeptCount[w]![d]!;
      if (c < minCov[d]!) {
        violations.push({ week: w, dept: d, count: c, required: minCov[d]! });
      }
    }

  return { ok: violations.length === 0, violations };
}
