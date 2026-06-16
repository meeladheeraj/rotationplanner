import type { Department, GenerateResult, InternSchedule, ScheduleStats } from "@rp/engine";

/** Minimal persisted shape needed to rebuild an engine result. */
export interface ReconstructableAssignment {
  internIndex: number;
  rotation: { dept: number; start: number; end: number }[];
}

/**
 * Rebuild an engine `GenerateResult` from persisted assignment blocks + stats so
 * the existing `ScheduleViews` (timeline / heatmap / cards / by-department) render
 * exactly as they do for a freshly-generated result. Shared by the authenticated
 * in-app View route (FEEDBACK #4) and the public read-only share view (FEEDBACK #6).
 */
export function reconstructResult(
  assignments: ReconstructableAssignment[],
  departments: Department[],
  stats: ScheduleStats,
): GenerateResult {
  const totalWeeks = stats.totalWeeks;
  const deptCount = departments.length;

  const internSchedules: InternSchedule[] = assignments.map((a) => {
    const schedule = new Array<number>(totalWeeks).fill(-1);
    for (const blk of a.rotation) {
      for (let w = blk.start; w <= blk.end && w < totalWeeks; w++) {
        if (w >= 0) schedule[w] = blk.dept;
      }
    }
    return { id: a.internIndex, schedule };
  });

  const weekDeptCount: number[][] = Array.from({ length: totalWeeks }, () =>
    new Array<number>(deptCount).fill(0),
  );
  for (const { schedule } of internSchedules) {
    for (let w = 0; w < totalWeeks; w++) {
      const d = schedule[w];
      if (d !== undefined && d >= 0 && d < deptCount) weekDeptCount[w]![d]! += 1;
    }
  }

  return { internSchedules, weekDeptCount, stats };
}
