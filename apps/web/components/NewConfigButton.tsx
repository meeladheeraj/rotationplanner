"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PRESET_NAME = "NMC CRMI 2021";

export function NewConfigButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [nInterns, setNInterns] = useState("135");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(nInterns);
    if (!Number.isInteger(n) || n < 1) {
      setError("Number of interns must be a positive whole number");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/configs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          presetId: "nmc-crmi-2021",
          nInterns: n,
          // blank name → server falls back to the preset name
          name: name.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create config");
      router.push(`/configs/${data.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-fg"
      >
        New schedule
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 text-left"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="New schedule"
        >
          <form
            onSubmit={create}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200"
          >
            <h2 className="text-lg font-bold tracking-tight text-slate-900">New schedule</h2>
            <p className="mb-5 text-sm text-slate-500">
              Starts from the {PRESET_NAME} preset. Give it a name so you can tell your rosters apart.
            </p>

            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="cfg-name">
              Schedule name
            </label>
            <input
              id="cfg-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`e.g. 2026 Batch — ${PRESET_NAME}`}
              className="mb-4 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
            />

            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="cfg-n">
              Number of interns
            </label>
            <input
              id="cfg-n"
              type="number"
              min={1}
              value={nInterns}
              onChange={(e) => setNInterns(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-slate-900 transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
            />

            {error && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
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
                {busy ? "Creating…" : "Create schedule"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
