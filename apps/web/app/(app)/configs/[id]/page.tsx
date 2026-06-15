import Link from "next/link";

import { getConfig } from "@/lib/data/configs";
import { requireTenant } from "@/lib/tenant";
import { ConfigWorkspace } from "@/components/ConfigWorkspace";

export const dynamic = "force-dynamic";

export default async function ConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireTenant();
  const { id } = await params;
  const config = await getConfig(ctx, id);

  if (!config) {
    return (
      <div>
        <p className="text-gray-600">Configuration not found.</p>
        <Link href="/dashboard" className="text-brand hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link href="/dashboard" className="text-sm text-brand hover:underline">
        ← Dashboard
      </Link>
      <ConfigWorkspace
        configId={config.id}
        name={config.name}
        nInterns={config.nInterns}
        seed={config.seed}
        departments={config.departments.map((d) => ({
          name: d.name,
          weeks: d.weeks,
          minCoverage: d.minCoverage,
        }))}
      />
    </div>
  );
}
