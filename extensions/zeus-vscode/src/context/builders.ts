/**
 * Context attachment builders for chat chips and tool flows.
 *
 * Every builder passes paths through the Privacy Firewall BEFORE reading any
 * content. Blocked files never have their contents read or transmitted — the
 * user gets a safe explanation instead.
 */

import * as vscode from "vscode";
import { PrivacyFirewall } from "../privacy/firewall";
import { getConfig } from "../config";
import {
  listUncommittedFiles,
  getDiffForPaths,
  readUntrackedContent,
  type ChangedFileEntry,
} from "../workspace/git-inspect";

const CONTEXT_FILE_CAP_BYTES = 24 * 1024;
const DIFF_CAP_BYTES = 48 * 1024;

export type ContextKind = "activeFile" | "selection" | "projectSummary" | "diagnostics" | "gitDiff";

export interface ContextAttachment {
  kind: ContextKind;
  label: string;
  /** Safe detail for UI display (paths of non-sensitive files only). */
  detail?: string;
  text: string;
  bytes: number;
}

export interface BlockedAttachment {
  kind: ContextKind | "blocked";
  blocked: true;
  message: string;
}

/** Build a firewall from current settings + workspace .gitignore. */
export async function buildFirewall(): Promise<PrivacyFirewall> {
  const cfg = getConfig();
  let gitLines: string[] = [];
  if (cfg.respectGitignore && vscode.workspace.workspaceFolders?.[0]) {
    try {
      const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, ".gitignore");
      gitLines = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)).split(/\r?\n/);
    } catch {
      /* no .gitignore */
    }
  }
  return new PrivacyFirewall({
    respectGitignore: cfg.respectGitignore,
    gitignoreLines: gitLines,
    customGlobs: cfg.extraBlockedPatterns,
  });
}

function relPathOf(uri: vscode.Uri): string | null {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) return null;
  const rel = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/");
  return rel;
}

// ── Active file ──────────────────────────────────────────────────────

export async function collectActiveFile(): Promise<ContextAttachment | BlockedAttachment> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.uri.scheme !== "file") {
    return { kind: "blocked", blocked: true, message: "No active file to attach." };
  }
  const rel = relPathOf(editor.document.uri);
  if (!rel) return { kind: "blocked", blocked: true, message: PrivacyFirewall.USER_BLOCKED_MESSAGE };

  const firewall = await buildFirewall();
  const decision = firewall.classify(rel);
  if (decision.kind !== "allowed") {
    return { kind: "blocked", blocked: true, message: PrivacyFirewall.USER_BLOCKED_MESSAGE };
  }

  const text = editor.document.getText();
  const capped = capText(text, CONTEXT_FILE_CAP_BYTES);
  return {
    kind: "activeFile",
    label: "Active File",
    detail: rel,
    text: `### Active file: ${rel}\n\`\`\`\n${capped.text}\n\`\`\`${capped.truncated ? "\n[truncated]" : ""}`,
    bytes: Buffer.byteLength(capped.text),
  };
}

// ── Selection ────────────────────────────────────────────────────────

export async function collectSelection(): Promise<ContextAttachment | BlockedAttachment> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    return { kind: "blocked", blocked: true, message: "No code selected." };
  }
  const rel = relPathOf(editor.document.uri);
  if (!rel) return { kind: "blocked", blocked: true, message: PrivacyFirewall.USER_BLOCKED_MESSAGE };

  const firewall = await buildFirewall();
  if (!firewall.isReadable(rel)) {
    return { kind: "blocked", blocked: true, message: PrivacyFirewall.USER_BLOCKED_MESSAGE };
  }

  const sel = editor.document.getText(editor.selection);
  const capped = capText(sel, CONTEXT_FILE_CAP_BYTES);
  return {
    kind: "selection",
    label: "Selected Code",
    detail: `${rel} (lines ${editor.selection.start.line + 1}-${editor.selection.end.line + 1})`,
    text: `### Selected code from ${rel} (lines ${editor.selection.start.line + 1}-${editor.selection.end.line + 1}):\n\`\`\`\n${capped.text}\n\`\`\``,
    bytes: Buffer.byteLength(capped.text),
  };
}

