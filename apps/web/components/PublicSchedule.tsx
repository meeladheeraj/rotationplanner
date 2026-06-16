/**
 * Read-only, public view of a shared schedule. No auth.
 *
 * FEEDBACK #6: rather than a bare roster table, the share link now renders the
 * SAME views as the in-app experience — timeline, coverage heatmap, per-student
 * cards, and the by-department pivot — by reconstructing the engine result and
 * reusing the existing `ScheduleViews` component. The views carry no mutating
 * affordances, so they are inherently read-only here. For a per_intern link the
 * data is already filtered to that single student, so every tab shows just them.
 */
import type { Department } from "@rp/engine";

import { reconstructResult } from "@/lib/schedule/reconstruct";
import type { PublicScheduleView } from "@/lib/data/share";
import { ScheduleViews } from "@/components/ScheduleViews";
import { LogoMark } from "@/components/Illustrations";

export function PublicSchedule({ view }: { view: PublicScheduleView }) {
  const departments: Department[] = view.departments.map((d) => ({
    name: d.name,
    weeks: d.weeks,
    minCoverage: d.minCoverage,
  }));
  const result = reconstructResult(view.assignments, departments, view.stats);

  return (
    <main className="mx-auto max-w-[1400px] p-6">
      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <LogoMark className="h-7 w-7 text-brand" />
          <h1 className="text-xl font-semibold">{view.configName}</h1>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-600">
            v{view.version} · {view.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {view.scope === "per_intern" ? "Personal rotation" : "Full roster"} · {view.totalWeeks} weeks ·
          shared read-only
        </p>
      </header>

      <ScheduleViews result={result} departments={departments} />

      <footer className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-400">
        Generated {new Date(view.generatedAt).toLocaleDateString()} · RotationPlanner · read-only share
      </footer>
    </main>
  );
}
