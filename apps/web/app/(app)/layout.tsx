import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/session";
import { LogoutButton } from "@/components/LogoutButton";
import { LogoMark } from "@/components/Illustrations";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-lg font-bold tracking-tight">
            <LogoMark className="h-6 w-6 text-brand" />
            RotationPlanner
          </Link>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span className="hidden sm:inline">{user.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}
