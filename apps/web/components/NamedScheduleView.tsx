"use client";

import { useRef, useState } from "react";
import type { Department, GenerateResult } from "@rp/engine";

import { ScheduleViews } from "@/components/ScheduleViews";
import { exportScheduleCsv } from "@/lib/client/csv";

/**
 * FEEDBACK #8 — client wrapper for the in-app schedule view that adds an
 * EPHEMERAL student-name mapping. The admin uploads a name spreadsheet; it's
 * parsed server-side in request scope (never persisted) and the resulting map is
 * held in memory here. While present, the in-app views show real names and the
 * PDF/Excel/CSV exports substitute them. Reloading the page clears it; the DB and
 * public share links stay anonymous.
 */
export function NamedScheduleView({
  result,
  departments,
  scheduleId,
  configName,
  version,
}: {
  result: GenerateResult;
  departments: Department[];
  scheduleId: string;
  configName: string;
  version: number;
}) {
  const [nameByIndex, setNameByIndex] = useState<Record<number, string> | null>(null);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dl, setDl] = useState<"pdf" | "xlsx" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const baseName = `${configName.replace(/[^a-z0-9]+/gi, "_")}_v${version}`;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/schedules/${scheduleId}/names`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not read the file");
      setNameByIndex(data.nameByIndex as Record<number, string>);
      setCount(Number(data.count) || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setNameByIndex(null);
      setCount(0);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function clearNames() {
    setNameByIndex(null);
    setCount(0);
    setError(null);
  }

  async function downloadServer(kind: "pdf" | "xlsx") {
    setDl(kind);
    setError(null);
    try {
      const res = await fetch(`/api/schedules/${scheduleId}/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nameByIndex }),
      });
      if (!res.ok) {
        setError(`Could not generate the ${kind.toUpperCase()} export`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseName}.${kind}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(`Could not generate the ${kind.toUpperCase()} export`);
    } finally {
      setDl(null);
    }
  }

  function downloadCsv() {
    exportScheduleCsv(result.internSchedules, departments, nameByIndex ?? undefined);
  }

  return (
    <div>
      <section className="mb-5 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-700">Student names (optional)</h2>
            <p className="mt-0.5 max-w-xl text-xs text-gray-500">
              Upload an Excel (.xlsx) of student names to label this view and its exports.
              Names are used in your browser/session only — never stored, and never shown on
              public share links.
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {nameByIndex ? (
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  {count} name{count === 1 ? "" : "s"} applied
                </span>
                <button
                  onClick={clearNames}
                  className="rounded border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-100"
                >
                  Clear
                </button>
              </>
            ) : (
              <label className="cursor-pointer rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                {busy ? "Reading…" : "Upload names .xlsx"}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={onFile}
                  disabled={busy}
                />
              </label>
            )}
          </div>
        </div>
        {error && <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}

        <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
          <span className="self-center text-xs text-gray-400">
            Export{nameByIndex ? " (with names)" : ""}:
          </span>
          <button
            onClick={() => downloadServer("pdf")}
            disabled={dl !== null}
            className="inline-flex items-center gap-1 rounded border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-100 disabled:opacity-60"
          >
            {dl === "pdf" ? (
              <>
                <Spinner />
                Preparing PDF…
              </>
            ) : (
              "PDF"
            )}
          </button>
          <button
            onClick={() => downloadServer("xlsx")}
            disabled={dl !== null}
            className="inline-flex items-center gap-1 rounded border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-100 disabled:opacity-60"
          >
            {dl === "xlsx" ? (
              <>
                <Spinner />
                Preparing Excel…
              </>
            ) : (
              "Excel"
            )}
          </button>
          <button
            onClick={downloadCsv}
            disabled={dl !== null}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-100 disabled:opacity-60"
          >
            CSV
          </button>
        </div>
      </section>

      <ScheduleViews result={result} departments={departments} nameById={nameByIndex ?? undefined} />
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-90" />
    </svg>
  );
}
