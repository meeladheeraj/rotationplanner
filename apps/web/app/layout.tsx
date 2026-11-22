import type { Metadata } from "next";
import "./globals.css";

const description =
  "Generate a full year of medical intern rotations in seconds. Rosters are validated, versioned for an audit trail, and shareable as a read-only link or PDF.";

export const metadata: Metadata = {
  metadataBase: new URL("https://rotationplanner.in"),
  title: { default: "RotationPlanner · Intern rotation schedules for medical internships", template: "%s · RotationPlanner" },
  description,
  openGraph: { type: "website", siteName: "RotationPlanner", url: "/", title: "RotationPlanner", description },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
