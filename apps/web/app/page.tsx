import Link from "next/link";

const features: { title: string; body: string }[] = [
  {
    title: "Proven scheduling engine",
    body: "A deterministic, dependency-free algorithm assigns every intern a contiguous, complete rotation across all departments — the same engine, re-run on the server, validates every roster before it is ever saved.",
  },
  {
    title: "Per-department coverage rules",
    body: "Set a minimum number of interns required in each department every week. The engine respects elevated thresholds (e.g. a busy Casualty) and flags any week that cannot be staffed.",
  },
  {
    title: "Versioned & immutable rosters",
    body: "Every save is a new version. Publish a roster and it is frozen — no silent edits. Manual swaps are re-validated by the engine and recorded in an append-only audit log.",
  },
  {
    title: "Multi-tenant by design",
    body: "Each organization's data is isolated at the data layer. Every query is tenant-scoped, so one hospital can never see another's configs or schedules.",
  },
  {
    title: "Shareable, read-only links",
    body: "Publish a full roster or a single intern's rotation behind an unguessable link. Recipients see a clean, public view with no login and no access to anything else.",
  },
  {
    title: "Export to PDF",
    body: "Generate a printable, landscape roster for noticeboards and handovers — one line per intern, every rotation block laid out across the year.",
  },
];

const steps: { n: string; title: string; body: string }[] = [
  {
    n: "1",
    title: "Configure",
    body: "Start from the NMC CRMI 2021 template or build your own: set the number of interns and each department's weeks and minimum coverage.",
  },
  {
    n: "2",
    title: "Generate & review",
    body: "Generate a schedule in the browser, then review it as a timeline, a coverage heatmap, or per-intern cards. Swap interns and re-validate instantly.",
  },
  {
    n: "3",
    title: "Publish & share",
    body: "Save a version, publish it to freeze it, then share a read-only link or export a PDF for the whole department.",
  },
];

export default function HomePage() {
  return (
    <main className="text-gray-900">
      {/* Top bar */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="text-lg font-bold tracking-tight">RotationPlanner</span>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/login" className="font-medium text-gray-600 hover:text-gray-900">
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-fg"
          >
            Get started
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-12 sm:pt-20">
        <div className="max-w-3xl">
          <p className="mb-4 inline-block rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-brand-fg">
            For medical internship coordinators
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Intern rotation schedules that are{" "}
            <span className="text-brand">valid, versioned, and shareable</span>.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-gray-600">
            Generate a full year of intern rotations in seconds. Every roster is
            re-validated on the server, versioned for an audit trail, and
            shareable as a read-only link or PDF — across departments, with
            strict per-organization isolation.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/register"
              className="rounded-md bg-brand px-6 py-3 font-medium text-white hover:bg-brand-fg"
            >
              Create a free account
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-gray-300 px-6 py-3 font-medium hover:bg-gray-100"
            >
              Log in
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-bold tracking-tight">How it works</h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n}>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
                  {s.n}
                </div>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-bold tracking-tight">
          Everything a coordinator needs
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-lg border border-gray-200 bg-white p-6"
            >
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-6 py-16 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Build your first roster today
            </h2>
            <p className="mt-2 text-gray-600">
              Set up an organization, load the NMC template, and publish a
              validated schedule in minutes.
            </p>
          </div>
          <Link
            href="/register"
            className="shrink-0 rounded-md bg-brand px-6 py-3 font-medium text-white hover:bg-brand-fg"
          >
            Get started
          </Link>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-10 text-sm text-gray-500">
        RotationPlanner — multi-tenant intern rotation scheduling.
      </footer>
    </main>
  );
}
