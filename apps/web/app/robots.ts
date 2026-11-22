import type { MetadataRoute } from "next";

// Only the public marketing pages are crawlable. Share links (/s/...) hold real rosters:
// they stay out of search even though anyone with the link can open them.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/s/", "/api/", "/dashboard", "/configs/", "/schedules/"],
    },
    sitemap: "https://rotationplanner.in/sitemap.xml",
  };
}
