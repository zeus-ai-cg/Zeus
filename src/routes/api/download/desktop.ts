// Public desktop installer redirect. Available to every plan — including
// Free — by design: the desktop app is the top of the funnel. The heavy
// artifact lives on external hosting; this route just forwards and logs.

import { createFileRoute } from "@tanstack/react-router";

const FALLBACK_MESSAGE = "Desktop download is not configured yet.";

export const Route = createFileRoute("/api/download/desktop")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const url = process.env.ZEUS_DESKTOP_SETUP_URL;
          if (!url) {
            console.error("[download.desktop] not_configured: ZEUS_DESKTOP_SETUP_URL is not set");
            return new Response(FALLBACK_MESSAGE, {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            });
          }
          console.info("[download.desktop] redirect");
          return new Response(null, {
            status: 302,
            headers: { Location: url, "Cache-Control": "no-store" },
          });
        } catch (error) {
          console.error("[download.desktop] failed", error);
          return new Response("Download failed. Please retry.", {
            status: 500,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      },
    },
  },
});
