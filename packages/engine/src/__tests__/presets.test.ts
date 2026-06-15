import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS, NMC_CRMI_2021, getPreset } from "../presets.js";
import { generate } from "../generate.js";
import { validate } from "../validate.js";

test("NMC CRMI 2021 preset sums to its declared totalWeeks (52)", () => {
  const sum = NMC_CRMI_2021.departments.reduce((a, d) => a + d.weeks, 0);
  assert.equal(sum, NMC_CRMI_2021.totalWeeks);
  assert.equal(sum, 52);
});

test("NMC CRMI 2021 preset has 17 departments with positive durations", () => {
  assert.equal(NMC_CRMI_2021.departments.length, 17);
  for (const d of NMC_CRMI_2021.departments) {
    assert.ok(d.weeks >= 1, `${d.name} must have >= 1 week`);
    assert.ok(d.name.length > 0);
  }
});

test("getPreset resolves a known id and rejects unknown ids", () => {
  assert.equal(getPreset("nmc-crmi-2021"), NMC_CRMI_2021);
  assert.equal(getPreset("does-not-exist"), undefined);
});

test("preset ids are unique", () => {
  const ids = PRESETS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("the NMC preset generates a fully valid schedule at a realistic N", () => {
  const res = generate({ n: 135, departments: NMC_CRMI_2021.departments, seed: 42 });
  const v = validate({ n: 135, departments: NMC_CRMI_2021.departments }, res.internSchedules);
  assert.equal(v.ok, true, `expected valid, got ${v.violations.length} violations`);
});
