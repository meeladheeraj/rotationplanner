/**
 * Hand-crafted, dependency-free SVG illustrations + iconography for RotationPlanner.
 *
 * Design rules:
 *  - All artwork is inline SVG — no external assets, no licensing, tiny payload.
 *  - Themeable: line work uses `currentColor`, so colour follows the parent's
 *    text colour (e.g. wrap in `text-brand`). Depth comes from opacity, not extra
 *    hues, so a single colour token themes the whole set.
 *  - Crisp at any size: every piece declares a viewBox and scales via className.
 *  - Decorative by default (`aria-hidden`); pass a `title` for meaningful art.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function svgProps({ title, ...rest }: IconProps) {
  return {
    ...rest,
    role: title ? ("img" as const) : undefined,
    "aria-hidden": title ? undefined : true,
  };
}

/* ------------------------------------------------------------------ */
/* Brand mark — a path traced through a 3×3 grid of interns.           */
/* Self-contained two-tone tile (blue field, white nodes + path).      */
/* ------------------------------------------------------------------ */

export function LogoMark({ className = "h-7 w-7", ...props }: IconProps) {
  // 3×3 grid centres; the three "active" nodes are linked into a path.
  const cols = [18, 32, 46];
  const rows = [18, 32, 46];
  const active = new Set(["46,18", "18,32", "32,46"]); // TR → ML → BM
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} {...svgProps(props)}>
      {props.title && <title>{props.title}</title>}
      <defs>
        <linearGradient id="rpLogoGrad" x1="14" y1="8" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="0.55" stopColor="#2563eb" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#rpLogoGrad)" />
      {/* connecting path, tucked under the active nodes */}
      <path
        d="M46 18 L18 32 L32 46"
        stroke="#ffffff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
        fill="none"
      />
      {rows.map((cy) =>
        cols.map((cx) => {
          const on = active.has(`${cx},${cy}`);
          return (
            <circle
              key={`${cx}-${cy}`}
              cx={cx}
              cy={cy}
              r={on ? 6 : 5}
              fill="#ffffff"
              opacity={on ? 1 : 0.32}
            />
          );
        }),
      )}
    </svg>
  );
}

/** Logo mark + wordmark, for headers and auth screens. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className="h-7 w-7 text-brand" />
      <span className="text-lg font-bold tracking-tight">RotationPlanner</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Empty-state illustrations.                                          */
/* ------------------------------------------------------------------ */

/** No configurations yet — a blank planning board waiting for a first config. */
export function EmptyConfigsArt({ className = "h-32 w-32 text-brand" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={className} aria-hidden>
      <circle cx="60" cy="60" r="56" fill="currentColor" opacity="0.06" />
      <rect x="30" y="28" width="60" height="64" rx="8" stroke="currentColor" strokeWidth="3" />
      <path d="M30 44h60" stroke="currentColor" strokeWidth="3" />
      <path d="M44 22v12M76 22v12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M42 58h22M42 70h30M42 82h16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.4" />
      {/* plus badge */}
      <circle cx="84" cy="84" r="14" fill="currentColor" />
      <path d="M84 78v12M78 84h12" stroke="white" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** No saved versions yet — a stack of roster cards. */
export function EmptySchedulesArt({ className = "h-20 w-20 text-brand" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={className} aria-hidden>
      <circle cx="60" cy="60" r="56" fill="currentColor" opacity="0.06" />
      <rect x="34" y="40" width="52" height="14" rx="4" stroke="currentColor" strokeWidth="3" opacity="0.45" />
      <rect x="30" y="56" width="60" height="14" rx="4" stroke="currentColor" strokeWidth="3" opacity="0.7" />
      <rect x="34" y="72" width="52" height="14" rx="4" stroke="currentColor" strokeWidth="3" />
      <circle cx="78" cy="79" r="3" fill="currentColor" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Hero illustration — a validated rotation timeline.                  */
/* ------------------------------------------------------------------ */

export function HeroArt({ className = "" }: { className?: string }) {
  const rows = [
    [
      { x: 16, w: 70, o: 0.9 },
      { x: 90, w: 40, o: 0.55 },
      { x: 134, w: 54, o: 0.3 },
    ],
    [
      { x: 16, w: 44, o: 0.55 },
      { x: 64, w: 60, o: 0.3 },
      { x: 128, w: 60, o: 0.9 },
    ],
    [
      { x: 16, w: 36, o: 0.3 },
      { x: 56, w: 50, o: 0.9 },
      { x: 110, w: 78, o: 0.55 },
    ],
  ];
  return (
    <svg viewBox="0 0 240 200" fill="none" className={className} aria-hidden>
      <rect x="4" y="8" width="232" height="160" rx="14" fill="currentColor" opacity="0.05" />
      <rect x="4" y="8" width="232" height="160" rx="14" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      {/* week gridlines */}
      {[60, 116, 172].map((x) => (
        <path key={x} d={`M${x} 16V160`} stroke="currentColor" strokeWidth="1" opacity="0.12" />
      ))}
      {/* intern rows of contiguous rotation blocks */}
      {rows.map((row, i) => (
        <g key={i} transform={`translate(0 ${40 + i * 38})`}>
          <circle cx="-2" cy="9" r="0" />
          {row.map((b, j) => (
            <rect key={j} x={b.x} y={0} width={b.w} height={18} rx={5} fill="currentColor" opacity={b.o} />
          ))}
        </g>
      ))}
      {/* validated badge */}
      <circle cx="206" cy="156" r="22" fill="currentColor" />
      <path d="M196 156l7 7 13-14" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Feature icons (24×24 line icons, currentColor).                     */
/* ------------------------------------------------------------------ */

const ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconEngine({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg {...ICON} className={className} aria-hidden>
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4" />
    </svg>
  );
}

export function IconCoverage({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg {...ICON} className={className} aria-hidden>
      <path d="M12 3l7 3v5c0 4.2-2.8 7.5-7 9-4.2-1.5-7-4.8-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function IconVersions({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg {...ICON} className={className} aria-hidden>
      <path d="M12 3l8 4.5-8 4.5-8-4.5L12 3z" />
      <path d="M4 12l8 4.5 8-4.5M4 16.5l8 4.5 8-4.5" />
    </svg>
  );
}

export function IconTenant({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg {...ICON} className={className} aria-hidden>
      <rect x="4" y="4" width="9" height="16" rx="1.5" />
      <path d="M13 9h7v11h-7" />
      <path d="M7 8h3M7 12h3M7 16h3M16 12h1M16 16h1" />
    </svg>
  );
}

export function IconShare({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg {...ICON} className={className} aria-hidden>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" />
    </svg>
  );
}

export function IconPdf({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg {...ICON} className={className} aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
      <path d="M14 3v5h5" />
      <path d="M8.5 13h7M8.5 16h4" opacity="0.6" />
    </svg>
  );
}
