"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [nInterns, setNInterns] = useState(props.nInterns);
  const [departments, setDepartments] = useState<Department[]>(props.departments);
  const { generating, result, error, generate } = useScheduler();
  const [saveState, setSaveState] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState(0);

  const [name, setName] = useState(props.name);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(props.name);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [configSaving, setConfigSaving] = useState(false);
  const [configMsg, setConfigMsg] = useState<string | null>(null);

  async function renameConfig() {
    const next = nameDraft.trim();
    if (!next || next === name) {
      setEditingName(false);
      setNameDraft(name);
      setNameError(null);
      return;
    }
    setNameBusy(true);
    setNameError(null);
    try {
      const res = await fetch(`/api/configs/${props.configId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Rename failed");
      }
      setName(next);
      setEditingName(false);
      router.refresh();
    } catch (e) {
      setNameError(e instanceof Error ? e.message : "Rename failed");
    } finally {
      setNameBusy(false);
    }
  }

  const totalWeeks = departments.reduce((a, d) => a + d.weeks, 0);

  function updateDept(i: number, field: keyof Department, value: string) {
    setConfigMsg(null);
    setDepartments((prev) =>
      prev.map((d, idx) => {
        if (idx !== i) return d;
        if (field === "weeks") return { ...d, weeks: Math.max(1, parseInt(value) || 1) };
        if (field === "minCoverage") return { ...d, minCoverage: Math.max(1, parseInt(value) || 1) };
        return { ...d, name: value };
      }),
    );
  }

  function addDept() {
    setDepartments((prev) => [...prev, { name: "New department", weeks: 1, minCoverage: 2 }]);
    setConfigMsg(null);
  }

  function removeDept(i: number) {
    setDepartments((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
    setConfigMsg(null);
  }

  async function saveConfig() {
    if (departments.some((d) => !d.name.trim())) {
      setConfigMsg("Every department needs a name");
      return;
    }
    setConfigSaving(true);
    setConfigMsg(null);
    try {
      const res = await fetch(`/api/configs/${props.configId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nInterns,
          departments: departments.map((d) => ({
            name: d.name.trim(),
            weeks: d.weeks,
            minCoverage: d.minCoverage ?? 2,
          })),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Save failed");
      }
      setConfigMsg("Structure saved ✓");
      router.refresh();
    } catch (e) {
      setConfigMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setConfigSaving(false);
    }
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
      internLabel: `Intern ${is.id}`,
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
      const nViol = Array.isArray(data.violations) ? data.violations.length : 0;
      if (nViol > 0) {
        setSaveState(
          `Saved as DRAFT v${data.version} — ${nViol} coverage shortfall${nViol === 1 ? "" : "s"} below minimum. ` +
            `You can keep it as a draft, but it cannot be published until fully staffed (try more interns).`,
        );
      } else {
        setSaveState(`Saved as version ${data.version} (server re-validated ✓, fully staffed — publishable)`);
      }
      setSavedKey((k) => k + 1);
    } catch (e) {
      setSaveState(e instanceof Error ? e.message : "Save failed");
    }
  }

  return (
    <div className="mt-2">
      {editingName ? (
        <div>
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") renameConfig();
                if (e.key === "Escape") {
                  setEditingName(false);
                  setNameDraft(name);
                  setNameError(null);
                }
              }}
              className="w-full max-w-md rounded-md border border-slate-300 px-3 py-1.5 text-2xl font-bold text-slate-900 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
            />
            <button
              onClick={renameConfig}
              disabled={nameBusy}
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-fg disabled:opacity-50"
            >
              {nameBusy ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => {
                setEditingName(false);
                setNameDraft(name);
                setNameError(null);
              }}
              disabled={nameBusy}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          {nameError && <p className="mt-1 text-sm text-red-600">{nameError}</p>}
        </div>
      ) : (
        <div className="group flex items-center gap-2">
          <h1 className="text-2xl font-bold">{name}</h1>
          <button
            onClick={() => {
              setNameDraft(name);
              setEditingName(true);
            }}
            aria-label="Rename schedule"
            title="Rename"
            className="rounded-md p-1.5 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-brand focus:opacity-100 group-hover:opacity-100"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" strokeLinecap="round" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}

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
                <th className="py-1 pr-3 sr-only">Actions</th>
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
                  <td className="py-1 pr-1 text-right">
                    <button
                      type="button"
                      onClick={() => removeDept(i)}
                      disabled={departments.length <= 1}
                      aria-label={`Remove ${d.name || "department"}`}
                      title={departments.length <= 1 ? "At least one department is required" : "Remove department"}
                      className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M10 11v6M14 11v6" strokeLinecap="round" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={addDept}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-brand hover:text-brand"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Add department
          </button>

          <span className="text-sm text-gray-400">
            {departments.length} departments · {totalWeeks} weeks total
          </span>

          <div className="ml-auto flex items-center gap-3">
            {configMsg && (
              <span
                className={`text-sm ${configMsg.endsWith("✓") ? "text-green-600" : "text-red-600"}`}
              >
                {configMsg}
              </span>
            )}
            <button
              type="button"
              onClick={saveConfig}
              disabled={configSaving}
              className="rounded-md border border-gray-300 px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:border-brand hover:text-brand disabled:opacity-50"
            >
              {configSaving ? "Saving…" : "Save changes"}
            </button>
          </div>
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
