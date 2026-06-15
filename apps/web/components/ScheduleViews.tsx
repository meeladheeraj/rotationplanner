"use client";

import { useMemo, useState } from "react";
import { schedToBlocks, type Department, type GenerateResult } from "@rp/engine";

import { deptColor } from "@/lib/client/palette";

const PAGE_SIZE = 30;
type Tab = "timeline" | "heatmap" | "cards";

export function ScheduleViews({
  result,
  departments,
}: {
  result: GenerateResult;
  departments: Department[];
}) {
  const [tab, setTab] = useState<Tab>("timeline");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const totalWeeks = result.stats.totalWeeks;

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return result.internSchedules;
    return result.internSchedules.filter((s) => String(s.id).includes(q));
  }, [result.internSchedules, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div>
      <div className="mb-5 flex gap-1 border-b border-gray-200">
        {([["timeline", "Timeline"], ["heatmap", "Heatmap"], ["cards", "Intern cards"]] as const).map(
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
            placeholder="Search intern ID…"
            className="w-48 rounded-md border border-gray-300 px-3 py-1.5 font-mono text-sm focus:border-brand focus:outline-none"
          />
          <span className="text-xs text-gray-400">
            {filtered.length} interns{totalPages > 1 && ` · page ${safePage + 1}/${totalPages}`}
          </span>
        </div>
      )}

      <Legend departments={departments} />

      {tab === "timeline" && (
        <div className="overflow-x-auto">
          {paged.map(({ id, schedule }) => {
            const blocks = schedToBlocks(schedule);
            return (
              <div key={id} className="mb-1 flex min-w-[600px] items-center">
                <div className="w-12 flex-shrink-0 pr-2 text-right font-mono text-[11px] text-gray-400">
                  S{id}
                </div>
                <div className="flex h-6 flex-1 gap-px overflow-hidden rounded">
                  {blocks.map((b, bi) => {
                    const span = b.end - b.start + 1;
                    return (
                      <div
                        key={bi}
                        title={`${departments[b.dept]?.name}: W${b.start + 1}–W${b.end + 1} (${span}w)`}
                        style={{ flex: span, background: deptColor(b.dept) }}
                        className="flex min-w-[2px] items-center justify-center text-[8px] font-semibold text-white"
                      >
                        {span >= 3 ? departments[b.dept]?.name.substring(0, 5) : ""}
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
                  <div>
                    <div className="text-base font-bold">Intern S{id}</div>
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
                      style={{ flex: b.end - b.start + 1, background: deptColor(b.dept) }}
                      className="min-w-[1px]"
                    />
                  ))}
                </div>
                <table className="w-full border-collapse px-4 py-2">
                  <tbody>
                    {blocks.map((b, bi) => (
                      <tr key={bi} className="border-b border-gray-100 last:border-0">
                        <td className="w-5 py-1">
                          <div className="h-2 w-2 rounded-sm" style={{ background: deptColor(b.dept) }} />
                        </td>
                        <td className="py-1 pl-1 text-xs font-medium">{departments[b.dept]?.name}</td>
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

function Legend({ departments }: { departments: Department[] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {departments.map((d, i) => (
        <span key={i} className="inline-flex items-center gap-1 text-[11px] text-gray-600">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: deptColor(i) }} />
          {d.name}
        </span>
      ))}
    </div>
  );
}
