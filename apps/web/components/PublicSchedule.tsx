/**
 * Read-only, server-rendered view of a shared schedule. No client JS, no auth.
 * Used by the public /s/[token] routes.
 */
import { deptColor } from "@/lib/client/palette";
import type { PublicScheduleView } from "@/lib/data/share";

function legend(view: PublicScheduleView) {
  return view.departments.map((d, i) => (
    <span
      key={d.name}
      className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: deptColor(i) }}
    >
      {d.name} · {d.weeks}w
    </span>
  ));
}

export function PublicSchedule({ view }: { view: PublicScheduleView }) {
  const weeks = Array.from({ length: view.totalWeeks }, (_, i) => i);
  return (
    <main className="mx-auto max-w-[1400px] p-6">
      <header className="mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{view.configName}</h1>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-600">
            v{view.version} · {view.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {view.scope === "per_intern" ? "Personal rotation" : "Full roster"} · {view.totalWeeks} weeks ·
          shared read-only
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">{legend(view)}</div>
      </header>

      <div className="overflow-x-auto rounded border border-slate-200">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-slate-50 px-2 py-1 text-left font-semibold">
                Intern
              </th>
              {weeks.map((w) => (
                <th key={w} className="border-b border-slate-200 px-1 py-1 text-center font-normal text-slate-400">
                  {w + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.assignments.map((a) => {
              const cells = new Array<{ dept: number; name: string } | null>(view.totalWeeks).fill(null);
              for (const blk of a.rotation) {
                for (let w = blk.start; w <= blk.end; w++) {
                  cells[w] = { dept: blk.dept, name: blk.deptName };
                }
              }
              return (
                <tr key={a.internIndex}>
                  <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-2 py-1 font-medium whitespace-nowrap">
                    {a.internLabel}
                  </td>
                  {cells.map((c, w) => (
                    <td
                      key={w}
                      title={c ? `Week ${w + 1}: ${c.name}` : undefined}
                      className="h-6 border-b border-slate-100 text-center"
                      style={c ? { backgroundColor: deptColor(c.dept) } : undefined}
                    />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="mt-4 text-xs text-slate-400">Generated {new Date(view.generatedAt).toLocaleDateString()} · RotationPlanner</footer>
    </main>
  );
}
