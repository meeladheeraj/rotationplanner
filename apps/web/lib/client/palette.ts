// Department color palette (ported from rotation_planner.jsx).
export const PALETTE = [
  "#2563EB", "#DC2626", "#059669", "#D97706", "#7C3AED", "#DB2777",
  "#0891B2", "#65A30D", "#EA580C", "#4F46E5", "#0D9488", "#B91C1C",
  "#1D4ED8", "#9333EA", "#C026D3", "#CA8A04", "#16A34A", "#E11D48",
  "#0284C7", "#6D28D9",
];

export function deptColor(deptIndex: number): string {
  return PALETTE[deptIndex % PALETTE.length] ?? "#2563EB";
}
