// Single source of truth for the production URL used in SEO tags
// (canonical links, OpenGraph/Twitter URLs, JSON-LD, sitemap.xml, robots.txt).
//
// Set VITE_SITE_URL in your environment (and on Vercel) once you've picked
// your production domain — every page picks it up automatically. Falls back
// to a placeholder Zeus AI domain so nothing crashes if it's unset, but you
// should override it before going live.
export const SITE_URL =
  (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, "") ||
  "https://zeusai.website";
