import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">RotationPlanner</h1>
        <p className="mt-3 text-lg text-gray-600">
          Generate, validate, version, and share intern rotation schedules —
          multi-tenant, server-authoritative, auditable.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-md bg-brand px-5 py-2.5 font-medium text-white hover:bg-brand-fg"
        >
          Log in
        </Link>
        <Link
          href="/register"
          className="rounded-md border border-gray-300 px-5 py-2.5 font-medium hover:bg-gray-100"
        >
          Create an account
        </Link>
      </div>
    </main>
  );
}
