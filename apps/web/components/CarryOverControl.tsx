"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DeptOption {
  index: number;
  name: string;
}
interface StagedStudent {
  internLabel: string;
  departments: number[];
}

/**
 * Add carry-over students (returning from a previous year's leave) to this
 * batch. Each student has only their PENDING departments; the server lays out a
 * partial schedule and saves a new draft version. (FEEDBACK #9 — next batch.)
 */
export function CarryOverControl({
  scheduleId,
  departments,
}: {
  scheduleId: string;
  departments: DeptOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [staged, setStaged] = useState<StagedStudent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setLabel("");
    setPicked(new Set());
    setStaged([]);
    setError(null);
    setBusy(false);
  }
  function close() {
    if (busy) return;
    setOpen(false);
    setTimeout(reset, 150);
  }

  function toggleDept(i: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function addToList() {
    const name = label.trim();
    if (!name) return setError("Enter a student name");
    if (picked.size === 0) return setError("Pick at least one pending department");
    setStaged((s) => [...s, { internLabel: name, departments: [...picked].sort((a, b) => a - b) }]);
    setLabel("");
    setPicked(new Set());
    setError(null);
  }

  async function submit() {
    const all = [...staged];
    // include an in-progress entry if valid
    const name = label.trim();
    if (name && picked.size > 0) all.push({ internLabel: name, departments: [...picked].sort((a, b) => a - b) });
    if (all.length === 0) return setError("Add at least one student");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/schedules/${scheduleId}/carryover`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ students: all }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not add carry-over students");
      router.push(`/schedules/${data.scheduleId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-brand hover:text-brand"
      >
        Add carry-over student
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 text-left"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Add carry-over students"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200"
          >
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Add carry-over students</h2>
            <p className="mb-5 text-sm text-slate-500">
              For students returning to finish last year&apos;s rotation. Pick only the departments
              they still need — they&apos;ll get a partial schedule and this saves a new draft version.
            </p>

            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="co-name">
              Student name / label
            </label>
            <input
              id="co-name"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Asha (carried from 2025)"
              className="mb-4 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
            />

            <span className="mb-1.5 block text-sm font-medium text-slate-700">Pending departments</span>
            <div className="mb-4 grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {departments.map((d) => (
                <label key={d.index} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={picked.has(d.index)}
                    onChange={() => toggleDept(d.index)}
                    className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand/30"
                  />
                  {d.name}
                </label>
              ))}
            </div>

            <div className="mb-4 flex items-center gap-2">
              <button
                type="button"
                onClick={addToList}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-brand hover:text-brand"
              >
                + Add another student
              </button>
              {staged.length > 0 && (
                <span className="text-xs text-slate-500">{staged.length} staged</span>
              )}
            </div>

            {staged.length > 0 && (
              <ul className="mb-4 space-y-1 text-sm">
                {staged.map((s, i) => (
                  <li key={i} className="flex items-center justify-between rounded bg-slate-50 px-3 py-1.5">
                    <span>
                      <span className="font-medium">{s.internLabel}</span>{" "}
                      <span className="text-slate-400">
                        · {s.departments.map((d) => departments.find((x) => x.index === d)?.name).join(", ")}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setStaged((list) => list.filter((_, idx) => idx !== i))}
                      className="text-slate-400 hover:text-red-600"
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {error && (
              <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="rounded-lg px-4 py-2.5 font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="rounded-lg bg-brand px-5 py-2.5 font-semibold text-white shadow-sm transition hover:bg-brand-fg focus:outline-none focus:ring-4 focus:ring-brand/25 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save batch version"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
