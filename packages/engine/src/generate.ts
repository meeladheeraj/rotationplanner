// Schedule generation — ported from the original rotation_planner.jsx (3-phase
// algorithm) and generalized to support per-department minimum coverage.
//
// Phase 1: build a diverse candidate set of full-year rotation permutations.
// Phase 2: greedily assign each intern the candidate that best covers the
//          currently least-covered (week, dept) cells.
// Phase 3: repair pass — swap assignments to lift any (week, dept) below its
//          required minimum coverage, without dropping another cell below its min.

import type { Config, GenerateResult, InternSchedule } from "./types.js";
import { mulberry32, shuffleArr, type Rng } from "./rng.js";

const DEFAULT_MIN_COVERAGE = 2;

function permToSched(perm: number[], dur: number[]): number[] {
  const s: number[] = [];
  for (const d of perm) for (let k = 0; k < dur[d]!; k++) s.push(d);
  return s;
}

function buildPermForDeptAt(
  td: number,
  tw: number,
  M: number,
  dur: number[],
  rng: Rng,
): number[] | null {
  const others: number[] = [];
  for (let d = 0; d < M; d++) if (d !== td) others.push(d);
  if (tw === 0) return [td, ...shuffleArr(others, rng)];
  const totOther = others.reduce((s, d) => s + dur[d]!, 0);
  if (tw > totOther) return null;
  const dp: (number[] | null)[] = new Array(tw + 1).fill(null);
  dp[0] = [];
  for (let i = 0; i < others.length; i++) {
    const dd = dur[others[i]!]!;
    for (let s = tw; s >= dd; s--) {
      if (dp[s] === null && dp[s - dd] !== null) dp[s] = [...dp[s - dd]!, others[i]!];
    }
  }
  if (dp[tw] === null) return null;
  const bSet = new Set(dp[tw]!);
  return [
    ...shuffleArr(dp[tw]!, rng),
    td,
    ...shuffleArr(others.filter((d) => !bSet.has(d)), rng),
  ];
}

