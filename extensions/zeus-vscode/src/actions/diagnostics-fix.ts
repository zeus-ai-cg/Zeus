/**
 * "Fix Problems" action — VS Code diagnostics → grouped issue list →
 * user selects issues → Plan → Diff → Approval pipeline (shared with
 * code-edits). Protected files are fully excluded upstream.
 */

import * as vscode from "vscode";
import { collectDiagnostics, type DiagnosticIssue } from "../context/builders";
import { proposeEditPlan } from "./code-edits";

export async function collectAndPostIssues(webview: vscode.Webview): Promise<void> {
  const bundle = await collectDiagnostics();

  // Group by file for the UI.
  const groups = new Map<string, DiagnosticIssue[]>();
  for (const iss of bundle.issues) {
    const arr = groups.get(iss.path) ?? [];
    arr.push(iss);
    groups.set(iss.path, arr);
  }

  void webview.postMessage({
    type: "issuesList",
    groups: [...groups.entries()].map(([path, issues]) => ({ path, issues })),
    blockedFileCount: bundle.excludedProtectedFiles,
    total: bundle.issues.length,
  });
}

export async function fixSelectedIssues(
  webview: vscode.Webview,
  keys: string[],
): Promise<void> {
  const bundle = await collectDiagnostics();
  const wanted = new Set(keys);
  const selected = bundle.issues.filter((i) => wanted.has(i.id));
  if (selected.length === 0) {
    void webview.postMessage({
      type: "toolError",
      flowId: "edits",
      message: "No matching issues to fix (they may have been resolved already).",
    });
    return;
  }

  // One fix request per affected file keeps SEARCH/REPLACE blocks precise.
  const byPath = new Map<string, DiagnosticIssue[]>();
  for (const iss of selected) {
    const arr = byPath.get(iss.path) ?? [];
    arr.push(iss);
    byPath.set(iss.path, arr);
  }

  const files = [...byPath.keys()];
  const issueText = files
    .map((path) => {
      const lines = byPath
        .get(path)!
        .map((i) => `- line ${i.line} [${i.severityLabel}]${i.source ? ` (${i.source})` : ""}: ${i.message}${i.excerpt ? `\n  code:\n${i.excerpt.split("\n").map((l) => "    " + l).join("\n")}` : ""}`)
        .join("\n");
      return `${path}:\n${lines}`;
    })
    .join("\n\n");

  await proposeEditPlan(webview, {
    instruction:
      `Fix the following editor-reported problems. Make the MINIMAL change that resolves each problem ` +
      `without altering unrelated behavior. If a reported problem is a false positive, explain why in the SUMMARY instead of editing.\n\n` +
      `PROBLEMS:\n${issueText}`,
    files,
    notes: [`${selected.length} issue(s) across ${files.length} file(s)`],
    attachments: [],
  });
}
