import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeFeasibility, countUncoverableCells } from "../feasibility.js";
import { NMC_CRMI_2021 } from "../presets.js";
import { generate } from "../generate.js";
import { validate } from "../validate.js";
import type { Config } from "../types.js";

test("the NMC CRMI 2021 preset is fully feasible (no uncoverable cells)", () => {
  const r = analyzeFeasibility({ n: 1, departments: NMC_CRMI_2021.departments });
  assert.equal(r.ok, true);
  assert.equal(r.uncoverable.length, 0);
  assert.equal(r.affectedDepts.length, 0);
});

test("detects genuinely uncoverable cells from incompatible durations", () => {
  // Departments A=2, B=4 (total 6 weeks). A's 2-week block can only start where a
  // subset of {4} fills the preceding weeks → start 0 (covers 0,1) or start 4
  // (covers 4,5). So A can NEVER staff weeks 2 or 3 — those cells are structurally
  // uncoverable. B=4 can start at 0 or 2, so B covers every week.
  const config: Config = {
    n: 6,
    departments: [
      { name: "A", weeks: 2 },
      { name: "B", weeks: 4 },
    ],
  };
  const r = analyzeFeasibility(config);
  assert.equal(r.ok, false);
  assert.ok(r.uncoverable.some((c) => c.dept === 0 && c.week === 2));
  assert.ok(r.uncoverable.some((c) => c.dept === 0 && c.week === 3));
  // B is fully coverable → not in the affected set.
  assert.deepEqual(r.affectedDepts, [0]);
});

test("a single department is always fully coverable", () => {
  const r = analyzeFeasibility({ n: 3, departments: [{ name: "Solo", weeks: 5 }] });
  assert.equal(r.ok, true);
});

test("equal-duration department sets are always fully feasible", () => {
  // When every block has the same length L, the other blocks' subset-sums are
  // exactly the multiples of L, and any length-L window contains exactly one such
  // multiple — so every cell is coverable. (A unit-length department does NOT, by
  // contrast, guarantee feasibility.)
  for (const L of [1, 2, 3, 4]) {
    const config: Config = {
      n: 10,
      departments: ["A", "B", "C", "D", "E"].map((name) => ({ name, weeks: L })),
    };
    const r = analyzeFeasibility(config);
    assert.equal(r.ok, true, `L=${L} should be feasible`);
    assert.equal(countUncoverableCells(config), 0);
  }
});

test("on a feasible config the generator achieves full coverage with enough interns", () => {
  // Equal durations → provably feasible.
  const config: Config = {
    n: 40,
    departments: [
      { name: "A", weeks: 2 },
      { name: "B", weeks: 2 },
      { name: "C", weeks: 2 },
      { name: "D", weeks: 2 },
    ],
  };
  assert.equal(analyzeFeasibility(config).ok, true);
  const res = generate({ ...config, seed: 11 });
  const v = validate(config, res.internSchedules);
  assert.equal(v.ok, true, `expected valid, got ${v.violations.length} violations`);
  assert.equal(res.stats.uncoverableCells, 0);
});
