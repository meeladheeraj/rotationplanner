// Structural feasibility analysis. Independent of how many interns there are.
//
// Because every intern does each department exactly once as a single contiguous
// block, a department `d` can only START at a week `s` if some subset of the
// OTHER departments' blocks exactly fills weeks 0..s-1 (whole blocks, no
// splitting). Consequently a cell (week w, dept d) is *coverable* only if `d`
// can be placed so its block spans week w — i.e. there is a valid start
// s ∈ [max(0, w − dur[d] + 1), w] that is reachable as a subset-sum of the
// other departments' durations.
//
// If a cell is NOT coverable, NO valid schedule can ever staff that department
// in that week, regardless of intern count or scheduling effort. This is a
// property of the department DURATIONS alone. Surfacing it lets the product warn
// the planner ("with these block lengths, Radiology can never be staffed in
// weeks 1, 3, 5…") instead of silently producing a schedule with permanent gaps.
//
// Pure & dependency-free.

import type { Config } from "./types.js";

export interface UncoverableCell {
  week: number;
  dept: number;
}

export interface FeasibilityResult {
  /** True when every (week, dept) cell is structurally coverable. */
  ok: boolean;
  /** Cells that no valid contiguous rotation can ever cover. */
  uncoverable: UncoverableCell[];
  /** Department indices that have at least one uncoverable week. */
  affectedDepts: number[];
}

/**
 * Determine which (week, dept) cells are impossible to cover given the
 * department durations. O(M · totalWeeks) after an O(M · totalWeeks) subset-sum.
 */
export function analyzeFeasibility(config: Config): FeasibilityResult {
  const dur = config.departments.map((d) => d.weeks);
  const M = dur.length;
  const TW = dur.reduce((a, b) => a + b, 0);
  const uncoverable: UncoverableCell[] = [];
  const affected = new Set<number>();

  for (let d = 0; d < M; d++) {
    // Reachable subset-sums of the OTHER departments' durations.
    let totOther = 0;
    for (let i = 0; i < M; i++) if (i !== d) totOther += dur[i]!;
    const reach = new Uint8Array(totOther + 1);
    reach[0] = 1;
    for (let i = 0; i < M; i++) {
      if (i === d) continue;
      const x = dur[i]!;
      for (let s = totOther; s >= x; s--) if (reach[s - x]) reach[s] = 1;
    }
    for (let w = 0; w < TW; w++) {
      const lo = Math.max(0, w - dur[d]! + 1);
      const hi = Math.min(w, totOther);
      let coverable = false;
      for (let s = lo; s <= hi; s++)
        if (reach[s]) {
          coverable = true;
          break;
        }
      if (!coverable) {
        uncoverable.push({ week: w, dept: d });
        affected.add(d);
      }
    }
  }

  return {
    ok: uncoverable.length === 0,
    uncoverable,
    affectedDepts: [...affected].sort((a, b) => a - b),
  };
}

/** Convenience: number of structurally uncoverable cells for a config. */
export function countUncoverableCells(config: Config): number {
  return analyzeFeasibility(config).uncoverable.length;
}
