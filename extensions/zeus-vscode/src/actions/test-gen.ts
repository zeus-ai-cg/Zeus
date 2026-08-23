/**
 * "Generate Tests" action.
 *
 * Detects the project's test framework from package.json (evidence-based),
 * picks a NEW target path (never overwrites an existing test file), and
 * routes through the shared Plan → Diff → Approval pipeline so the generated
 * test file appears as a reviewable proposal before anything is written.
 */

import * as vscode from "vscode";
import { proposeEditPlan } from "./code-edits";
import { buildFirewall, collectActiveFile } from "../context/builders";
import { readSafeFile } from "../workspace/scanner";

interface TestFramework {
  name: string;
  importHint: string;
  runCommand: string;
}

const FRAMEWORK_MAP: Record<string, TestFramework> = {
  vitest: { name: "Vitest", importHint: `import { describe, it, expect } from "vitest";`, runCommand: "npx vitest run" },
  jest: { name: "Jest", importHint: "", runCommand: "npx jest" },
  mocha: { name: "Mocha", importHint: "", runCommand: "npx mocha" },
  "@playwright/test": { name: "Playwright", importHint: `import { test, expect } from "@playwright/test";`, runCommand: "npx playwright test" },
  cypress: { name: "Cypress", importHint: "", runCommand: "npx cypress run" },
};

async function detectFramework(rootUri: vscode.Uri): Promise<TestFramework | null> {
  const firewall = await buildFirewall();
  const res = await readSafeFile(rootUri, "package.json", firewall, 256 * 1024);
  if (!res.ok) return null;
  try {
    const pkg = JSON.parse(res.text) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const key of ["vitest", "jest", "@playwright/test", "mocha", "cypress"]) {
      if (deps[key]) return FRAMEWORK_MAP[key];
    }
    // Evidence fallback: a test script that names a runner.
    const testScript = pkg.scripts?.test ?? "";
    if (/vitest/.test(testScript)) return FRAMEWORK_MAP.vitest;
    if (/jest/.test(testScript)) return FRAMEWORK_MAP.jest;
    if (/mocha/.test(testScript)) return FRAMEWORK_MAP.mocha;
    if (/cypress/.test(testScript)) return FRAMEWORK_MAP.cypress;
    if (/playwright/.test(testScript)) return FRAMEWORK_MAP["@playwright/test"];
    return null;
  } catch {
    return null;
  }
}

function defaultTargetPath(sourceRel: string): string {
  const dir = sourceRel.includes("/") ? sourceRel.slice(0, sourceRel.lastIndexOf("/")) : "";
  const base = sourceRel.split("/").pop()!;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : ".ts";
  const fileName = `${stem}.test${ext}`;
  return dir ? `${dir}/${fileName}` : fileName;
}

export async function startTestGeneration(
  webview: vscode.Webview,
): Promise<void> {
  const post = (msg: Record<string, unknown>) => void webview.postMessage(msg);
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    post({ type: "toolError", flowId: "edits", message: "No workspace folder is open." });
    return;
  }

  // Source of truth: the active file (firewall-checked inside).
  const attachment = await collectActiveFile();
  if ("blocked" in attachment) {
    post({
      type: "toolError",
      flowId: "edits",
      message: attachment.message,
    });
    return;
  }
  const sourceRel = attachment.detail ?? "";

  let target = defaultTargetPath(sourceRel);
  // NEVER overwrite an existing file — pick a fresh name instead.
  for (let n = 1; n < 20; n++) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, ...target.split("/")));
      const dot = target.lastIndexOf(".");
      target = `${target.slice(0, dot)}.zeus${n}${target.slice(dot)}`;
    } catch {
      break; // free
    }
  }

  const fw = await detectFramework(folder.uri);
  const fwLine = fw
    ? `Test framework detected in this project: ${fw.name}. Start with \`${fw.importHint}\` when applicable. The user can later run tests with: ${fw.runCommand}`
    : `No test framework was detectable. Write framework-neutral tests and note the assumption.`;

  await proposeEditPlan(webview, {
    instruction:
      `Create thorough automated tests for the attached file.\n` +
      `TARGET: emit exactly one block: *** ADD FILE: ${target} (this exact path; do not modify any other file).\n` +
      `${fwLine}\n` +
      `Cover meaningful behavior and edge cases; keep tests deterministic (no network, no real timers).`,
    files: [],
    notes: [
      `New file will be created at ${target}`,
      "Existing files are never overwritten by Generate Tests.",
    ],
    attachments: [attachment],
  });
}
