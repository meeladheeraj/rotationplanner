import Link from "next/link";
import type { Department } from "@rp/engine";

import { getConfig } from "@/lib/data/configs";
import { getScheduleDetail } from "@/lib/data/schedules";
import { requireTenant } from "@/lib/tenant";
import { reconstructResult } from "@/lib/schedule/reconstruct";
import { NamedScheduleView } from "@/components/NamedScheduleView";
import { LeaveControl } from "@/components/LeaveControl";
import { CarryOverControl } from "@/components/CarryOverControl";

export const dynamic = "force-dynamic";

/**
 * Authenticated, in-app view of a persisted (draft or published) schedule.
 * Loads via the tenant-scoped data layer and reconstructs the engine
 * GenerateResult so the existing ScheduleViews (timeline/heatmap/cards) render
 * exactly as they do for a freshly-generated result. (FEEDBACK #4.)
 */
export default async function ScheduleViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireTenant();
  const { id } = await params;
  const detail = await getScheduleDetail(ctx, id);

  if (!detail) {
    return (
      <div>
        <p className="text-gray-600">Schedule not found.</p>
        <Link href="/dashboard" className="text-brand hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  const config = await getConfig(ctx, detail.configId);
  const departments: Department[] = (config?.departments ?? []).map((d) => ({
    name: d.name,
    weeks: d.weeks,
    minCoverage: d.minCoverage,
  }));

  const result = reconstructResult(detail.assignments, departments, detail.stats);

  return (
    <div>
      <div className="flex items-center gap-3">
        {config && (
          <Link href={`/configs/${config.id}`} className="text-sm text-brand hover:underline">
            ← {config.name}
          </Link>
        )}
        <Link href="/dashboard" className="text-sm text-gray-400 hover:underline">
          Dashboard
        </Link>
      </div>

      <div className="mt-2 mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">
          {config?.name ?? "Schedule"} · v{detail.version}
        </h1>
        <StatusPill status={detail.status} />
        <span className="text-xs text-gray-400">
          {detail.assignments.length} interns · {detail.stats.totalWeeks} weeks · min{" "}
          {detail.stats.minCount}/dept/wk
        </span>
        {(ctx.user.role === "owner" || ctx.user.role === "admin") && (
          <div className="ml-auto flex gap-2">
            <LeaveControl
              scheduleId={detail.id}
              totalWeeks={detail.stats.totalWeeks}
              interns={detail.assignments
                .map((a) => ({ index: a.internIndex, label: a.internLabel }))
                .sort((x, y) => x.index - y.index)}
            />
            <CarryOverControl
              scheduleId={detail.id}
              departments={departments.map((d, i) => ({ index: i, name: d.name }))}
            />
          </div>
        )}
      </div>

      <NamedScheduleView
        result={result}
        departments={departments}
        scheduleId={detail.id}
        configName={config?.name ?? "Schedule"}
        version={detail.version}
      />
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "published"
      ? "bg-emerald-50 text-emerald-700"
      : status === "archived"
        ? "bg-gray-100 text-gray-500"
        : "bg-amber-50 text-amber-700";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
}
