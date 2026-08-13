/**
 * The public, canonical origin of the marketing site.
 *
 * Distinct from APP_URL (the signed-in application, app.claimtive.com): search
 * engines should only ever be pointed at the apex marketing domain, which is
 * also what public/robots.txt advertises the sitemap under. Override with
 * SITE_URL if the marketing site moves.
 */
export const SITE_URL = (
  process.env.SITE_URL ?? "https://claimtive.com"
).replace(/\/+$/, "");
