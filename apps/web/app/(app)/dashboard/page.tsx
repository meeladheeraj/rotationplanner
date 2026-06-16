import Link from "next/link";

import { listConfigs } from "@/lib/data/configs";
import { requireTenant } from "@/lib/tenant";
import { NewConfigButton } from "@/components/NewConfigButton";
import { EmptyConfigsArt } from "@/components/Illustrations";

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
        <div className="flex flex-col items-center rounded-lg border border-dashed border-gray-300 px-6 py-14 text-center">
          <EmptyConfigsArt className="h-28 w-28 text-brand" />
          <h2 className="mt-5 text-base font-semibold text-gray-700">No configurations yet</h2>
          <p className="mt-1 max-w-sm text-sm text-gray-500">
            Create one from the NMC CRMI 2021 preset (or build your own) to generate your first
            validated rotation roster.
          </p>
          <div className="mt-5">
            <NewConfigButton />
          </div>
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
