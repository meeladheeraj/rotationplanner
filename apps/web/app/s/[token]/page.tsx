import { notFound } from "next/navigation";

import { getDb } from "@/db";
import { getSharedSchedule } from "@/lib/data/share";
import { PublicSchedule } from "@/components/PublicSchedule";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export default async function SharePage({ params }: Props) {
  const { token } = await params;
  const view = await getSharedSchedule(getDb(), token);
  if (!view) notFound();
  return <PublicSchedule view={view} />;
}
