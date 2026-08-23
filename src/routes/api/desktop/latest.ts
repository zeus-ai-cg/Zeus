// Public update feed for the desktop app.
//
// Mirrors /api/vscode/latest: the desktop shell can poll this to learn the
// newest installer version and URL, and electron-updater-style flows can use
// it as the source of truth for "is there a newer build?" without any static
// file hosting beyond the artifact itself.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/desktop/latest")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const version = process.env.ZEUS_DESKTOP_VERSION;
          const url = process.env.ZEUS_DESKTOP_SETUP_URL;
          if (!version || !url) {
            return new Response(JSON.stringify({ available: false }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ available: true, version, url }), {
            status: 200,
            headers: { "Content-Type": "application/json", "Cache-Control": "max-age=300" },
          });
        } catch (error) {
          console.error("[desktop.latest] failed", error);
          return new Response(JSON.stringify({ available: false }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
