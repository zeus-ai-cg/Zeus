/**
 * Shared Plan → Diff → User Approval → Apply engine.
 *
 * SAFETY INVARIANTS (all unit-tested where pure):
 *   1. Nothing is ever applied without an explicit approval carrying the
 *      exact pending id created when the proposal was shown.
 *   2. Approvals are single-use, kind-checked, and expire.
 *   3. Files are read ONLY after the user approves the read-scope preview,
 *      and only through the privacy-filtered reader.
 *   4. At apply time the on-disk content must still match the snapshot the
 *      user saw; drifted files are skipped and reported, never merged blindly.
 *   5. Application goes through WorkspaceEdit (single undo step). No shell
 *      mutations, no git write operations, no deletions.
 */

import * as vscode from "vscode";
import { PrivacyFirewall } from "../privacy/firewall";
import { getConfig } from "../config";
import { ApprovalStore } from "../tools/approval-store";
import {
  applyEditBlocks,
  diffStats,
  parseEditInstructions,
  unifiedDiff,
  type FileEdits,
} from "../tools/diff";
import { runToolFlow } from "../tools/stream";
import { buildFirewall, type ContextAttachment } from "../context/builders";
import { readSafeFile } from "../workspace/scanner";

// ── Types ────────────────────────────────────────────────────────────

export interface EditScopePayload {
  rootUri: string;
  workspaceName: string;
  instruction: string;
  files: string[];
  attachments: ContextAttachment[];
}

export interface ProposedFile {
  path: string;
  action: "create" | "update";
  original: string;
  proposed: string;
  diffText: string;
  additions: number;
  deletions: number;
  conflicted?: string;
}

export interface ProposedChangeSet {
  rootUri: string;
  workspaceName: string;
  files: ProposedFile[];
  validation: string[];
  conflicts: number;
  note?: string;
}

const scopeApprovals = new ApprovalStore<EditScopePayload>();
const changeApprovals = new ApprovalStore<ProposedChangeSet>();

export function pendingScopeCount(): number {
  return scopeApprovals.size + changeApprovals.size;
}

// ── Relevant-file discovery ──────────────────────────────────────────

/** Pure: extract relative import specifiers from source text (tested). */
export function parseImportSpecs(text: string): string[] {
  const specs: string[] = [];
  const patterns = [
    /\bfrom\s+["'](\.[^"']+)["']/g,
    /\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["'](\.[^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) specs.push(m[1]);
  }
  return [...new Set(specs)];
}

function candidateExtensions(spec: string): string[] {
  const exts = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".scss", ".vue", ".svelte"];
  return exts.map((e) => `${spec}${e}`).concat(exts.map((e) => `${spec}/index${e}`));
}

/**
 * Build a conservative relevant-file candidate set for a modification task:
 * active editor + its local imports + other visible editors + files with
 * errors + git-changed files. Firewall-filtered, deduped, capped.
 */
export async function discoverRelevantFiles(instruction: string): Promise<{
  files: string[];
  notes: string[];
}> {
  const firewall = await buildFirewall();
  const cfg = getConfig();
  const maxFiles = Math.min(8, Math.max(3, Math.floor(cfg.contextMaxFiles / 10)));
  const candidates = new Set<string>();
  const notes: string[] = [];

  const addCandidate = (rel: string): boolean => {
    if (candidates.size >= maxFiles) return false;
    if (!firewall.isReadable(rel)) return false;
    candidates.add(rel);
    return true;
  };

  const active = vscode.window.activeTextEditor;
  let activeText = "";
  if (active && active.document.uri.scheme === "file") {
    const rel = vscode.workspace.asRelativePath(active.document.uri, false).replace(/\\/g, "/");
    if (addCandidate(rel)) {
      activeText = active.document.getText().slice(0, 64_000);
      // Follow relative imports of the active file (one hop).
      const folder = vscode.workspace.getWorkspaceFolder(active.document.uri);
      if (folder) {
        const baseDir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
        for (const spec of parseImportSpecs(activeText).slice(0, 12)) {
          const placed = spec.startsWith(".") ? normalizeJoin(baseDir, spec) : null;
          const tries = placed ? [placed] : [];
          for (const t of tries) {
            let done = false;
            for (const cand of candidateExtensions(t)) {
              if (await fileExists(folder.uri, cand)) {
                done = addCandidate(cand);
                break;
              }
            }
            if (done) break;
          }
        }
      }
    }
  }

  for (const ed of vscode.window.visibleTextEditors) {
    if (ed.document.uri.scheme !== "file") continue;
    const rel = vscode.workspace.asRelativePath(ed.document.uri, false).replace(/\\/g, "/");
    addCandidate(rel);
  }

  // Files with error-severity diagnostics.
  for (const [uri, diags] of vscode.languages.getDiagnostics()) {
    if (candidates.size >= maxFiles) break;
    if (!diags.some((d) => d.severity === vscode.DiagnosticSeverity.Error)) continue;
    if (uri.scheme !== "file") continue;
    const rel = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/");
    addCandidate(rel);
  }

  if (candidates.size === 0) {
    notes.push("No specific files identified — Zeus will rely on your description and any attached context.");
  }
  void instruction;
  return { files: [...candidates], notes };
}

