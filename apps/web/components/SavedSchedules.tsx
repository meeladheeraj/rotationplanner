"use client";

import { useCallback, useEffect, useState } from "react";

interface ScheduleSummary {
  id: string;
  version: number;
  status: "draft" | "published" | "archived";
  generatedAt: string;
  stats: { minCount: number; maxCount: number; totalWeeks: number };
}

export function SavedSchedules({ configId, refreshKey }: { configId: string; refreshKey: number }) {
  const [items, setItems] = useState<ScheduleSummary[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/configs/${configId}/schedules`);
    if (res.ok) {
      const data = await res.json();
      setItems(data.schedules ?? []);
    }
  }, [configId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function publish(id: string) {
    setBusy(id);
    setNote(null);
    try {
      const res = await fetch(`/api/schedules/${id}/publish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Publish failed");
      setNote(`Published v${data.version} — this roster is now immutable.`);
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setBusy(null);
    }
  }

  async function share(id: string) {
    setBusy(id);
    setNote(null);
    try {
      const res = await fetch(`/api/schedules/${id}/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: "full" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Share failed");
      const url = `${window.location.origin}/s/${data.token}`;
      await navigator.clipboard?.writeText(url).catch(() => {});
      setNote(`Share link (copied): ${url}`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Share failed");
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) return null;

  return (
    <section className="mt-8 rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">Saved versions</h2>
      {note && <p className="mb-3 break-all rounded bg-gray-50 p-2 text-xs text-gray-600">{note}</p>}
      <table className="w-full text-sm">
        <tbody>
          {items.map((s) => (
            <tr key={s.id} className="border-t border-gray-100">
              <td className="py-2 pr-3 font-medium">v{s.version}</td>
              <td className="py-2 pr-3">
                <StatusPill status={s.status} />
              </td>
              <td className="py-2 pr-3 text-xs text-gray-500">min {s.stats.minCount}/dept/wk</td>
              <td className="py-2 text-right">
                <div className="flex justify-end gap-2">
                  {s.status === "draft" && (
                    <button
                      onClick={() => publish(s.id)}
                      disabled={busy === s.id}
                      className="rounded border border-emerald-300 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                    >
                      Publish
                    </button>
                  )}
                  <button
                    onClick={() => share(s.id)}
                    disabled={busy === s.id}
                    className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-100 disabled:opacity-50"
                  >
                    Share link
                  </button>
                  <a
                    href={`/api/schedules/${s.id}/pdf`}
                    className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-100"
                  >
                    PDF
                  </a>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "published"
      ? "bg-emerald-50 text-emerald-700"
      : status === "archived"
        ? "bg-gray-100 text-gray-500"
        : "bg-amber-50 text-amber-700";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{status}</span>
  );
}