// ── Diagnostics ──────────────────────────────────────────────────────

export interface DiagnosticIssue {
  id: string;
  path: string;
  severityLabel: "error" | "warning" | "info" | "hint";
  message: string;
  line: number;
  source?: string;
  excerpt?: string;
}

export interface DiagnosticsBundle {
  issues: DiagnosticIssue[];
  excludedProtectedFiles: number;
}

/** Group current VS Code diagnostics; protected files are fully excluded. */
export async function collectDiagnostics(): Promise<DiagnosticsBundle> {
  const firewall = await buildFirewall();
  const all = vscode.languages.getDiagnostics();
  const issues: DiagnosticIssue[] = [];
  let excludedProtectedFiles = 0;
  let seq = 0;

  const severityOf = (s: vscode.DiagnosticSeverity): DiagnosticIssue["severityLabel"] => {
    if (s === vscode.DiagnosticSeverity.Error) return "error";
    if (s === vscode.DiagnosticSeverity.Warning) return "warning";
    if (s === vscode.DiagnosticSeverity.Information) return "info";
    return "hint";
  };

  for (const [uri, diags] of all) {
    if (diags.length === 0) continue;
    const rel = relPathOf(uri);
    if (!rel || !firewall.isReadable(rel)) {
      excludedProtectedFiles++;
      continue; // never open or excerpt protected files
    }
    for (const d of diags.slice(0, 10)) {
      issues.push({
        id: `iss-${seq++}`,
        path: rel,
        severityLabel: severityOf(d.severity),
        message: d.message.length > 300 ? d.message.slice(0, 300) + "…" : d.message,
        line: d.range.start.line + 1,
        source: d.source,
      });
    }
  }

  // Attach small excerpts (≤3 lines around each issue) for allowed files.
  const byPath = new Map<string, DiagnosticIssue[]>();
  for (const iss of issues) {
    const arr = byPath.get(iss.path) ?? [];
    arr.push(iss);
    byPath.set(iss.path, arr);
  }
  for (const [path, group] of byPath) {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) break;
    try {
      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.joinPath(folder.uri, ...path.split("/")),
      );
      for (const iss of group) {
        const startLine = Math.max(0, iss.line - 2);
        const endLine = Math.min(doc.lineCount - 1, iss.line);
        const lines: string[] = [];
        for (let ln = startLine; ln <= endLine && lines.join("\n").length < 1024; ln++) {
          const t = doc.lineAt(ln).text;
          lines.push(t.length > 200 ? t.slice(0, 200) + "…" : t);
        }
        iss.excerpt = lines.join("\n");
      }
    } catch {
      /* document unreadable — issue still listed without excerpt */
    }
  }

  return { issues: issues.slice(0, 40), excludedProtectedFiles };
}

export async function collectDiagnosticsAttachment(): Promise<ContextAttachment | BlockedAttachment> {
  const bundle = await collectDiagnostics();
  if (bundle.issues.length === 0) {
    return {
      kind: "blocked",
      blocked: true,
      message: bundle.excludedProtectedFiles > 0
        ? "No attachable diagnostics in includeable files."
        : "No diagnostics found.",
    };
  }
  const L = bundle.issues.map((i) =>
    `- [${i.severityLabel}] ${i.path}:${i.line}${i.source ? ` (${i.source})` : ""}: ${i.message}${i.excerpt ? `\n  excerpt:\n${indent(i.excerpt, "    ")}` : ""}`,
  );
  const text =
    `### Current diagnostics (${bundle.issues.length} shown${bundle.excludedProtectedFiles > 0 ? `, ${bundle.excludedProtectedFiles} protected file(s) excluded` : ""}):\n` +
    L.join("\n");
  return {
    kind: "diagnostics",
    label: "Diagnostics",
    detail: `${bundle.issues.length} issue(s)`,
    text,
    bytes: Buffer.byteLength(text),
  };
}

// ── Git diff ─────────────────────────────────────────────────────────

