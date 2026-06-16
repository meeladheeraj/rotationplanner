"use client";

import { useCallback, useEffect, useState } from "react";

import { EmptySchedulesArt } from "@/components/Illustrations";

interface ScheduleSummary {
  id: string;
  version: number;
  status: "draft" | "published" | "archived";
  generatedAt: string;
  stats: { minCount: number; maxCount: number; totalWeeks: number; coverageViolations?: number };
}

/** Pull a human message out of an API error body, unwrapping the JSON-encoded
 *  validation payload that publish/save use to carry violations. */
function errorMessage(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.message === "string") {
      const n = Array.isArray(parsed.violations) ? parsed.violations.length : 0;
      return n > 0 ? `${parsed.message} (${n} shortfall${n === 1 ? "" : "s"})` : parsed.message;
    }
  } catch {
    /* not JSON — use the raw string */
  }
  return raw || fallback;
}

export function SavedSchedules({ configId, refreshKey }: { configId: string; refreshKey: number }) {
  const [items, setItems] = useState<ScheduleSummary[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Share URL created per schedule id, so the dedicated copy-URL button can re-copy it.
  const [shareUrls, setShareUrls] = useState<Record<string, string>>({});
  // Schedule id whose URL was just copied (drives the transient "Copied!" confirmation).
  const [copied, setCopied] = useState<string | null>(null);

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
      if (!res.ok) throw new Error(errorMessage(data.error, "Publish failed"));
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
      setShareUrls((prev) => ({ ...prev, [id]: url }));
      await copyUrl(id, url);
      setNote(`Share link ready: ${url}`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Share failed");
    } finally {
      setBusy(null);
    }
  }

  async function copyUrl(id: string, url: string) {
    try {
      await navigator.clipboard?.writeText(url);
    } catch {
      // Clipboard may be unavailable (insecure context / permissions); the URL stays
      // visible in the note so the user can copy it manually.
    }
    setCopied(id);
    window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1800);
  }

  if (items.length === 0) {
    return (
      <section className="mt-8 rounded-lg border border-dashed border-gray-300 bg-white px-5 py-10">
        <div className="flex flex-col items-center text-center">
          <EmptySchedulesArt className="h-16 w-16 text-brand" />
          <h2 className="mt-3 text-sm font-semibold text-gray-700">No saved versions yet</h2>
          <p className="mt-1 max-w-xs text-xs text-gray-500">
            Generate a schedule above and click “Save schedule” to keep a version here — then
            publish, share, or export it.
          </p>
        </div>
      </section>
    );
  }

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
              <td className="py-2 pr-3 text-xs text-gray-500">
                min {s.stats.minCount}/dept/wk
                {(s.stats.coverageViolations ?? 0) > 0 && (
                  <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                    below minimum · {s.stats.coverageViolations}
                  </span>
                )}
              </td>
              <td className="py-2 text-right">
                <div className="flex justify-end gap-2">
                  <a
                    href={`/schedules/${s.id}`}
                    className="rounded border border-brand px-3 py-1 text-xs text-brand hover:bg-brand/5"
                  >
                    View
                  </a>
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
                  {shareUrls[s.id] && (
                    <button
                      type="button"
                      onClick={() => copyUrl(s.id, shareUrls[s.id]!)}
                      title="Copy share URL"
                      aria-label="Copy share URL"
                      className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100"
                    >
                      {copied === s.id ? (
                        <>
                          <CheckIcon />
                          <span className="text-emerald-700">Copied!</span>
                        </>
                      ) : (
                        <>
                          <CopyIcon />
                          <span className="sr-only">Copy URL</span>
                        </>
                      )}
                    </button>
                  )}
                  <a
                    href={`/api/schedules/${s.id}/pdf`}
                    className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-100"
                  >
                    PDF
                  </a>
                  <a
                    href={`/api/schedules/${s.id}/xlsx`}
                    className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-100"
                  >
                    Excel
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

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-700" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
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
