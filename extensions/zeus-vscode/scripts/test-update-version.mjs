// Unit tests for the auto-update version comparator (src/semver.ts).
// Bundled with esbuild the same way test-phase3.mjs handles TypeScript.

import { strict as assert } from "node:assert";
import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const here = join(fileURLToPath(new URL(".", import.meta.url)));

const outDir = mkdtempSync(join(tmpdir(), "zeus-update-test-"));
try {
  await build({
    entryPoints: [resolve(here, "../src/semver.ts")],
    outfile: join(outDir, "semver.mjs"),
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node18",
    logLevel: "silent",
  });
  const { isNewerVersion } = await import(pathToFileURL(join(outDir, "semver.mjs")).href);

  let passed = 0;
  const check = (label, fn) => {
    fn();
    passed += 1;
  };

  check("newer patch", () => assert.ok(isNewerVersion("0.4.1", "0.4.0")));
  check("newer minor", () => assert.ok(isNewerVersion("0.5.0", "0.4.9")));
  check("newer major", () => assert.ok(isNewerVersion("1.0.0", "0.9.9")));
  check("equal is not newer", () => assert.ok(!isNewerVersion("0.4.0", "0.4.0")));
  check("older is not newer", () => assert.ok(!isNewerVersion("0.3.9", "0.4.0")));
  check("leading v tolerated", () => assert.ok(isNewerVersion("v0.5.0", "0.4.0")));
  check("missing segments treated as 0", () => assert.ok(isNewerVersion("0.5", "0.4.9")));
  check("non-numeric suffix tolerated", () =>
    assert.ok(!isNewerVersion("0.5.0-beta", "0.5.0")),
  );
  check("prerelease of newer minor counts", () =>
    assert.ok(isNewerVersion("0.6.0-beta", "0.5.0")),
  );
  check("garbage falls back to 0", () => assert.ok(!isNewerVersion("abc", "0.1.0")));

  console.log(`[update-version] ${passed} assertions passed`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
