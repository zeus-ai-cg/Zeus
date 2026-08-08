// Copies the repo `.env` (server-side secrets: SUPABASE_SERVICE_ROLE_KEY,
// GEMINI_API_KEY, API_KEY_ENCRYPTION_SECRET, ...) into `.output/.env` so the
// packaged desktop app can hand them to the Nitro server at runtime
// (see electron/main.mjs → loadEnvFile).
//
// NOTE: this embeds those secrets in the installer. Anyone who downloads the
// installer can read them (app.asar.unpacked/.output/.env). For a public
// release, rotate keys for the desktop distribution or require per-user keys.
//
// Fails the build when `.env` is missing — shipping an installer without
// runtime secrets would just produce a silently broken app.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, ".env");
const destDir = path.join(root, ".output");

if (!fs.existsSync(src)) {
  console.error(
    "[copy-env] FATAL: no .env found — the packaged app would have no runtime secrets.",
  );
  console.error("[copy-env] Create .env from .env.example before building the desktop installer.");
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, path.join(destDir, ".env"));
console.log("[copy-env] Copied .env -> .output/.env");
