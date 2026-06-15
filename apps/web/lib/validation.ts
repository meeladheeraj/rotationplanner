/** Tiny dependency-free request validation helpers. */

export function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export function isEmail(v: string): boolean {
  // Deliberately permissive; real validation is "can we send to it", out of scope.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254;
}

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  return base || "tenant";
}
