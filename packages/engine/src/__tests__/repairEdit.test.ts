import { test } from "node:test";
import assert from "node:assert/strict";
import { generate } from "../generate.js";
import { repairEdit, validateInternSchedule, proposeSwap } from "../repairEdit.js";
import { NMC_CRMI_2021 } from "../presets.js";
import type { Config } from "../types.js";

const config: Config = { n: 135, departments: NMC_CRMI_2021.departments };

test("swapping two interns' full rotations stays valid (coverage-neutral)", () => {
  const res = generate({ ...config, seed: 42 });
  const edits = proposeSwap(res.internSchedules, 1, 2);
  const r = repairEdit(config, res.internSchedules, edits);
  assert.equal(r.ok, true, `expected valid, got ${r.violations.length} violations`);
  // The swapped interns now carry each other's schedules.
  const a = res.internSchedules.find((s) => s.id === 1)!;
  const b = res.internSchedules.find((s) => s.id === 2)!;
  const na = r.applied.find((s) => s.id === 1)!;
  const nb = r.applied.find((s) => s.id === 2)!;
  assert.deepEqual(na.schedule, b.schedule);
  assert.deepEqual(nb.schedule, a.schedule);
});

test("repairEdit does not mutate the input roster", () => {
  const res = generate({ ...config, seed: 7 });
  const snapshot = JSON.stringify(res.internSchedules);
  repairEdit(config, res.internSchedules, proposeSwap(res.internSchedules, 1, 3));
  assert.equal(JSON.stringify(res.internSchedules), snapshot);
});

test("a structurally broken edit (non-contiguous) is rejected", () => {
  const res = generate({ ...config, seed: 1 });
  const TW = res.stats.totalWeeks;
  // Build an illegal schedule: alternate two departments (non-contiguous).
  const broken = Array.from({ length: TW }, (_, w) => (w % 2 === 0 ? 0 : 1));
  const r = repairEdit(config, res.internSchedules, [
    { internId: 1, newSchedule: broken },
  ]);
  assert.equal(r.ok, false);
  assert.ok(r.violations.length > 0);
});

test("validateInternSchedule accepts a generated schedule and rejects a too-short one", () => {
  const res = generate({ ...config, seed: 5 });
  const good = res.internSchedules[0]!.schedule;
  assert.equal(validateInternSchedule(config, good).length, 0);
  assert.ok(validateInternSchedule(config, good.slice(0, -1)).length > 0);
});

test("unknown intern id is reported and makes the edit invalid", () => {
  const res = generate({ ...config, seed: 2 });
  const r = repairEdit(config, res.internSchedules, [
    { internId: 99999, newSchedule: res.internSchedules[0]!.schedule },
  ]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.unknownInternIds, [99999]);
});

test("a swap that drops a department's coverage below its minimum is rejected", () => {
  // Tiny roster where removing an intern's correct path breaks coverage.
  const tiny: Config = {
    n: 4,
    departments: [
      { name: "A", weeks: 1, minCoverage: 2 },
      { name: "B", weeks: 1, minCoverage: 2 },
    ],
  };
  const res = generate({ ...tiny, seed: 3 });
  // Force both edited interns into the SAME path so dept coverage collapses.
  const onePath = res.internSchedules[0]!.schedule;
  const r = repairEdit(tiny, res.internSchedules, [
    { internId: res.internSchedules[1]!.id, newSchedule: [...onePath] },
    { internId: res.internSchedules[2]!.id, newSchedule: [...onePath] },
    { internId: res.internSchedules[3]!.id, newSchedule: [...onePath] },
  ]);
  // Now everyone is on the same path → the other ordering's weeks lose coverage.
  assert.equal(r.ok, false);
});
