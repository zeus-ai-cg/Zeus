// Desktop build config — same app, but Nitro emits a runnable node server
// (.output/server/index.mjs) instead of the Vercel serverless handler.
// The web config (vite.config.ts) is intentionally left untouched.
//
// IMPORTANT: keep the app-level options (tanstackStart, vite) in sync with
// vite.config.ts — only the `nitro.preset` differs (node-server vs vercel).

import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },

  nitro: {
    preset: "node-server",
  },

  vite: {
    server: {
      allowedHosts: ["veal-backpack-catcall.ngrok-free.dev"],
    },
  },
});
