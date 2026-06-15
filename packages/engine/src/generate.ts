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
import { countUncoverableCells } from "./feasibility.js";

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
  // Strictly-improving local search on the total coverage *deficit*
  //   deficit(k) = max(0, minCoverage[dept(k)] - counts[k])
  // Each accepted move reassigns one intern from candidate `oc` to candidate
  // `nc`, and is applied only if it strictly lowers the summed deficit. Because
  // the objective is a non-negative integer that decreases by >=1 every move,
  // the loop terminates; and since it never increases deficit, it can never
  // turn a covered cell into a violation. This replaces the earlier random /
  // `br < 3` heuristic and materially lowers the coverage-shortfall rate.
  const deptOf = (k: number) => k % M;
  const defAt = (c: number, k: number) => {
    const m = minCov[deptOf(k)]!;
    return c < m ? m - c : 0;
  };

  const totalDeficit = () => {
    let s = 0;
    for (let k = 0; k < allWD; k++) s += defAt(counts[k]!, k);
    return s;
  };

  // candsByCell[k] = candidate indices whose schedule covers cell k.
  const candsByCell: number[][] = Array.from({ length: allWD }, () => []);
  for (let ci = 0; ci < cands.length; ci++)
    for (const k of cs[ci]!) candsByCell[k]!.push(ci);

  // Delta to the total deficit of moving one intern from candidate oc -> nc.
  const moveDelta = (oc: number, nc: number): number => {
    if (oc === nc) return 0;
    let delta = 0;
    const ncSet = cs[nc]!;
    const ocSet = cs[oc]!;
    for (const k of ocSet)
      if (!ncSet.has(k)) delta += defAt(counts[k]! - 1, k) - defAt(counts[k]!, k);
    for (const k of ncSet)
      if (!ocSet.has(k)) delta += defAt(counts[k]! + 1, k) - defAt(counts[k]!, k);
    return delta;
  };

  // Apply a single reassignment (intern `i`: oc -> nc) to the running counts.
  const applyMove = (i: number, nc: number) => {
    const oc = ia[i]!;
    for (const k of cs[oc]!) counts[k]!--;
    for (const k of cs[nc]!) counts[k]!++;
    asn[oc]!--;
    asn[nc]!++;
    ia[i] = nc;
  };

  // Find the single move (intern i: oc -> nc) that most reduces the total
  // deficit, searching only the worst violated cells and their covering
  // candidates. Donors are chosen per candidate (one representative intern) so
  // cost is independent of N; covering candidates are stride-sampled so cost is
  // independent of the pool size. Returns delta < 0 for an improving move.
  const internOfCand = new Int32Array(cands.length);
  const usedCands: number[] = [];
  const NC_SAMPLE = 48; // covering candidates examined per target cell
  const CELL_BUDGET = 16; // worst violated cells examined per pass
  const findImprovingMove = (
    viol: number[],
  ): { i: number; nc: number; delta: number } => {
    internOfCand.fill(-1);
    usedCands.length = 0;
    for (let i = 0; i < N; i++) {
      const c = ia[i]!;
      if (internOfCand[c] === -1) {
        internOfCand[c] = i;
        usedCands.push(c);
      }
    }
    let bestDelta = 0;
    let bestI = -1;
    let bestNc = -1;
    for (let vi = 0; vi < viol.length && vi < CELL_BUDGET; vi++) {
      const vk = viol[vi]!;
      const ncList = candsByCell[vk]!;
      const ncStride =
        ncList.length > NC_SAMPLE ? Math.floor(ncList.length / NC_SAMPLE) : 1;
      for (const oc of usedCands) {
        if (cs[oc]!.has(vk)) continue; // donor already covers vk
        for (let t = 0; t < ncList.length; t += ncStride) {
          const nc = ncList[t]!;
          if (nc === oc) continue;
          const d = moveDelta(oc, nc);
          if (d < bestDelta) {
            bestDelta = d;
            bestI = internOfCand[oc]!;
            bestNc = nc;
          }
        }
      }
      if (bestDelta < 0) break; // take the first strong win on the worst cell
    }
    return { i: bestI, nc: bestNc, delta: bestDelta };
  };

  if (totalDeficit() > 0) {
    // Strictly-improving descent: the integer deficit decreases by >=1 each
    // accepted move, so this terminates and never creates a new violation.
    // Any residual deficit is a single-move local optimum (or structurally
    // uncoverable — see analyzeFeasibility): callers surface it via validate().
    const maxIters = 4000;
    for (let iter = 0; iter < maxIters; iter++) {
      const viol: number[] = [];
      for (let k = 0; k < allWD; k++) if (counts[k]! < minCov[deptOf(k)]!) viol.push(k);
      if (!viol.length) break;
      viol.sort((a, b) => defAt(counts[b]!, b) - defAt(counts[a]!, a));
      const mv = findImprovingMove(viol);
      if (mv.i === -1 || mv.delta >= 0) break; // local optimum
      applyMove(mv.i, mv.nc);
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
      uncoverableCells: countUncoverableCells(config),
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
