/**
 * Automated tests for Zeus AI VS Code extension — Phase 3:
 * Privacy-First Project Intelligence & Safe Coding Actions.
 *
 * Strategy: bundle the REAL pure modules with esbuild (the "vscode" module is
 * aliased to a no-op stub so vscode-dependent modules still load for their
 * pure exports), then assert behavior. Also compiles the generated webview
 * inline script (new Function) to guarantee no template-literal escape bug
 * can ship a dead UI (the Phase 2 regression), and runs structural safety
 * assertions over action sources.
 *
 * Run: node scripts/test-phase3.mjs
 */

import { strict as assert } from "node:assert";
import { build } from "esbuild";
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const here = join(fileURLToPath(new URL(".", import.meta.url)));
const srcDir = resolve(here, "..", "src");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ok  - " + name);
  } catch (err) {
    failed++;
    console.error("FAIL  - " + name);
    console.error("      " + (err && err.message ? err.message.split("\n")[0] : err));
  }
}

// ── Bundle real modules with a vscode stub ───────────────────────────

const outDir = mkdtempSync(join(tmpdir(), "zeus-phase3-"));
const stubPath = join(outDir, "vscode-stub.mjs");
writeFileSync(
  stubPath,
  [
    "export const window = {};",
    "export const workspace = { workspaceFolders: [] };",
    "export const languages = { getDiagnostics: () => [] };",
    "export const env = {};",
    "export const Uri = { parse: () => ({}) };",
    "export const Position = function () {};",
    "export const Range = function () {};",
    "export const WorkspaceEdit = function () { return { replace() {}, createFile() {}, insert() {} }; };",
    "export default {};",
  ].join("\n"),
);

