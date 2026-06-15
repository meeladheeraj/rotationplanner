// Core domain types for the rotation scheduling engine.
// Pure data — no runtime dependencies.

export interface Department {
  /** Display name, e.g. "General Surgery". */
  name: string;
  /** Contiguous duration in weeks for this department block. */
  weeks: number;
  /**
   * Minimum number of interns that must be present in this department every week.
   * Upgrade over the original global ">= 2" rule. Defaults to 2 when unset.
   */
  minCoverage?: number;
}

export interface Config {
  /** Number of interns to schedule. */
  n: number;
  departments: Department[];
  /** Optional RNG seed for deterministic, reproducible generation. */
  seed?: number;
}

/** A single contiguous assignment block within an intern's year. */
export interface Block {
  /** Index into Config.departments. */
  dept: number;
  /** Zero-based inclusive start week. */
  start: number;
  /** Zero-based inclusive end week. */
  end: number;
}

export interface InternSchedule {
  id: number;
  /** Per-week department index, length === totalWeeks. */
  schedule: number[];
}

export interface ScheduleStats {
  totalWeeks: number;
  minCount: number;
  maxCount: number;
  theoreticalMinN: number;
  candidateCount: number;
}

export interface GenerateResult {
  internSchedules: InternSchedule[];
  /** weekDeptCount[week][dept] = number of interns in dept that week. */
  weekDeptCount: number[][];
  stats: ScheduleStats;
}

export interface Violation {
  week: number;
  dept: number;
  count: number;
  required: number;
}

export interface ValidationResult {
  ok: boolean;
  violations: Violation[];
}
