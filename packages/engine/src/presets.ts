// Built-in configuration presets. Pure data — no runtime dependencies.
//
// The NMC CRMI 2021 template encodes the Compulsory Rotating Medical Internship
// department/duration layout used by the original rotation_planner app (a full
// 52-week internship year). Durations are ported verbatim from the proven
// DEFAULT_DEPTS in _source/rotation_planner.jsx.
//
// NOTE FOR MEELA (verification needed): the exact week split per department in
// the official NMC CRMI 2021 regulation should be confirmed against the current
// regulation text before this is marketed as the "official" preset. The split
// below is the one the existing working app shipped with and sums to a correct
// 52-week year; treat the per-department weeks as a sensible default, not a
// certified citation. Tracked as a "needs Meela" item in PROGRESS.md.

import type { Department } from "./types.js";

export interface Preset {
  /** Stable identifier used by the API (POST /configs accepts a preset id). */
  id: string;
  /** Human-readable name shown in the UI. */
  name: string;
  /** Short description / provenance note. */
  description: string;
  /** Total weeks (sum of department weeks) — convenience, must equal the sum. */
  totalWeeks: number;
  departments: Department[];
}

/**
 * NMC CRMI 2021 — Compulsory Rotating Medical Internship.
 * 17 departments, 52 weeks total. minCoverage left at the engine default (2)
 * for every department; tenants raise individual thresholds (e.g. Casualty) as
 * their hospital requires.
 */
export const NMC_CRMI_2021: Preset = {
  id: "nmc-crmi-2021",
  name: "NMC CRMI 2021",
  description:
    "Compulsory Rotating Medical Internship (India), 52-week year, 17 departments. Durations from the standard rotation layout; confirm against current NMC regulation text before relying on them officially.",
  totalWeeks: 52,
  departments: [
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
  ],
};

export const PRESETS: readonly Preset[] = [NMC_CRMI_2021];

/** Look up a preset by id. Returns undefined if not found. */
export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
