// Public update feed for the VS Code extension (auto-update check).
//
// The installed extension polls this on activation: if the version here is
// newer than the running one, it nudges the user to grab the fresh .vsix
// from /download. Deliberately unauthenticated — version metadata is not
// sensitive; the actual .vsix download stays plan-gated at
// /api/download/vsix.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/vscode/latest")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const version = process.env.ZEUS_VSIX_VERSION;
          if (!version) {
            return new Response(JSON.stringify({ available: false }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(
            JSON.stringify({ available: true, version, url: "/download" }),
            {
              status: 200,
              headers: { "Content-Type": "application/json", "Cache-Control": "max-age=300" },
            },
          );
        } catch (error) {
          console.error("[vscode.latest] failed", error);
          return new Response(JSON.stringify({ available: false }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