export async function collectGitDiffAttachment(): Promise<ContextAttachment | BlockedAttachment> {
  const listing = await listUncommittedFiles();
  if (!listing.ok) {
    const msg =
      listing.reason === "not-a-repo" ? "This workspace is not a Git repository."
      : listing.reason === "git-missing" ? "Git was not found on this machine."
      : listing.reason === "no-workspace" ? "No workspace folder is open."
      : `Could not read Git status.${listing.detail ? " (" + listing.detail + ")" : ""}`;
    return { kind: "blocked", blocked: true, message: msg };
  }

  const firewall = await buildFirewall();
  const allowed: ChangedFileEntry[] = [];
  let protectedSkipped = 0;
  for (const entry of listing.value) {
    if (entry.status === "deleted") continue;
    if (!firewall.isReadable(entry.path)) {
      protectedSkipped++;
      continue;
    }
    allowed.push(entry);
  }

  if (allowed.length === 0) {
    return {
      kind: "blocked",
      blocked: true,
      message:
        protectedSkipped > 0
          ? "Changes exist only in privacy-protected files; nothing attached."
          : "No uncommitted changes found.",
    };
  }

  const trackedPaths = allowed.filter((e) => e.status !== "untracked").map((e) => e.path);
  const diffPart = trackedPaths.length > 0 ? await getDiffForPaths(trackedPaths, DIFF_CAP_BYTES) : undefined;
  if (diffPart && !diffPart.ok) {
    return { kind: "blocked", blocked: true, message: `Could not read the Git diff.` };
  }

  const sections: string[] = [
    `### Uncommitted changes (${allowed.length} file(s)${protectedSkipped > 0 ? `, ${protectedSkipped} privacy-protected file(s) excluded` : ""})`,
  ];
  if (diffPart && diffPart.ok && diffPart.value) {
    const capped = capText(diffPart.value, DIFF_CAP_BYTES);
    sections.push("```diff\n" + capped.text + "\n```");
  }
  for (const entry of allowed.filter((e) => e.status === "untracked")) {
    const content = await readUntrackedContent(entry.path, 8 * 1024);
    if (content.ok) {
      sections.push(`New file ${entry.path}:\n\`\`\`\n${capText(content.value, 8 * 1024).text}\n\`\`\``);
    } else {
      sections.push(`New file ${entry.path} (content not included).`);
    }
  }
  if (sections.length === 1) sections.push("(diff empty)");

  const text = sections.join("\n\n");
  return {
    kind: "gitDiff",
    label: "Git Diff",
    detail: `${allowed.length} changed file(s)`,
    text,
    bytes: Buffer.byteLength(text),
  };
}

// ── Project summary chip ─────────────────────────────────────────────

let cachedProjectSummary: { name: string; text: string; at: number } | null = null;

/**
 * Project Summary = metadata-level facts from the last approved analysis
 * scan (paths, counts, detected stack facts). NEVER bulk file contents.
 */
export function setCachedProjectSummary(name: string, text: string): void {
  cachedProjectSummary = { name, text, at: Date.now() };
}

export function getCachedProjectSummary(): ContextAttachment | BlockedAttachment {
  if (!cachedProjectSummary) {
    return {
      kind: "blocked",
      blocked: true,
      message: "No project summary yet — run Analyze Project first.",
    };
  }
  return {
    kind: "projectSummary",
    label: "Project Summary",
    detail: cachedProjectSummary.name,
    text: cachedProjectSummary.text,
    bytes: Buffer.byteLength(cachedProjectSummary.text),
  };
}

export function clearCachedProjectSummary(): void {
  cachedProjectSummary = null;
}

// ── helpers ──────────────────────────────────────────────────────────

function capText(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text) <= maxBytes) return { text, truncated: false };
  // Cut on a line boundary near the cap.
  let cut = maxBytes;
  const nl = text.lastIndexOf("\n", maxBytes);
  if (nl > maxBytes / 2) cut = nl;
  return { text: text.slice(0, cut) + "\n… [truncated]", truncated: true };
}

function indent(text: string, pad: string): string {
  return text
    .split("\n")
    .map((l) => pad + l)
    .join("\n");
}
