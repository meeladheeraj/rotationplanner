import { test } from "node:test";
import assert from "node:assert/strict";
import { generate } from "../generate.js";
import { validate } from "../validate.js";
import { analyzeFeasibility } from "../feasibility.js";
import { mulberry32 } from "../rng.js";
import type { Department } from "../types.js";

const NMC_DEPTS: Department[] = [
  { name: "General Surgery", weeks: 12 },
  { name: "Orthopaedics", weeks: 6 },
  { name: "ENT", weeks: 2 },
  { name: "Ophthalmology", weeks: 3 },
  { name: "OB-GYN", weeks: 6 },
  { name: "Dermatology", weeks: 2 },
  { name: "Internal Medicine", weeks: 7 },
  { name: "Paediatrics", weeks: 2 },
  { name: "Psychiatry", weeks: 2 },
  { name: "Radiology", weeks: 1 },
  { name: "Anaesthesia", weeks: 1 },
  { name: "Pathology", weeks: 2 },
  { name: "Community Med", weeks: 2 },
  { name: "Forensic Med", weeks: 1 },
  { name: "Casualty", weeks: 1 },
  { name: "Blood Bank", weeks: 1 },
  { name: "Emergency Med", weeks: 1 },
];

test("generates a valid schedule for the default NMC config (N=135)", () => {
  const res = generate({ n: 135, departments: NMC_DEPTS, seed: 42 });
  assert.equal(res.stats.totalWeeks, 52);
  assert.ok(res.internSchedules.length === 135);
  const v = validate({ n: 135, departments: NMC_DEPTS }, res.internSchedules);
  assert.equal(v.ok, true, `expected valid, got ${v.violations.length} violations`);
  assert.ok(res.stats.minCount >= 2, `minCount ${res.stats.minCount} < 2`);
});

test("is deterministic for a fixed seed", () => {
  const a = generate({ n: 60, departments: NMC_DEPTS, seed: 7 });
  const b = generate({ n: 60, departments: NMC_DEPTS, seed: 7 });
  assert.deepEqual(a.internSchedules, b.internSchedules);
});

test("respects elevated per-department minCoverage", () => {
  const depts = NMC_DEPTS.map((d) =>
    d.name === "Casualty" ? { ...d, minCoverage: 5 } : d,
  );
  const res = generate({ n: 300, departments: depts, seed: 1 });
  const casualty = depts.findIndex((d) => d.name === "Casualty");
  for (let w = 0; w < res.stats.totalWeeks; w++) {
    assert.ok(
      res.weekDeptCount[w]![casualty]! >= 5,
      `week ${w} casualty coverage ${res.weekDeptCount[w]![casualty]} < 5`,
    );
  }
});

test("property: 200 random configs always produce structurally valid (contiguous) schedules", () => {
  // The 3-phase algorithm GUARANTEES structural validity — every intern gets each
  // department exactly once as a single contiguous block of the right duration.
  // It does NOT guarantee full COVERAGE: a (week, dept) cell can be structurally
  // uncoverable for some duration sets (a department block can only start where a
  // subset of the other blocks exactly fills the preceding weeks — see
  // analyzeFeasibility). So we split the metric in two:
  //   * structural validity (contiguity/duration) — a HARD invariant, asserted.
  //   * coverage — measured separately for FEASIBLE vs INFEASIBLE configs.
  // The earlier "~130/200 shortfall" figure was misleading: it was dominated by
  // structurally infeasible configs, not by repair quality.
  const rng = mulberry32(12345);
  let feasibleConfigs = 0;
  let feasibleShortfalls = 0;
  let infeasibleConfigs = 0;
  for (let i = 0; i < 200; i++) {
    const m = 4 + Math.floor(rng() * 8); // 4–11 departments
    const departments: Department[] = Array.from({ length: m }, (_, d) => ({
      name: `D${d}`,
      weeks: 1 + Math.floor(rng() * 6),
    }));
    const minDur = Math.min(...departments.map((d) => d.weeks));
    const tw = departments.reduce((a, d) => a + d.weeks, 0);
    const minN = Math.ceil((2 * tw) / minDur);
    const n = minN + Math.floor(rng() * 40);
    const res = generate({ n, departments, seed: i });
    const v = validate({ n, departments }, res.internSchedules);
    // A structural (contiguity/duration) violation is encoded with required === -1
    // or week === -1; assert none of those ever occur.
    const structural = v.violations.filter((x) => x.required === -1 || x.week === -1);
    assert.equal(
      structural.length,
      0,
      `config ${i} (n=${n}, m=${m}) had ${structural.length} STRUCTURAL violations`,
    );

    const feasible = analyzeFeasibility({ n, departments });
    // The reported uncoverableCells stat must match the feasibility analysis.
    assert.equal(res.stats.uncoverableCells, feasible.uncoverable.length);
    if (feasible.ok) {
      feasibleConfigs++;
      if (!v.ok) feasibleShortfalls++;
    } else {
      infeasibleConfigs++;
    }
  }
  console.log(
    `[metric] coverage shortfalls among FEASIBLE configs: ${feasibleShortfalls}/${feasibleConfigs}` +
      ` (structurally infeasible, excluded: ${infeasibleConfigs}/200)`,
  );
  // Among genuinely feasible configs the heuristic repair should leave very few
  // shortfalls. Generous bound so the test is stable, but it would have FAILED at
  // the old "130/200" interpretation — proving the metric is now meaningful.
  assert.ok(
    feasibleShortfalls <= Math.ceil(feasibleConfigs * 0.2),
    `too many shortfalls on feasible configs: ${feasibleShortfalls}/${feasibleConfigs}`,
  );
});
