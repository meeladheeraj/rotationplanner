import type { ReactNode } from "react";
import Link from "next/link";
import { AuthSceneBg, LogoMark } from "@/components/Illustrations";
import { getCurrentUser } from "@/lib/session";

const BENEFITS: { title: string; body: string }[] = [
  {
    title: "Auto-generated rotations",
    body: "The engine assigns every intern a complete, contiguous rotation while respecting all coverage rules.",
  },
  {
    title: "Coverage heatmaps",
    body: "Spot understaffed weeks before you publish — never leave a department empty.",
  },
  {
    title: "One-click export",
    body: "Share a roster as PDF or a public read-only link with your team in seconds.",
  },
];

function CheckBadge() {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/40">
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden>
        <path d="M3 8.5 L6.5 12 L13 4.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/**
 * Split-screen shell for the login / register screens.
 * Left: blue brand panel with the value prop (hidden below lg).
 * Right: tinted panel with a decorative schedule scene behind a floating card.
 */
export async function AuthLayout({
  heading,
  subheading,
  children,
}: {
  heading: string;
  subheading: string;
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  const homeHref = user ? "/dashboard" : "/";
  return (
    <main className="flex min-h-screen">
      {/* Left — brand panel */}
      <aside className="relative hidden w-[44%] max-w-[560px] flex-col justify-between overflow-hidden bg-gradient-to-br from-blue-500 via-brand to-brand-fg px-12 py-10 text-white lg:flex">
        {/* faint dotted grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1.4px, transparent 1.4px)",
            backgroundSize: "26px 26px",
          }}
        />
        <Link href={homeHref} className="relative flex items-center gap-2.5 transition-opacity hover:opacity-90">
          <LogoMark className="h-9 w-9" />
          <span className="text-xl font-bold tracking-tight">RotationPlanner</span>
        </Link>

        <div className="relative max-w-md">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-blue-100/90">
            Medical scheduling, simplified
          </p>
          <h2 className="text-[2.6rem] font-bold leading-[1.08] tracking-tight">
            Build validated intern rosters in minutes — not days.
          </h2>
          <ul className="mt-9 space-y-5">
            {BENEFITS.map((b) => (
              <li key={b.title} className="flex gap-3">
                <CheckBadge />
                <div>
                  <p className="font-semibold leading-tight">{b.title}</p>
                  <p className="text-sm leading-snug text-blue-100/85">{b.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-blue-100/70">© {new Date().getFullYear()} RotationPlanner</p>
      </aside>

      {/* Right — form panel */}
      <section className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-slate-100 px-6 py-12">
        <AuthSceneBg className="pointer-events-none absolute inset-0 h-full w-full opacity-70" />

        {/* mobile-only brand row (left panel is hidden < lg) */}
        <Link href={homeHref} className="relative mb-8 flex items-center gap-2 lg:hidden">
          <LogoMark className="h-8 w-8" />
          <span className="text-lg font-bold tracking-tight text-slate-900">RotationPlanner</span>
        </Link>

        <div className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-xl shadow-slate-300/40 ring-1 ring-slate-200/70">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{heading}</h1>
          <p className="mt-1 text-sm text-slate-500">{subheading}</p>
          <div className="mt-6">{children}</div>
        </div>

        <p className="relative mt-6 text-center text-xs text-slate-400">
          By continuing you agree to our{" "}
          <span className="underline underline-offset-2">Terms</span> &{" "}
          <span className="underline underline-offset-2">Privacy</span>.
        </p>
      </section>
    </main>
  );
}
