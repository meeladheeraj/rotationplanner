import Link from "next/link";

import { listConfigs } from "@/lib/data/configs";
import { requireTenant } from "@/lib/tenant";
import { NewConfigButton } from "@/components/NewConfigButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await requireTenant();
  const configs = await listConfigs(ctx);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configurations</h1>
          <p className="text-sm text-gray-500">
            Define department durations and coverage, then generate rosters.
          </p>
        </div>
        <NewConfigButton />
      </div>

      {configs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center text-gray-500">
          No configurations yet. Create one from the NMC preset to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {configs.map((c) => (
            <Link
              key={c.id}
              href={`/configs/${c.id}`}
              className="rounded-lg border border-gray-200 bg-white p-4 transition hover:border-brand hover:shadow-sm"
            >
              <div className="font-semibold">{c.name}</div>
              <div className="mt-1 text-sm text-gray-500">
                {c.nInterns} interns · {c.departments.length} depts · {c.totalWeeks}w
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