await build({
  stdin: {
    contents: [
      `export * from "${srcDir.replace(/\\/g, "/")}/privacy/firewall";`,
      `export * from "${srcDir.replace(/\\/g, "/")}/tools/diff";`,
      `export * from "${srcDir.replace(/\\/g, "/")}/tools/intent";`,
      `export * from "${srcDir.replace(/\\/g, "/")}/tools/approval-store";`,
      `export * from "${srcDir.replace(/\\/g, "/")}/workspace/project-evidence";`,
      `export * from "${srcDir.replace(/\\/g, "/")}/actions/code-edits";`,
      `export * from "${srcDir.replace(/\\/g, "/")}/webview";`,
    ].join("\n"),
    resolveDir: here,
    sourcefile: "phase3-entry.ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: join(outDir, "phase3.mjs"),
  alias: { vscode: stubPath },
  logLevel: "silent",
});

const Z = await import(pathToFileURL(join(outDir, "phase3.mjs")).href);

// ══ 1. PRIVACY FIREWALL ═══════════════════════════════════════════════
console.log("\n[1] Privacy Firewall");

const fw = new Z.PrivacyFirewall({ respectGitignore: false, gitignoreLines: [], customGlobs: [] });

test(".env blocked", () => {
  assert.equal(fw.classify(".env").kind, "sensitive");
});
test(".env.local / .env.production blocked", () => {
  assert.equal(fw.classify(".env.local").kind, "sensitive");
  assert.equal(fw.classify(".env.production").kind, "sensitive");
});
test(".env.example ALLOWED (documented exception)", () => {
  assert.equal(fw.classify(".env.example").kind, "allowed");
  assert.equal(fw.classify("config/.env.example").kind, "allowed");
});
test("key material blocked (*.pem *.key *.p12 *.pfx)", () => {
  for (const p of ["server.pem", "certs/ca.key", "id.p12", "bundle.pfx"]) {
    assert.equal(fw.classify(p).kind, "sensitive", p);
  }
});
test("ssh keys blocked", () => {
  for (const p of ["id_rsa", "keys/id_ed25519", ".ssh/id_rsa"]) {
    assert.equal(fw.classify(p).kind, "sensitive", p);
  }
});
test("credentials/secrets/token/password names blocked", () => {
  for (const p of ["credentials.json", "secrets.ts", "auth/token.txt", "db.password.md"]) {
    assert.equal(fw.classify(p).kind, "sensitive", p);
  }
});
test("blocked directory contents never allowed", () => {
  for (const p of [".aws/credentials", ".ssh/config", ".git/config", "node_modules/x/index.js",
    "vendor/lib.php", "dist/main.js", "build/out.js", "coverage/lcov.info", ".next/page.js", ".cache/x"]) {
    assert.equal(fw.classify(p).kind, "sensitive", p);
  }
});
test(".npmrc/.netrc blocked; normal files allowed", () => {
  assert.equal(fw.classify(".npmrc").kind, "sensitive");
  assert.equal(fw.classify(".netrc").kind, "sensitive");
  assert.equal(fw.classify("src/app.ts").kind, "allowed");
  assert.equal(fw.classify("README.md").kind, "allowed");
});
test("lockfiles & minified/sourcemaps skipped (never content-leak surface)", () => {
  assert.equal(fw.classify("package-lock.json").kind, "skipped");
  assert.equal(fw.classify("app.min.js").kind, "skipped");
  assert.equal(fw.classify("app.js.map").kind, "skipped");
});
test("binary extension skipped", () => {
  assert.equal(fw.classify("assets/logo.png").kind, "skipped");
});
test("path traversal rejected", () => {
  assert.equal(Z.normalizeRelPath("../etc/passwd"), null);
  assert.equal(Z.normalizeRelPath("/abs/path"), null);
  assert.equal(Z.normalizeRelPath("C:\\\\win\\\\path"), null);
  assert.equal(Z.normalizeRelPath("a/../../b"), null);
});
test("custom glob patterns enforced (excluded regardless of other rules)", () => {
  const fw2 = new Z.PrivacyFirewall({ respectGitignore: false, gitignoreLines: [], customGlobs: ["internal/**"] });
  const c = fw2.classify("internal/core.ts");
  assert.ok(c.kind === "ignored" || c.kind === "sensitive", "excluded, got " + c.kind);
  assert.equal(fw2.classify("src/external.ts").kind, "allowed");
});
test("gitignore rules respected (last match wins); hard-blocked dirs still win first", () => {
  const fw3 = new Z.PrivacyFirewall({
    respectGitignore: true,
    gitignoreLines: ["logs/", "*.log", "!important.log"],
    customGlobs: [],
  });
  assert.equal(fw3.classify("logs/a.txt").kind, "ignored");
  assert.equal(fw3.classify("debug.log").kind, "ignored");
  // Hard-blocked dir segments take precedence over any gitignore nuance:
  assert.equal(fw3.classify("dist/bundle.js").kind, "sensitive");
});
test("respectGitignore=false ignores gitignore lines", () => {
  const fw4 = new Z.PrivacyFirewall({ respectGitignore: false, gitignoreLines: ["*.log"], customGlobs: [] });
  assert.equal(fw4.classify("debug.log").kind, "allowed");
});
test("isReadable mirrors classify", () => {
  assert.equal(fw.isReadable("src/app.ts"), true);
  assert.equal(fw.isReadable(".env"), false);
});
test("USER_BLOCKED_MESSAGE never reveals protected names", () => {
  const msg = Z.PrivacyFirewall.USER_BLOCKED_MESSAGE;
  assert.ok(msg.includes("privacy"));
  assert.ok(!msg.includes(".env"));
  assert.ok(!msg.includes("key"));
});
test("applyLimits caps files and total size and reports truncation", () => {
  const entries = [];
  for (let i = 0; i < 50; i++) entries.push({ relPath: "f" + i + ".ts", bytes: 1000 });
  const lim = Z.applyLimits(entries, { maxFiles: 10, maxFileBytes: 2000, maxTotalBytes: 5000 });
  assert.equal(lim.included.length, 5); // total-size cap binds first
  assert.equal(lim.truncatedByTotalSize, true);
});
test("estimateTokens sanity", () => {
  assert.equal(Z.estimateTokens(4000), 1000);
});

// ══ 2. END-TO-END PRIVACY: composed payload simulation ════════════════
console.log("\n[2] End-to-end privacy payload simulation");

test("secret values can never reach a composed prompt", () => {
  // Simulate exactly what code-edits/analyze do: firewall gate BEFORE read.
  const SECRET_VALUE = "SUPER_SECRET_VALUE_XYZ_123";
  const files = [
    { path: "src/app.ts", body: "export const app = 1;" },
    { path: ".env", body: "API_KEY=" + SECRET_VALUE },
    { path: ".env.example", body: "# template only\nAPI_KEY=" },
  ];
  let prompt = "";
  for (const f of files) {
    if (fw.classify(f.path).kind !== "allowed") continue; // THE invariant
    prompt += f.body;
  }
  assert.ok(prompt.includes("export const app"));
  assert.ok(!prompt.includes(SECRET_VALUE));
});
test("blocked file NAMES are not listed in manifests", () => {
  const manifestPaths = ["src/app.ts", ".env"].filter((p) => fw.classify(p).kind === "allowed");
  assert.deepEqual(manifestPaths, ["src/app.ts"]);
});

// ══ 3. DIFF ENGINE ════════════════════════════════════════════════════
console.log("\n[3] Diff engine");

test("diffStats counts additions/deletions", () => {
  const s = Z.diffStats("a\nb\nc\n", "a\nx\nc\nd\n");
  assert.equal(s.additions, 2);
  assert.equal(s.deletions, 1);
});
test("unifiedDiff renders +/- lines and headers", () => {
  const d = Z.unifiedDiff("src/a.ts", "old\n", "new\n");
  assert.ok(d.includes("--- src/a.ts"));
  assert.ok(d.includes("+++ src/a.ts"));
  assert.ok(d.includes("-old"));
  assert.ok(d.includes("+new"));
});
test("parseEditInstructions parses FILE + SEARCH/REPLACE blocks", () => {
  const model = [
    "SUMMARY: tweak greeting",
    "*** FILE: src/greet.ts",
    "<<<<<<< SEARCH",
    "hello();",
    "=======",
    "hi();",
    ">>>>>>> REPLACE",
    "",
    "*** ADD FILE: src/new.ts",
    "export const x = 1;",
  ].join("\n");
  const parsed = Z.parseEditInstructions(model);
  assert.equal(parsed.files.length, 2);
  assert.equal(parsed.unparsableCount, 0);
  const upd = parsed.files.find((f) => f.action === "update");
  assert.equal(upd.path, "src/greet.ts");
  assert.equal(upd.blocks.length, 1);
  assert.equal(upd.blocks[0].search, "hello();");
  assert.equal(upd.blocks[0].replace, "hi();");
  const add = parsed.files.find((f) => f.action === "create");
  assert.equal(add.fullContent.trim(), "export const x = 1;");
});
test("parseEditInstructions counts unparsable garbage instead of dropping silently", () => {
  const parsed = Z.parseEditInstructions("*** FILE:\n<<<<<<< SEARCH\nx\n=======\ny\n>>>>>>> REPLACE");
  assert.ok(parsed.unparsableCount >= 1);
});
test("applyEditBlocks applies exact-once matches (CRLF normalized)", () => {
  const res = Z.applyEditBlocks("a\r\nb\r\nc\r\n", [{ search: "b", replace: "B" }]);
  assert.equal(res.result, "a\nB\nc\n");
  assert.deepEqual(res.failedBlocks, []);
});
test("applyEditBlocks REFUSES ambiguous SEARCH (matches twice)", () => {
  const res = Z.applyEditBlocks("x\nx\n", [{ search: "x", replace: "y" }]);
  assert.equal(res.result, null);
  assert.deepEqual(res.failedBlocks, [0]);
});
test("applyEditBlocks REFUSES non-matching SEARCH", () => {
  const res = Z.applyEditBlocks("a\n", [{ search: "zzz", replace: "y" }]);
  assert.equal(res.result, null);
});
test("applyEditBlocks empty SEARCH is refused", () => {
  const res = Z.applyEditBlocks("a\n", [{ search: "", replace: "y" }]);
  assert.equal(res.result, null);
});

// ══ 4. APPROVAL STORE (nothing-without-approval invariant) ════════════
console.log("\n[4] Approval store");

test("approve consumes exactly once; kind mismatch refused", () => {
  const store = new Z.ApprovalStore(60_000);
  const p = store.create("changes", { v: 1 });
  assert.equal(store.approve(p.id, "scope"), null); // wrong kind
  assert.deepEqual(store.approve(p.id, "changes"), { v: 1 });
  assert.equal(store.approve(p.id, "changes"), null); // consumed
});
test("unknown/expired/rejected ids return null", () => {
  const store = new Z.ApprovalStore(5);
  const p = store.create("scan", {});
  assert.equal(store.approve("nope"), null);
  await0(10);
  assert.equal(store.approve(p.id), null); // expired
  const p2 = store.create("scan", {});
  store.reject(p2.id);
  assert.equal(store.approve(p2.id), null);
  function await0(ms) { const s = Date.now(); while (Date.now() - s < ms) { /* spin */ } }
});
test("get() previews without consuming", () => {
  const store = new Z.ApprovalStore(60_000);
  const p = store.create("scope", { n: 2 });
  assert.ok(store.get(p.id));
  assert.ok(store.get(p.id));
  assert.deepEqual(store.approve(p.id, "scope"), { n: 2 });
});

// ══ 6. INTENT + EVIDENCE ═════════════════════════════════════════════
console.log("\n[6] Intent & evidence");

test("looksLikeCodeModification separates questions from edit requests", () => {
  assert.equal(Z.looksLikeCodeModification("what does this file do?").modify, false);
  assert.equal(Z.looksLikeCodeModification("explain this function").modify, false);
  assert.equal(Z.looksLikeCodeModification("rename this variable to count").modify, true);
});
test("buildProjectEvidence extracts facts and lists unknowns honestly", () => {
  const ev = Z.buildProjectEvidence(
    "demo",
    ["package.json", "tsconfig.json", "src/main.ts"],
    new Map([
      ["package.json", JSON.stringify({
        dependencies: { react: "^18", express: "^4" },
        devDependencies: { vitest: "^2" },
        scripts: { test: "vitest run", build: "tsc" },
      })],
    ]),
  );
  assert.ok(ev.frameworks.includes("React"));
  assert.ok(ev.frameworks.includes("Express"));
  assert.equal(ev.testFramework, "Vitest");
  assert.equal(ev.testCommand, "npm run test"); // derived from scripts.name
  const text = Z.evidenceToPromptText(ev);
  assert.ok(text.includes("Vitest"));
});

// ══ 7. IMPORT DISCOVERY (pure part of edit scoping) ══════════════════
console.log("\n[7] Import discovery");

test("parseImportSpecs extracts relative imports only", () => {
  const specs = Z.parseImportSpecs([
    'import x from "./x";',
    'import y from "../lib/y";',
    'import z from "zod";', // bare specifier ignored
    'const w = require("./w");',
    'const v = await import("../v");',
  ].join("\\n"));
  assert.deepEqual(specs.sort(), ["../lib/y", "../v", "./w", "./x"]);
});

// ══ 8. WEBVIEW SCRIPT COMPILE GUARD (Phase 2 regression) ═════════════
console.log("\n[8] Webview HTML/script integrity");

const html = Z.buildWebviewHtml();

test("generated inline script PARSES (no escape regressions)", () => {
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, "script tag present");
  assert.ok(m[1].length > 5000, "script is substantial");
  // Compile WITHOUT executing — throws SyntaxError on any parse bug.
  void new Function(m[1]);
});
test("all required UI element ids exist in HTML", () => {
  for (const id of [
    "screenWelcome", "screenEmail", "screenCode", "screenChat",
    "actionsBar", "actionAnalyze", "actionFix", "actionReview", "actionTests",
    "chipsRow", "chipsSummary", "toolStrip", "composerInput", "btnSend",
    "overlayContext", "overlayPlan", "overlayChanges", "overlayIssues", "overlayReview",
  ]) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
});
test("CSP stays strict (script/style sources unchanged, no new remote endpoints)", () => {
  const csp = html.match(/Content-Security-Policy"\s*\n?\s*content="([^"]+)"/);
  assert.ok(csp, "CSP present");
  const c = csp[1];
  assert.ok(c.includes("default-src 'none'"));
  assert.ok(c.includes("script-src 'unsafe-inline'"));
  assert.ok(!/connect-src|frame-src|child-src/.test(c));
});

// ══ 9. STRUCTURAL SAFETY ASSERTIONS (sources) ════════════════════════
console.log("\n[9] Structural safety (source-level)");

const codeEditsSrc = readFileSync(join(srcDir, "actions", "code-edits.ts"), "utf8");
test("edits apply ONLY through consumed approval ids", () => {
  assert.ok(codeEditsSrc.includes("changeApprovals.approve(proposalId"));
  assert.ok(codeEditsSrc.includes('changeApprovals.approve(proposalId, "changes")'));
});
test("file reads happen only after scope approval consumption", () => {
  assert.ok(codeEditsSrc.includes('scopeApprovals.approve(planId, "scope")'));
  const approveIdx = codeEditsSrc.indexOf('scopeApprovals.approve(planId, "scope")');
  const readIdx = codeEditsSrc.indexOf("readSafeFile(root, rel, firewall");
  assert.ok(approveIdx > -1 && readIdx > -1 && readIdx > approveIdx);
});
test("apply uses WorkspaceEdit (single undo step), never shell/git writes", () => {
  assert.ok(codeEditsSrc.includes("new vscode.WorkspaceEdit()"));
  assert.ok(codeEditsSrc.includes("applyEdit(edit"));
  assert.ok(!/child_process|execSync|spawnSync/.test(codeEditsSrc));
});
test("drift protection: on-disk snapshot must match approved diff", () => {
  assert.ok(codeEditsSrc.includes("skipped-drift"));
});
test("validation commands allow-listed to safe test/lint/typecheck forms", () => {
  const m = codeEditsSrc.match(/if \(!\/\^\(npm\|pnpm\|yarn\|bun\)\\s\+\(run\\s\+\)\?\[\\w:@\/\\\-.]\+\$\/\.test\(command\)[^)]*\)/);
  assert.ok(m, "allow-list regex present");
  assert.ok(codeEditsSrc.includes('createTerminal'));
});

const extSrc = readFileSync(join(srcDir, "extension.ts"), "utf8");
test("extension is fully PLAN-BLIND (no entitlement/plan code anywhere)", () => {
  // Product rule: the extension is distributed only to paid users via the
  // website, so the client must never see, fetch, or branch on the plan.
  assert.ok(!existsSync(join(srcDir, "entitlement.ts")), "entitlement.ts removed");
  assert.ok(!existsSync(join(srcDir, "plans.ts")), "plans.ts removed");
  assert.ok(!existsSync(join(srcDir, "entitlement-core.ts")), "entitlement-core.ts removed");
  const sources = [
    ["extension.ts", extSrc],
    ["webview.ts", readFileSync(join(srcDir, "webview.ts"), "utf8")],
    ["chat.types.ts", readFileSync(join(srcDir, "chat.types.ts"), "utf8")],
  ];
  for (const [name, src] of sources) {
    assert.ok(!/requireEntitlement|pushEntitlementState|invalidateEntitlementCache|evaluateEntitlementResponse|normalizePlan|isProOrAbove/i.test(src), `${name} has no entitlement logic`);
    assert.ok(!/planLabel|planBadge|screenUpgrade|showUpgrade|applyEntitlement|checkEntitlement|upgradeOpen/.test(src), `${name} has no plan UI`);
  }
});
test("auth/session actions remain ungated", () => {
  const idx = extSrc.indexOf('case "signOut"');
  const slice = extSrc.slice(idx, idx + 300);
  assert.ok(slice.includes("clearSession"));
});
test("tool flows use ephemeral threads (created AND deleted per flow)", () => {
  const streamSrc = readFileSync(join(srcDir, "tools", "stream.ts"), "utf8");
  assert.ok(streamSrc.includes("createThread("));
  assert.ok(streamSrc.includes("deleteThread(threadId)"));
  const finallyIdx = streamSrc.indexOf("finally {");
  const delIdx = streamSrc.lastIndexOf("deleteThread(threadId)");
  assert.ok(finallyIdx > -1 && delIdx > finallyIdx, "deletion happens in finally cleanup");
});
test("chat context chips are opt-in only (host reads provided chips)", () => {
  assert.ok(extSrc.includes("message.contextChips"));
});
test("backend entitlement route enforces Bearer JWT like chat.ts", () => {
  const routeSrc = readFileSync(resolve(srcDir, "../../../src/routes/api/vscode/entitlements.ts"), "utf8");
  assert.ok(routeSrc.includes("Authorization"));
  assert.ok(routeSrc.includes("getClaims"));
  assert.ok(routeSrc.includes('from("profiles")'));
});

// ══ Done ══════════════════════════════════════════════════════════════
rmSync(outDir, { recursive: true, force: true });
console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