function normalizeJoin(baseDir: string, spec: string): string {
  const parts = (baseDir ? baseDir.split("/") : []).concat(spec.replace(/^\.\//, "").split("/"));
  const out: string[] = [];
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

async function fileExists(root: vscode.Uri, rel: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.joinPath(root, ...rel.split("/")));
    return true;
  } catch {
    return false;
  }
}

// ── Step 1: show read-scope preview, wait for approval ───────────────

export async function proposeEditPlan(
  webview: vscode.Webview,
  args: { instruction: string; files: string[]; notes: string[]; attachments: ContextAttachment[] },
): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) throw new Error("No workspace folder is open.");

  const payload: EditScopePayload = {
    rootUri: folder.uri.toString(),
    workspaceName: folder.name,
    instruction: args.instruction,
    files: args.files,
    attachments: args.attachments,
  };
  const pending = scopeApprovals.create("scope", payload);

  void webview.postMessage({
    type: "editPlanPreview",
    planId: pending.id,
    instruction: args.instruction,
    workspaceName: payload.workspaceName,
    files: args.files.map((f) => ({ path: f })),
    notes: args.notes,
    attachmentLabels: args.attachments.filter((a) => !("blocked" in a)).map((a) => a.label),
  });
}

// ── Step 2: approved → read files → stream plan+edits → proposals ────

const EDIT_CONTRACT = `You are Zeus AI operating in PRECISE EDIT MODE inside the user's VS Code workspace.

STRICT OUTPUT CONTRACT — follow exactly:
1. First line: SUMMARY: <one sentence describing the change>
2. Then optionally VALIDATION: <command> lines (only commands already defined in the project, e.g. "npm test").
3. Then, for EVERY file you modify, emit blocks EXACTLY in this format:

*** FILE: relative/path/to/file.ext
<<<<<<< SEARCH
(exact lines copied verbatim from the current file content below; include enough surrounding lines to be UNIQUE)
=======
(replacement lines)
>>>>>>> REPLACE

For a NEW file emit:
*** ADD FILE: relative/path/to/newfile.ext
(complete new file content)

RULES:
- SEARCH text must match the current file content EXACTLY (whitespace included) and appear exactly once.
- Make the SMALLEST correct change; never reformat unrelated code.
- Use the exact relative paths shown in the "FILE" headers below.
- If a requested change is impossible/unsafe, say so under SUMMARY and emit no blocks.`;

