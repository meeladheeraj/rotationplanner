"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface InternOption {
  index: number;
  label: string;
}

/**
 * "Mark leave" control (FEEDBACK #9). Applies an intern leave to the current
 * schedule version via POST /api/schedules/:id/leave, which creates a NEW draft
 * version; on success we navigate to that version's view.
 */
export function LeaveControl({
  scheduleId,
  interns,
  totalWeeks,
}: {
  scheduleId: string;
  interns: InternOption[];
  totalWeeks: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [internIndex, setInternIndex] = useState<number | "">(interns[0]?.index ?? "");
  const [startWeek, setStartWeek] = useState("1"); // 1-based in the UI
  const [leaveWeeks, setLeaveWeeks] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const sw = Number(startWeek);
    const lw = Number(leaveWeeks);
    if (internIndex === "") {
      setError("Choose an intern");
      return;
    }
    if (!Number.isInteger(sw) || sw < 1 || sw > totalWeeks) {
      setError(`Start week must be between 1 and ${totalWeeks}`);
      return;
    }
    if (!Number.isInteger(lw) || lw < 1) {
      setError("Weeks off must be at least 1");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/schedules/${scheduleId}/leave`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          internIndex: Number(internIndex),
          startWeek: sw - 1, // convert to 0-based for the engine
          leaveWeeks: lw,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not apply leave");
      // Navigate to the newly-created version.
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
        Mark leave
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 text-left"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Mark intern leave"
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200"
          >
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Mark intern leave</h2>
            <p className="mb-5 text-sm text-slate-500">
              The intern restarts the department they were in and resumes afterward. This creates a
              new draft version; coverage gaps the leave introduces are flagged.
            </p>

            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="lv-intern">
              Intern
            </label>
            <select
              id="lv-intern"
              value={internIndex}
              onChange={(e) => setInternIndex(e.target.value === "" ? "" : Number(e.target.value))}
              className="mb-4 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
            >
              {interns.map((i) => (
                <option key={i.index} value={i.index}>
                  {i.label}
                </option>
              ))}
            </select>

            <div className="mb-4 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="lv-start">
                  Start week (1–{totalWeeks})
                </label>
                <input
                  id="lv-start"
                  type="number"
                  min={1}
                  max={totalWeeks}
                  value={startWeek}
                  onChange={(e) => setStartWeek(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="lv-weeks">
                  Weeks off
                </label>
                <input
                  id="lv-weeks"
                  type="number"
                  min={1}
                  value={leaveWeeks}
                  onChange={(e) => setLeaveWeeks(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
                />
              </div>
            </div>

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
                type="submit"
                disabled={busy}
                className="rounded-lg bg-brand px-5 py-2.5 font-semibold text-white shadow-sm transition hover:bg-brand-fg focus:outline-none focus:ring-4 focus:ring-brand/25 disabled:opacity-50"
              >
                {busy ? "Applying…" : "Apply leave"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
