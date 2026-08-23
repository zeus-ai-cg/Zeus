const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * @type {import('esbuild').BuildOptions}
 */
const common = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"], // provided by the VS Code extension host at runtime
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

async function main() {
  if (watch) {
    const ctx = await esbuild.context(common);
    await ctx.watch();
    console.log("[esbuild] watching for changes…");
  } else {
    await esbuild.build(common);
    console.log("[esbuild] build complete");
  }
}

main().catch((err) => {
  console.error("[esbuild] build failed", err);
  process.exit(1);
});
