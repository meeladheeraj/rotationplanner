import { test } from "node:test";
import assert from "node:assert/strict";
import { generate } from "../generate.js";
import { validate, validateStructure } from "../validate.js";
import type { Config } from "../types.js";

// A small, fully-feasible config: 3 depts, durations 2/2/1 → 5-week year.
const CFG: Config = {
  n: 10,
  seed: 1,
  departments: [
    { name: "A", weeks: 2, minCoverage: 2 },
    { name: "B", weeks: 2, minCoverage: 2 },
    { name: "C", weeks: 1, minCoverage: 2 },
  ],
};

test("validateStructure passes a generated roster (structure is always sound)", () => {
  const gen = generate(CFG);
  const r = validateStructure(CFG, gen.internSchedules);
  assert.equal(r.ok, true, "generated rosters are structurally valid");
  assert.equal(r.violations.length, 0);
});

test("a below-minimum roster is structurally valid but fails full validate", () => {
  // Too few interns to staff every dept ≥2 every week, but each intern's
  // rotation is still a legal contiguous year.
  const small: Config = { ...CFG, n: 2 };
  const gen = generate(small);

  const structure = validateStructure(small, gen.internSchedules);
  assert.equal(structure.ok, true, "structure holds even when understaffed");

  const full = validate(small, gen.internSchedules);
  assert.equal(full.ok, false, "coverage shortfall makes full validate fail");
  assert.ok(
    full.violations.length > 0 && full.violations.every((v) => v.week >= 0 && v.dept >= 0),
    "the only failures are coverage (week/dept >= 0), not structural",
  );
});

test("validateStructure catches a broken (non-contiguous) schedule", () => {
  const gen = generate(CFG);
  const broken = gen.internSchedules.map((s) => ({ ...s, schedule: [...s.schedule] }));
  // Corrupt intern 0: drop the last week (now length is wrong → structural).
  broken[0]!.schedule = broken[0]!.schedule.slice(0, -1);

  const r = validateStructure(CFG, broken);
  assert.equal(r.ok, false, "a malformed schedule is structurally invalid");
});
