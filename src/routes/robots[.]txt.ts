import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { SITE_URL } from "@/lib/site";

// Same disallow list as before (all authenticated app routes stay out of the
// index) — now generated from SITE_URL so it can never drift from sitemap.xml.
const DISALLOWED_PATHS = [
  "/dashboard",
  "/snippets",
  "/connectors",
  "/profile",
  "/billing",
  "/settings",
  "/onboarding",
  "/upgrade",
  "/chat",
  "/auth",
  "/api/",
];

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () => {
        const lines = [
          "User-agent: *",
          "Allow: /",
          ...DISALLOWED_PATHS.map((p) => `Disallow: ${p}`),
          "",
          `Sitemap: ${SITE_URL}/sitemap.xml`,
        ];

        return new Response(lines.join("\n"), {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
