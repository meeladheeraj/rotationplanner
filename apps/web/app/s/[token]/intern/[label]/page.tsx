import { notFound } from "next/navigation";

import { getDb } from "@/db";
import { getSharedSchedule } from "@/lib/data/share";
import { PublicSchedule } from "@/components/PublicSchedule";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string; label: string }> };

// Narrow a (full-scope) share link to a single intern by label. per_intern tokens
// are already pinned, so this is mainly for full links that want a per-person view.
export default async function ShareInternPage({ params }: Props) {
  const { token, label } = await params;
  const view = await getSharedSchedule(getDb(), token);
  if (!view) notFound();

  const wanted = decodeURIComponent(label);
  const assignments = view.assignments.filter((a) => a.internLabel === wanted);
  if (assignments.length === 0) notFound();

  return <PublicSchedule view={{ ...view, scope: "per_intern", assignments }} />;
}