export async function runApprovedEditScope(
  webview: vscode.Webview,
  planId: string,
): Promise<void> {
  const scope = scopeApprovals.approve(planId, "scope");
  if (!scope) {
    void webview.postMessage({
      type: "toolError",
      flowId: "edits",
      message: "That plan expired or was already used. Please start again.",
    });
    return;
  }

  const cfg = getConfig();
  const firewall = await buildFirewall();
  const root = vscode.Uri.parse(scope.rootUri);

  const sections: string[] = [
    `REQUEST: ${scope.instruction}`,
    "",
    "CURRENT FILE CONTENTS (authoritative):",
  ];

  let readFailures = 0;
  for (const rel of scope.files) {
    const res = await readSafeFile(root, rel, firewall, cfg.contextMaxFileKB * 1024);
    if (res.ok) {
      sections.push(`### FILE: ${res.relPath}\n\`\`\`\n${res.text}\n\`\`\``);
    } else {
      readFailures++;
    }
  }

  for (const att of scope.attachments) {
    sections.push(att.text);
  }

  sections.push(
    readFailures > 0
      ? `(Note: ${readFailures} file(s) could not be included.)`
      : "(All listed files included fully or as marked.)",
  );

  await runToolFlow({
    flowId: "edits",
    webview,
    label: "Code Changes",
    preamble: EDIT_CONTRACT,
    prompt: sections.join("\n"),
  }).then(async (result) => {
    if (!result.ok) return; // toolError already posted
    const changeSet = await buildProposalFromModelOutput(root, scope.workspaceName, result.fullText);
    if (changeSet.files.length === 0 && changeSet.conflicts === 0) {
      void webview.postMessage({
        type: "toolError",
        flowId: "edits",
        message: "Zeus did not propose any file changes. Check the response for details.",
      });
      // Surface the raw answer as chat-like info so it isn't lost.
      void webview.postMessage({ type: "toolDone", flowId: "edits", fullText: result.fullText });
      return;
    }
    const pending = changeApprovals.create("changes", changeSet);
    void webview.postMessage({
      type: "changesProposed",
      proposalId: pending.id,
      summary: extractSummary(result.fullText),
      files: changeSet.files.map((f) => ({
        path: f.path,
        action: f.action,
        diff: f.diffText,
        additions: f.additions,
        deletions: f.deletions,
        conflicted: f.conflicted ?? null,
      })),
      validation: changeSet.validation,
      conflicts: changeSet.conflicts,
      note: changeSet.note ?? null,
    });
  });
}

function extractSummary(modelText: string): string {
  const m = modelText.match(/^\s*(?:\*\*)?SUMMARY(?:\*\*)?\s*[:-]\s*(.+)$/im);
  return m ? m[1].trim() : "";
}

