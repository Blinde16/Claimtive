import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Sitemap for the PUBLIC marketing surface only.
 *
 * public/robots.txt has always advertised /sitemap.xml; until now nothing
 * served it, so every crawler that followed the pointer got a 404.
 *
 * Deliberately excluded: /login and /signup (auth screens, and both carry
 * `robots: { index: false }`), and everything under app/(app) — the signed-in
 * application, which is auth-gated and also noindexed via the group layout.
 * A sitemap entry is a request to index, so anything noindexed must not be here.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1
    }
  ];
}
