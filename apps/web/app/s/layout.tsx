import type { Metadata } from "next";

// Shared rosters are public by link only; keep them out of every search index.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function SharedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
