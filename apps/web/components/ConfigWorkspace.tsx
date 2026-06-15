"use client";

import { useState } from "react";
import { schedToBlocks, type Config, type Department } from "@rp/engine";

import { useScheduler } from "@/lib/client/useScheduler";
import { exportScheduleCsv } from "@/lib/client/csv";
import { ScheduleViews } from "@/components/ScheduleViews";
import { SavedSchedules } from "@/components/SavedSchedules";

interface Props {
  configId: string;
  name: string;
  nInterns: number;
  seed: number | null;
  departments: Department[];
}

export function ConfigWorkspace(props: Props) {
  const [nInterns, setNInterns] = useState(props.nInterns);
  const [departments, setDepartments] = useState<Department[]>(props.departments);
  const { generating, result, error, generate } = useScheduler();
  const [saveState, setSaveState] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState(0);

  const totalWeeks = departments.reduce((a, d) => a + d.weeks, 0);

  function updateDept(i: number, field: keyof Department, value: string) {
    setDepartments((prev) =>
      prev.map((d, idx) => {
        if (idx !== i) return d;
        if (field === "weeks") return { ...d, weeks: Math.max(1, parseInt(value) || 1) };
        if (field === "minCoverage") return { ...d, minCoverage: Math.max(1, parseInt(value) || 1) };
        return { ...d, name: value };
      }),
    );
  }

  function runGenerate() {
    setSaveState(null);
    const config: Config = {
      n: nInterns,
      departments,
      seed: props.seed ?? undefined,
    };
    generate(config);
  }

  async function saveSchedule() {
    if (!result) return;
    setSaveState("Saving…");
    const assignments = result.internSchedules.map((is) => ({
      internIndex: is.id,
      internLabel: `Intern ${is.id + 1}`,
      rotation: schedToBlocks(is.schedule).map((b) => ({
        dept: b.dept,
        deptName: departments[b.dept]?.name ?? "",
        start: b.start,
        end: b.end,
      })),
    }));
    try {
      const res = await fetch(`/api/configs/${props.configId}/schedules`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignments }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSaveState(`Saved as version ${data.version} (server re-validated ✓)`);
      setSavedKey((k) => k + 1);
    } catch (e) {
      setSaveState(e instanceof Error ? e.message : "Save failed");
    }
  }

  return (
    <div className="mt-2">
      <h1 className="text-2xl font-bold">{props.name}</h1>

      <section className="mt-4 rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-end gap-4">
          <label className="block">
            <span className="text-xs font-medium text-gray-500">Interns</span>
            <input
              type="number"
              min={1}
              value={nInterns}
              onChange={(e) => setNInterns(Math.max(1, parseInt(e.target.value) || 1))}
              className="mt-1 w-28 rounded-md border border-gray-300 px-3 py-1.5 font-mono text-sm focus:border-brand focus:outline-none"
            />
          </label>
          <div className="text-sm text-gray-500">
            {departments.length} departments · {totalWeeks} weeks total
          </div>
          <button
            onClick={runGenerate}
            disabled={generating}
            className="ml-auto rounded-md bg-brand px-5 py-2 font-medium text-white hover:bg-brand-fg disabled:opacity-50"
          >
            {generating ? "Generating…" : "Generate schedule"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400">
                <th className="py-1 pr-3">Department</th>
                <th className="py-1 pr-3">Weeks</th>
                <th className="py-1 pr-3">Min coverage</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1 pr-3">
                    <input
                      value={d.name}
                      onChange={(e) => updateDept(i, "name", e.target.value)}
                      className="w-full rounded border border-gray-200 px-2 py-1"
                    />
                  </td>
                  <td className="py-1 pr-3">
                    <input
                      type="number"
                      min={1}
                      value={d.weeks}
                      onChange={(e) => updateDept(i, "weeks", e.target.value)}
                      className="w-20 rounded border border-gray-200 px-2 py-1 font-mono"
                    />
                  </td>
                  <td className="py-1 pr-3">
                    <input
                      type="number"
                      min={1}
                      value={d.minCoverage ?? 2}
                      onChange={(e) => updateDept(i, "minCoverage", e.target.value)}
                      className="w-20 rounded border border-gray-200 px-2 py-1 font-mono"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">Error: {error}</p>
      )}

      {result && (
        <section className="mt-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Pill
              tone={result.stats.minCount >= 2 ? "ok" : result.stats.minCount >= 1 ? "warn" : "err"}
            >
              Min {result.stats.minCount} interns/dept/week
            </Pill>
            {result.stats.uncoverableCells > 0 && (
              <Pill tone="warn">
                {result.stats.uncoverableCells} structurally uncoverable cell(s)
              </Pill>
            )}
            <Pill tone="ok">theoretical min N = {result.stats.theoreticalMinN}</Pill>
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => exportScheduleCsv(result.internSchedules, departments)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-100"
              >
                Export CSV
              </button>
              <button
                onClick={saveSchedule}
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-fg"
              >
                Save schedule
              </button>
            </div>
          </div>
          {saveState && <p className="mb-3 text-sm text-gray-600">{saveState}</p>}
          <ScheduleViews result={result} departments={departments} />
        </section>
      )}

      <SavedSchedules configId={props.configId} refreshKey={savedKey} />
    </div>
  );
}

function Pill({ tone, children }: { tone: "ok" | "warn" | "err"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "warn"
        ? "bg-amber-50 text-amber-700"
        : "bg-red-50 text-red-700";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}
