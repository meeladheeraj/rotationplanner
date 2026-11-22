import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://rotationplanner.in/", changeFrequency: "monthly", priority: 1 },
    { url: "https://rotationplanner.in/register", changeFrequency: "yearly", priority: 0.5 },
    { url: "https://rotationplanner.in/login", changeFrequency: "yearly", priority: 0.3 },
  ];
}