export function generate(config: Config): GenerateResult {
  const { n: N, departments: depts } = config;
  const M = depts.length;
  const dur = depts.map((d) => d.weeks);
  const minCov = depts.map((d) => d.minCoverage ?? DEFAULT_MIN_COVERAGE);
  const TW = dur.reduce((a, b) => a + b, 0);
  const rng = mulberry32(config.seed ?? 42);

  // Generalized theoretical minimum N: max over departments of the interns
  // needed to keep that department at its own required coverage all year.
  let theoreticalMinN = 0;
  for (let d = 0; d < M; d++) {
    theoreticalMinN = Math.max(theoreticalMinN, Math.ceil((minCov[d]! * TW) / dur[d]!));
  }

  // ── Phase 1: candidate permutations ──
  const seen = new Set<string>();
  const cands: number[][] = [];
  const add = (p: number[]) => {
    const k = p.join(",");
    if (!seen.has(k)) {
      seen.add(k);
      cands.push(permToSched(p, dur));
    }
  };
  for (let s = 0; s < M; s++) add(Array.from({ length: M }, (_, j) => (s + j) % M));
  for (let s = 0; s < M; s++)
    add(Array.from({ length: M }, (_, j) => (((s - j) % M) + M) % M));
  for (let d = 0; d < M; d++)
    for (let w = 0; w <= TW - dur[d]!; w++)
      for (let a = 0; a < 2; a++) {
        const p = buildPermForDeptAt(d, w, M, dur, rng);
        if (p) add(p);
      }
  const base = Array.from({ length: M }, (_, i) => i);
  for (let i = 0; i < Math.max(500, N * 3); i++) add(shuffleArr(base, rng));

  // ── Phase 2: greedy assignment over least-covered cells ──
  const allWD = TW * M;
  const cs = cands.map((sc) => {
    const set = new Set<number>();
    for (let w = 0; w < TW; w++) set.add(w * M + sc[w]!);
    return set;
  });
  const counts = new Int32Array(allWD);
  const asn = new Int32Array(cands.length);
  const ia = new Int32Array(N);

  for (let intern = 0; intern < N; intern++) {
    let mv = Infinity;
    for (let i = 0; i < allWD; i++) if (counts[i]! < mv) mv = counts[i]!;
    const mp = new Set<number>();
    for (let i = 0; i < allWD; i++) if (counts[i] === mv) mp.add(i);
    let bi = 0,
      bs = -1,
      bt = Infinity;
    for (let ci = 0; ci < cands.length; ci++) {
      let sc = 0;
      for (const k of cs[ci]!) if (mp.has(k)) sc++;
      if (sc > bs || (sc === bs && asn[ci]! < bt)) {
        bs = sc;
        bi = ci;
        bt = asn[ci]!;
      }
    }
    asn[bi]!++;
    for (const k of cs[bi]!) counts[k]!++;
    ia[intern] = bi;
  }

  // ── Phase 3: repair pass for per-department minimum coverage ──
  const deptOf = (k: number) => k % M;
  const below = (k: number) => counts[k]! < minCov[deptOf(k)]!;

  let needsRepair = false;
  for (let i = 0; i < allWD; i++)
    if (below(i)) {
      needsRepair = true;
      break;
    }

  if (needsRepair) {
    for (let iter = 0; iter < N * 20; iter++) {
      const viol: number[] = [];
      for (let i = 0; i < allWD; i++) if (below(i)) viol.push(i);
      if (!viol.length) break;
      const vk = viol[Math.floor(rng() * viol.length)]!;
      const cc: number[] = [];
      for (let ci = 0; ci < cands.length; ci++) if (cs[ci]!.has(vk)) cc.push(ci);
      if (!cc.length) continue;
      let bsw = -1,
        br = -1;
      for (let i = 0; i < N; i++) {
        if (cs[ia[i]!]!.has(vk)) continue;
        let mr = Infinity;
        for (const k of cs[ia[i]!]!) if (counts[k]! < mr) mr = counts[k]!;
        if (mr > br) {
          br = mr;
          bsw = i;
        }
      }
      if (bsw === -1 || br < 3) continue;
      const oc = ia[bsw]!;
      const nc = cc[Math.floor(rng() * cc.length)]!;
      // Only swap if removing the old candidate keeps every cell at/above its min.
      let safe = true;
      for (const k of cs[oc]!)
        if (counts[k]! - 1 < minCov[deptOf(k)]! && !cs[nc]!.has(k)) {
          safe = false;
          break;
        }
      if (!safe) continue;
      for (const k of cs[oc]!) counts[k]!--;
      for (const k of cs[nc]!) counts[k]!++;
      asn[oc]!--;
      asn[nc]!++;
      ia[bsw] = nc;
    }
  }

  // ── Assemble result ──
  const internSchedules: InternSchedule[] = [];
  for (let i = 0; i < N; i++)
    internSchedules.push({ id: i + 1, schedule: cands[ia[i]!]! });

  const weekDeptCount: number[][] = Array.from({ length: TW }, () =>
    new Array<number>(M).fill(0),
  );
  for (const { schedule } of internSchedules)
    for (let w = 0; w < TW; w++) weekDeptCount[w]![schedule[w]!]!++;

  let fMin = Infinity,
    fMax = 0;
  for (let w = 0; w < TW; w++)
    for (let d = 0; d < M; d++) {
      const c = weekDeptCount[w]![d]!;
      if (c < fMin) fMin = c;
      if (c > fMax) fMax = c;
    }

  return {
    internSchedules,
    weekDeptCount,
    stats: {
      totalWeeks: TW,
      minCount: fMin,
      maxCount: fMax,
      theoreticalMinN,
      candidateCount: cands.length,
    },
  };
}

/** Convert a per-week department array into contiguous blocks. */
export function schedToBlocks(sched: number[]): import("./types.js").Block[] {
  const b: import("./types.js").Block[] = [];
  let c = sched[0]!,
    s = 0;
  for (let w = 1; w < sched.length; w++) {
    if (sched[w] !== c) {
      b.push({ dept: c, start: s, end: w - 1 });
      c = sched[w]!;
      s = w;
    }
  }
  b.push({ dept: c, start: s, end: sched.length - 1 });
  return b;
}
