// Generates build/icon.ico for the desktop app from the web project's
// favicon (public/favicon.ico), so the Windows exe / installer / taskbar /
// desktop shortcut all carry the same Zeus mark as the website.
//
// The favicon ships as a single 256x256 frame, which satisfies
// electron-builder's minimum requirement ("at least 256x256") and renders
// cleanly at smaller sizes via Explorer's smooth downscaling.
//
// Run via `npm run desktop:icons` (invoked automatically by desktop:build).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "public", "favicon.ico");
const outDir = path.join(root, "build");

fs.mkdirSync(outDir, { recursive: true });

if (!fs.existsSync(source)) {
  console.error("[icons] missing source: public/favicon.ico");
  process.exit(1);
}

fs.copyFileSync(source, path.join(outDir, "icon.ico"));
console.log(`[icons] build/icon.ico written from public/favicon.ico (${fs.statSync(source).size} bytes)`);
