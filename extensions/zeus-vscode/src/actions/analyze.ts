/**
 * "Analyze Project" action.
 *
 * Stage 1: privacy-safe scan → metadata-only preview → USER APPROVAL.
 * Stage 2 (only after approval): read a small set of high-signal safe files,
 * extract evidence facts locally, and stream an evidence-grounded report.
 *
 * The report itself streams into the UI; ONLY the local, metadata-level
 * evidence summary (facts like detected frameworks/commands — never bulk
 * file contents) is cached for optional reuse as a chat attachment.
 */

import * as vscode from "vscode";
import { scanWorkspace, type SafeScan } from "../workspace/scanner";
import {
  buildProjectEvidence,
  evidenceToPromptText,
} from "../workspace/project-evidence";
import { ApprovalStore } from "../tools/approval-store";
import { runToolFlow } from "../tools/stream";
import { setCachedProjectSummary } from "../context/builders";

const scanApprovals = new ApprovalStore<SafeScan>();

/** Evidence files read after approval: configs/docs fully (capped), sources as heads. */
const EVIDENCE_CONFIG_PATTERNS: RegExp[] = [
  /^package\.json$/i,
  /^tsconfig[^/]*\.json$/i,
  /^jsconfig\.json$/i,
  /^(vite|webpack|rollup|esbuild|next|nuxt|astro|svelte|angular|tailwind)\.config\.[cm]?[jt]sx?$/i,
  /^go\.mod$/,
  /^cargo\.toml$/i,
  /^pyproject\.toml$/i,
  /^requirements\.txt$/i,
  /^readme(\..*)?$/i,
];
const EVIDENCE_SOURCE_HEADS = 6;
const SOURCE_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".rb", ".go",
  ".rs", ".java", ".kt", ".php", ".vue", ".svelte", ".dart",
]);

export async function startAnalysis(webview: vscode.Webview): Promise<void> {
  const post = (msg: Record<string, unknown>) => void webview.postMessage(msg);
  try {
    post({ type: "analysisStage", stage: "scanning" });
    const scan = await scanWorkspace();

    const pending = scanApprovals.create("scan", scan);

    post({
      type: "contextPreview",
      scanId: pending.id,
      workspaceName: scan.workspaceName,
      counts: {
        totalFilesOnDisk: scan.allowed.length,
        included: scan.limited.included.length,
        sensitiveBlocked: scan.sensitiveBlockedCount,
        ignored: scan.ignoredCount,
        skippedBinary: scan.skippedBinaryCount,
      },
      limits: {
        maxFiles: scan.limits.maxFiles,
        maxFileKB: Math.round(scan.limits.maxFileBytes / 1024),
        maxTotalKB: Math.round(scan.limits.maxTotalBytes / 1024),
      },
      truncated: scan.truncated,
      respectGitignore: scan.respectGitignore,
      // Paths of NON-sensitive files only. Blocked names are never revealed.
      samplePaths: scan.limited.included.slice(0, 120).map((f) => f.relPath),
      estimatedKB: Math.ceil(scan.limited.totalIncludedBytes / 1024),
      estimatedTokens: Math.ceil((scan.limited.totalIncludedBytes / 1024) * 220),
    });
  } catch (err) {
    post({
      type: "analysisError",
      message: err instanceof Error ? err.message : "Workspace scan failed.",
    });
  }
}

export function cancelPendingScan(scanId: string): boolean {
  return scanApprovals.reject(scanId);
}

export async function approveScanAndAnalyze(
  webview: vscode.Webview,
  scanId: string,
): Promise<void> {
  const post = (msg: Record<string, unknown>) => void webview.postMessage(msg);
  const scan = scanApprovals.approve(scanId, "scan");
  if (!scan) {
    post({ type: "analysisError", message: "That context preview expired. Please scan again." });
    return;
  }

  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    post({ type: "analysisError", message: "No workspace folder is open." });
    return;
  }

  post({ type: "analysisStage", stage: "reading" });

  // Read high-signal files (all firewall-classified "allowed" already).
  const contents = new Map<string, string>();
  const included = new Set(scan.limited.included.map((f) => f.relPath));
  let evidenceBudget = 14;
  for (const rel of included) {
    if (evidenceBudget <= 0) break;
    if (!EVIDENCE_CONFIG_PATTERNS.some((p) => p.test(rel))) continue;
    let bytes: Uint8Array | null = null;
    try {
      bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(folder.uri, ...rel.split("/")),
      );
    } catch {
      bytes = null;
    }
    if (!bytes || bytes.length > 16 * 1024) continue;
    contents.set(rel, new TextDecoder().decode(bytes));
    evidenceBudget--;
  }

  // Source-file heads for structure hints (first 50 lines each).
  let heads = 0;
  for (const rel of included) {
    if (heads >= EVIDENCE_SOURCE_HEADS) break;
    if (contents.has(rel)) continue;
    const ext = rel.slice(rel.lastIndexOf(".")).toLowerCase();
    if (!SOURCE_EXTS.has(ext)) continue;
    if (rel.split("/").length > 3) continue; // shallow files only
    const res2 = await readHead(folder.uri, rel, 50);
    if (res2) {
      contents.set(rel, res2);
      heads++;
    }
  }

  const evidence = buildProjectEvidence(scan.workspaceName, scan.limited.included.map((f) => f.relPath), contents);
  setCachedProjectSummary(scan.workspaceName, evidenceToPromptText(evidence));

  post({ type: "analysisStage", stage: "analyzing" });

  const manifestText =
    scan.limited.included.length > 0
      ? scan.limited.included.map((f) => f.relPath).join("\n")
      : "(no includeable files)";

  const prompt = [
    "PROJECT CONTEXT REQUEST — produce a factual project intelligence report.",
    "",
    "RULES:",
    "- Ground EVERY claim in the evidence below. If something is not shown, write \"unknown\".",
    "- Do NOT invent files, commands, frameworks, or history.",
    "- Be concise and practical.",
    "",
    "OUTPUT SECTIONS (markdown, exactly these headings):",
    "## Overview",
    "## Architecture & Structure",
    "## Key Technologies",
    "## Build / Test / Lint Commands",
    "## Observations & Potential Issues",
    "## Gaps & Unknowns",
    "## Suggested Next Steps",
    "",
    "=== DETECTED FACTS (extracted locally) ===",
    evidenceToPromptText(evidence),
    "",
    "=== ALLOWED FILE MANIFEST (paths only) ===",
    manifestText,
  ].join("\n");

  await runToolFlow({
    flowId: "analysis",
    webview,
    label: "Project Analysis",
    prompt,
    onText: () => undefined,
  }).then(async (result) => {
    if (!result.ok) return;
    void webview.postMessage({ type: "analysisDone", fullText: result.fullText });
  });
}

async function readHead(rootUri: vscode.Uri, rel: string, maxLines: number): Promise<string | null> {
  try {
    const uri = vscode.Uri.joinPath(rootUri, ...rel.split("/"));
    const doc = await vscode.workspace.openTextDocument(uri);
    const lines: string[] = [];
    for (let i = 0; i < Math.min(maxLines, doc.lineCount); i++) {
      const t = doc.lineAt(i).text;
      lines.push(t.length > 200 ? t.slice(0, 200) + "…" : t);
    }
    return lines.join("\n");
  } catch {
    return null;
  }
}
