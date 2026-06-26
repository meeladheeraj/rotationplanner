"use client";

import { useMemo, useState } from "react";
import { schedToBlocks, type Department, type GenerateResult } from "@rp/engine";

import { deptColor } from "@/lib/client/palette";

const PAGE_SIZE = 30;
type Tab = "timeline" | "heatmap" | "cards" | "departments";

/** Diagonal hatch used to mark "on leave" weeks (FEEDBACK #9). */
const LEAVE_HATCH = "repeating-linear-gradient(45deg,#e5e7eb,#e5e7eb 3px,#f3f4f6 3px,#f3f4f6 6px)";

/** For one department, the list of intern IDs present in each week of the year. */
function deptWeeklyStudents(
  internSchedules: GenerateResult["internSchedules"],
  deptIndex: number,
  totalWeeks: number,
): number[][] {
  const weeks: number[][] = Array.from({ length: totalWeeks }, () => []);
  for (const { id, schedule } of internSchedules) {
    for (let w = 0; w < totalWeeks; w++) {
      if (schedule[w] === deptIndex) weeks[w]!.push(id);
    }
  }
  for (const list of weeks) list.sort((a, b) => a - b);
  return weeks;
}

export function ScheduleViews({
  result,
  departments,
  nameById,
}: {
  result: GenerateResult;
  departments: Department[];
  /** Optional EPHEMERAL student-name mapping (intern id → name); display only. */
  nameById?: Record<number, string>;
}) {
  const [tab, setTab] = useState<Tab>("timeline");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedDept, setSelectedDept] = useState(0);
  const totalWeeks = result.stats.totalWeeks;
  const hasLeave = useMemo(
    () => result.internSchedules.some((s) => s.schedule.some((w) => w < 0)),
    [result.internSchedules],
  );

  /** Display label for an intern: the mapped name if present, else "S{id}". */
  const labelFor = (id: number): string => nameById?.[id] ?? `S${id}`;
  const named = !!nameById;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return result.internSchedules;
    return result.internSchedules.filter(
      (s) => String(s.id).includes(q) || (nameById?.[s.id]?.toLowerCase().includes(q) ?? false),
    );
  }, [result.internSchedules, search, nameById]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const safeDept = Math.min(selectedDept, Math.max(0, departments.length - 1));
  const deptWeekly = useMemo(
    () => deptWeeklyStudents(result.internSchedules, safeDept, totalWeeks),
    [result.internSchedules, safeDept, totalWeeks],
  );
  const deptStats = useMemo(() => {
    const counts = deptWeekly.map((s) => s.length);
    const staffed = counts.filter((c) => c > 0);
    const min = staffed.length ? Math.min(...staffed) : 0;
    const max = counts.length ? Math.max(...counts) : 0;
    const minCov = departments[safeDept]?.minCoverage ?? 2;
    const belowWeeks = counts.filter((c) => c < minCov).length;
    return { min, max, minCov, belowWeeks };
  }, [deptWeekly, departments, safeDept]);

  return (
    <div>
      <div className="mb-5 flex gap-1 border-b border-gray-200">
        {([["timeline", "Timeline"], ["heatmap", "Heatmap"], ["cards", "Intern cards"], ["departments", "By department"]] as const).map(
          ([k, label]) => (
            <button
              key={k}
              onClick={() => {
                setTab(k);
                setPage(0);
              }}
              className={`px-4 py-2 text-sm font-semibold ${
                tab === k
                  ? "border-b-2 border-brand text-brand"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {label}
            </button>
          ),
        )}
      </div>

      {(tab === "timeline" || tab === "cards") && (
        <div className="mb-3 flex items-center gap-3">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder={named ? "Search name or ID…" : "Search intern ID…"}
            className="w-48 rounded-md border border-gray-300 px-3 py-1.5 font-mono text-sm focus:border-brand focus:outline-none"
          />
          <span className="text-xs text-gray-400">
            {filtered.length} interns{totalPages > 1 && ` · page ${safePage + 1}/${totalPages}`}
          </span>
        </div>
      )}

      <Legend departments={departments} showLeave={hasLeave} />

      {tab === "timeline" && (
        <div className="overflow-x-auto">
          {paged.map(({ id, schedule }) => {
            const blocks = schedToBlocks(schedule);
            return (
              <div key={id} className="mb-1 flex min-w-[600px] items-center">
                <div
                  className={`flex-shrink-0 truncate pr-2 text-right font-mono text-[11px] text-gray-400 ${named ? "w-28" : "w-12"}`}
                  title={labelFor(id)}
                >
                  {labelFor(id)}
                </div>
                <div className="flex h-6 flex-1 gap-px overflow-hidden rounded">
                  {blocks.map((b, bi) => {
                    const span = b.end - b.start + 1;
                    const isLeave = b.dept < 0;
                    return (
                      <div
                        key={bi}
                        title={
                          isLeave
                            ? `On leave: W${b.start + 1}–W${b.end + 1} (${span}w)`
                            : `${departments[b.dept]?.name}: W${b.start + 1}–W${b.end + 1} (${span}w)`
                        }
                        style={{ flex: span, background: isLeave ? LEAVE_HATCH : deptColor(b.dept) }}
                        className={`flex min-w-[2px] items-center justify-center text-[8px] font-semibold ${isLeave ? "text-gray-500" : "text-white"}`}
                      >
                        {span >= 3 ? (isLeave ? "Leave" : departments[b.dept]?.name.substring(0, 5)) : ""}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "heatmap" && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 px-2 py-1.5 text-left text-[11px] text-gray-400">
                  Department
                </th>
                {Array.from({ length: totalWeeks }, (_, w) => (
                  <th key={w} className="min-w-[26px] px-0.5 py-1.5 text-center font-mono text-[9px] text-gray-400">
                    {w + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {departments.map((d, di) => {
                const minCov = d.minCoverage ?? 2;
                return (
                  <tr key={di}>
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-gray-50 px-2 py-1 text-xs font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-sm" style={{ background: deptColor(di) }} />
                        {d.name}
                      </span>
                    </td>
                    {Array.from({ length: totalWeeks }, (_, w) => {
                      const c = result.weekDeptCount[w]?.[di] ?? 0;
                      const maxC = result.stats.maxCount || 1;
                      const intensity = c / maxC;
                      const bad = c < minCov;
                      return (
                        <td
                          key={w}
                          title={`${d.name} W${w + 1}: ${c} interns (min ${minCov})`}
                          className="px-0.5 py-0.5 text-center font-mono text-[10px]"
                          style={{
                            fontWeight: bad ? 700 : 400,
                            color: bad ? "#fff" : intensity > 0.5 ? "#fff" : "#5c5c5c",
                            background: bad
                              ? "#DC2626"
                              : c === 0
                                ? "#f1f0ec"
                                : `rgba(37,99,235,${0.1 + intensity * 0.8})`,
                          }}
                        >
                          {c}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "cards" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {paged.map(({ id, schedule }) => {
            const blocks = schedToBlocks(schedule);
            return (
              <div key={id} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <div className="flex items-center justify-between bg-brand px-4 py-3 text-white">
                  <div className="min-w-0">
                    <div className="truncate text-base font-bold" title={labelFor(id)}>
                      {named ? labelFor(id) : `Intern S${id}`}
                    </div>
                    <div className="text-[11px] opacity-80">{totalWeeks}-week rotation</div>
                  </div>
                  <div className="font-mono text-2xl font-bold opacity-30">
                    #{String(id).padStart(3, "0")}
                  </div>
                </div>
                <div className="flex h-2">
                  {blocks.map((b, bi) => (
                    <div
                      key={bi}
                      style={{ flex: b.end - b.start + 1, background: b.dept < 0 ? LEAVE_HATCH : deptColor(b.dept) }}
                      className="min-w-[1px]"
                    />
                  ))}
                </div>
                <table className="w-full border-collapse px-4 py-2">
                  <tbody>
                    {blocks.map((b, bi) => (
                      <tr key={bi} className="border-b border-gray-100 last:border-0">
                        <td className="w-5 py-1">
                          <div
                            className="h-2 w-2 rounded-sm"
                            style={{ background: b.dept < 0 ? "#d1d5db" : deptColor(b.dept) }}
                          />
                        </td>
                        <td className="py-1 pl-1 text-xs font-medium">
                          {b.dept < 0 ? <span className="text-gray-400">On leave</span> : departments[b.dept]?.name}
                        </td>
                        <td className="py-1 text-right font-mono text-[11px] text-gray-400">
                          W{b.start + 1}
                          {b.start !== b.end ? `–${b.end + 1}` : ""}
                        </td>
                        <td className="w-9 py-1 text-right font-mono text-[11px] text-gray-400">
                          {b.end - b.start + 1}w
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {tab === "departments" && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-gray-600">Department</label>
            <select
              value={safeDept}
              onChange={(e) => setSelectedDept(Number(e.target.value))}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
            >
              {departments.map((d, di) => (
                <option key={di} value={di}>
                  {d.name}
                </option>
              ))}
            </select>
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <span className="h-3 w-3 rounded-sm" style={{ background: deptColor(safeDept) }} />
              {departments[safeDept]?.weeks}-week block · minimum {deptStats.minCov}/week
            </span>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Weeks staffed" value={`${deptWeekly.filter((s) => s.length > 0).length}/${totalWeeks}`} />
            <Stat label="Min in a week" value={String(deptStats.min)} />
            <Stat label="Max in a week" value={String(deptStats.max)} />
            <Stat
              label="Weeks below min"
              value={String(deptStats.belowWeeks)}
              tone={deptStats.belowWeeks > 0 ? "bad" : "ok"}
            />
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="w-16 px-3 py-2">Week</th>
                  <th className="w-20 px-3 py-2 text-center">Count</th>
                  <th className="px-3 py-2">Students</th>
                </tr>
              </thead>
              <tbody>
                {deptWeekly.map((students, w) => {
                  const below = students.length < deptStats.minCov;
                  return (
                    <tr key={w} className="border-t border-gray-100 align-top">
                      <td className="px-3 py-2 font-mono text-xs text-gray-500">W{w + 1}</td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`inline-block min-w-[1.75rem] rounded-full px-2 py-0.5 text-xs font-semibold ${
                            below ? "bg-red-100 text-red-700" : "bg-blue-50 text-blue-700"
                          }`}
                        >
                          {students.length}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {students.length === 0 ? (
                          <span className="text-xs text-gray-300">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {students.map((id) => (
                              <span
                                key={id}
                                className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600"
                              >
                                {labelFor(id)}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(tab === "timeline" || tab === "cards") && totalPages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          <button
            disabled={safePage === 0}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-40"
          >
            Prev
          </button>
          <span className="px-2 py-1.5 font-mono text-xs text-gray-400">
            {safePage + 1}/{totalPages}
          </span>
          <button
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
      <div
        className={`text-lg font-bold ${
          tone === "bad" ? "text-red-600" : tone === "ok" ? "text-emerald-600" : "text-gray-800"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Legend({ departments, showLeave }: { departments: Department[]; showLeave?: boolean }) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {departments.map((d, i) => (
        <span key={i} className="inline-flex items-center gap-1 text-[11px] text-gray-600">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: deptColor(i) }} />
          {d.name}
        </span>
      ))}
      {showLeave && (
        <span className="inline-flex items-center gap-1 text-[11px] text-gray-600">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: LEAVE_HATCH }} />
          On leave
        </span>
      )}
    </div>
  );
}