function extractValidation(modelText: string): string[] {
  const cmds: string[] = [];
  const re = /^\s*(?:\*\*)?VALIDATION(?:\*\*)?\s*[:-]\s*`?([^`\n]+)`?\s*$/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(modelText)) !== null) {
    const cmd = m[1].trim();
    // Only allow safe, non-mutating validation commands we can recognize.
    if (/^(npm|pnpm|yarn|bun)\s+(run\s+)?(test|lint|typecheck|type-check|check)(:\S+)?$/.test(cmd) || /^(npm|pnpm|yarn|bun)\s+test$/.test(cmd)) {
      cmds.push(cmd);
    }
  }
  return [...new Set(cmds)].slice(0, 4);
}

/** Turn raw model output into verified proposals + local unified diffs. */
async function buildProposalFromModelOutput(
  root: vscode.Uri,
  workspaceName: string,
  modelText: string,
): Promise<ProposedChangeSet> {
  const firewall = await buildFirewall();
  const cfg = getConfig();
  const parsed = parseEditInstructions(modelText);
  const files: ProposedFile[] = [];

  for (const fe of parsed.files) {
    const decision = firewall.classify(fe.path);
    if (decision.kind !== "allowed") {
      files.push({
        path: fe.path,
        action: fe.action,
        original: "",
        proposed: "",
        diffText: "",
        additions: 0,
        deletions: 0,
        conflicted: PrivacyFirewall.USER_BLOCKED_MESSAGE,
      });
      continue;
    }
    if (fe.action === "create") {
      const proposed = fe.fullContent ?? "";
      files.push({
        path: fe.path,
        action: "create",
        original: "",
        proposed,
        diffText: unifiedDiff(fe.path, "", proposed),
        ...diffStats("", proposed),
      });
      continue;
    }
    // update: fetch original content (firewall-gated)
    const orig = await readSafeFile(root, fe.path, firewall, cfg.contextMaxFileKB * 1024);
    if (!orig.ok) {
      files.push({
        path: fe.path,
        action: "update",
        original: "",
        proposed: "",
        diffText: "",
        additions: 0,
        deletions: 0,
        conflicted: "Could not read the current file to compare.",
      });
      continue;
    }
    const applied = applyEditBlocks(orig.text, fe.blocks);
    if (applied.result === null) {
      files.push({
        path: fe.path,
        action: "update",
        original: orig.text,
        proposed: "",
        diffText: "",
        additions: 0,
        deletions: 0,
        conflicted: `${fe.blocks.length - applied.failedBlocks.length}/${fe.blocks.length} edit block(s) matched; ${applied.failedBlocks.length} did not match the current file.`,
      });
      continue;
    }
    files.push({
      path: fe.path,
      action: "update",
      original: orig.text,
      proposed: applied.result,
      diffText: unifiedDiff(fe.path, orig.text, applied.result),
      ...diffStats(orig.text, applied.result),
    });
  }

  return {
    rootUri: root.toString(),
    workspaceName,
    files,
    validation: extractValidation(modelText),
    conflicts: parsed.unparsableCount + files.filter((f) => f.conflicted).length,
  };
}

// ── Step 3: explicit approval → WorkspaceEdit ────────────────────────

export interface ApplyResult {
  path: string;
  status: "applied" | "created" | "skipped-drift" | "conflicted" | "failed";
  detail?: string;
}

export async function applyApprovedChanges(
  webview: vscode.Webview,
  proposalId: string,
): Promise<void> {
  const changeSet = changeApprovals.approve(proposalId, "changes");
  if (!changeSet) {
    void webview.postMessage({
      type: "toolError",
      flowId: "apply",
      message: "No pending proposal with that id (expired or already handled). Nothing was changed.",
    });
    return;
  }

  const results: ApplyResult[] = [];
  const edit = new vscode.WorkspaceEdit();
  const rootUri = vscode.Uri.parse(changeSet.rootUri);
  let openedFirst: vscode.Uri | null = null;

  for (const f of changeSet.files) {
    if (f.conflicted) {
      results.push({ path: f.path, status: "conflicted", detail: f.conflicted });
      continue;
    }
    const uri = vscode.Uri.joinPath(rootUri, ...f.path.split("/"));

    if (f.action === "create") {
      try {
        await vscode.workspace.fs.stat(uri);
        results.push({ path: f.path, status: "failed", detail: "File already exists." });
        continue;
      } catch {
        /* does not exist — good */
      }
      edit.createFile(uri, { overwrite: false });
      edit.insert(uri, new vscode.Position(0, 0), f.proposed.endsWith("\n") ? f.proposed : f.proposed + "\n");
      results.push({ path: f.path, status: "created" });
      openedFirst = openedFirst ?? uri;
      continue;
    }

    // update — verify disk still matches what the user approved.
    let bytes: Uint8Array | undefined;
    try {
      bytes = await vscode.workspace.fs.readFile(uri);
    } catch {
      bytes = undefined;
    }
    if (!bytes) {
      results.push({ path: f.path, status: "failed", detail: "File missing." });
      continue;
    }
    const current = new TextDecoder().decode(bytes).replace(/\r\n/g, "\n");
    if (current !== f.original.replace(/\r\n/g, "\n")) {
      results.push({
        path: f.path,
        status: "skipped-drift",
        detail: "The file changed since the diff was generated. Review manually and retry.",
      });
      continue;
    }
    const doc = await vscode.workspace.openTextDocument(uri);
    const lastLine = doc.lineAt(doc.lineCount - 1);
    edit.replace(
      uri,
      new vscode.Range(new vscode.Position(0, 0), lastLine.range.end),
      f.proposed,
    );
    results.push({ path: f.path, status: "applied" });
    openedFirst = openedFirst ?? uri;
  }

  const ok = await vscode.workspace.applyEdit(edit); // single undo step
  for (const r of results) {
    if ((r.status === "applied" || r.status === "created") && !ok) {
      r.status = "failed";
      r.detail = "WorkspaceEdit failed.";
    }
  }
  if (openedFirst) {
    void vscode.window.showTextDocument(openedFirst, { preview: true });
  }

  void webview.postMessage({
    type: "changesApplied",
    results,
    validation: changeSet.validation,
  });
}

export function rejectChanges(proposalId: string): boolean {
  return changeApprovals.reject(proposalId);
}

export function rejectPlan(planId: string): boolean {
  return scopeApprovals.reject(planId);
}

/** Run an allow-listed validation command in a visible terminal (user-initiated). */
export function runValidationCommand(command: string): boolean {
  if (!/^(npm|pnpm|yarn|bun)\s+(run\s+)?[\w:@/\-.]+$/.test(command) && command !== "npm test") {
    return false;
  }
  const terminal = vscode.window.createTerminal({ name: "Zeus Validation" });
  terminal.show();
  terminal.sendText(command);
  return true;
}

// Re-export for action modules.
export type { FileEdits };
