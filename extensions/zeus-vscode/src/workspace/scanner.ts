/**
 * Privacy-first workspace scanner.
 *
 * Walks the workspace with vscode.workspace.fs and applies the Privacy
 * Firewall at EVERY step:
 *   - blocked/ignored DIRECTORIES are never descended into (so their files
 *     are never enumerated, read, or logged)
 *   - allowed files are collected as {relPath, bytes} metadata only — no
 *     file CONTENT is read during scanning
 *
 * The output is a SafeScan manifest: counts + allowed relative paths only.
 * It is safe to send to the webview (paths of non-sensitive files) and is the
 * ONLY thing shown to the user before they approve sending context onward.
 */

import * as vscode from "vscode";
import {
  PrivacyFirewall,
  applyLimits,
  DEFAULT_SCAN_LIMITS,
  type AllowedFile,
  type ScanLimits,
  type LimitedManifest,
} from "../privacy/firewall";
import { getConfig } from "../config";

export interface SafeScan {
  workspaceName: string;
  /** Files that passed every privacy rule (metadata only). */
  allowed: AllowedFile[];
  sensitiveBlockedCount: number;
  ignoredCount: number;
  skippedBinaryCount: number;
  limited: LimitedManifest;
  limits: ScanLimits;
  respectGitignore: boolean;
  customGlobsActive: boolean;
  truncated: boolean;
}

/** Priority sort: small config/docs first, then sources by depth then path. */
function priorityOf(relPath: string): number {
  const base = relPath.split("/").pop()!.toLowerCase();
  if (base === "package.json" || base === "tsconfig.json" || base === "readme.md") return 0;
  if (/^(go|cargo)\.(mod|toml)$/.test(base) || base === "requirements.txt" || base === "pyproject.toml") return 0;
  if (base.endsWith(".md")) return 2;
  if (base.endsWith(".json") || base.endsWith(".yaml") || base.endsWith(".yml") || base.endsWith(".toml")) return 1;
  if (relPath.split("/").length <= 2) return 3;
  return 4;
}

async function loadRootGitignore(root: vscode.Uri): Promise<string[]> {
  try {
    const uri = vscode.Uri.joinPath(root, ".gitignore");
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(bytes).split(/\r?\n/);
  } catch {
    return [];
  }
}

export async function scanWorkspace(): Promise<SafeScan> {
  const cfg = getConfig();
  const folders = vscode.workspace.workspaceFolders ?? [];
  const root = folders[0];
  if (!root) throw new Error("No workspace folder is open.");

  const limits: ScanLimits = {
    maxFiles: cfg.contextMaxFiles ?? DEFAULT_SCAN_LIMITS.maxFiles,
    maxFileBytes: (cfg.contextMaxFileKB ?? DEFAULT_SCAN_LIMITS.maxFileBytes / 1024) * 1024,
    maxTotalBytes: (cfg.contextMaxTotalKB ?? DEFAULT_SCAN_LIMITS.maxTotalBytes / 1024) * 1024,
  };

  const gitLines = await loadRootGitignore(root.uri);
  const customGlobs = cfg.extraBlockedPatterns ?? [];
  const respectGitignore = cfg.respectGitignore !== false;

  const firewall = new PrivacyFirewall({
    respectGitignore,
    gitignoreLines: gitLines,
    customGlobs,
  });

  const allowed: AllowedFile[] = [];
  let sensitiveBlockedCount = 0;
  let ignoredCount = 0;
  let skippedBinaryCount = 0;

  // BFS walk; never descend into directories the firewall blocks.
  const queue: Array<{ uri: vscode.Uri; rel: string }> = [{ uri: root.uri, rel: "" }];
  let guard = 0;
  while (queue.length > 0 && guard < 200_000) {
    guard++;
    const { uri, rel } = queue.shift()!;
    let entries: Array<[string, vscode.FileType]> = [];
    try {
      entries = await vscode.workspace.fs.readDirectory(uri);
    } catch {
      continue;
    }
    for (const [name, type] of entries) {
      const childRel = rel ? `${rel}/${name}` : name;
      if (type === vscode.FileType.Directory) {
        // Directory check: classify a synthetic path ending in "/" via rules.
        const dirDecision = new PrivacyFirewall({
          respectGitignore,
          gitignoreLines: gitLines,
          customGlobs,
        }).classify(childRel + "/x.txt");
        // If any file inside would be hard-blocked by the directory rule we
        // still need to walk allowed siblings inside mixed dirs like src/.
        const segBlocked = isDirHardBlocked(childRel);
        if (segBlocked) {
          sensitiveBlockedCount++;
          continue;
        }
        void dirDecision;
        queue.push({ uri: vscode.Uri.joinPath(uri, name), rel: childRel });
        continue;
      }
      if (type !== vscode.FileType.File) continue;

      const decision = firewall.classify(childRel);
      if (decision.kind === "sensitive") sensitiveBlockedCount++;
      else if (decision.kind === "ignored") ignoredCount++;
      else if (decision.kind === "skipped") {
        if (decision.reason === "binary") skippedBinaryCount++;
      } else {
        let size = 0;
        try {
          const stat = await vscode.workspace.fs.stat(vscode.Uri.joinPath(uri, name));
          size = stat.size;
        } catch {
          continue;
        }
        allowed.push({ relPath: childRel, bytes: size });
      }
    }
  }

  allowed.sort((a, b) => {
    const pa = priorityOf(a.relPath);
    const pb = priorityOf(b.relPath);
    if (pa !== pb) return pa - pb;
    const da = a.relPath.split("/").length;
    const db = b.relPath.split("/").length;
    if (da !== db) return da - db;
    return a.relPath.localeCompare(b.relPath);
  });

  const limited = applyLimits(allowed, limits);

  return {
    workspaceName: root.name,
    allowed,
    sensitiveBlockedCount,
    ignoredCount,
    skippedBinaryCount,
    limited,
    limits,
    respectGitignore,
    customGlobsActive: customGlobs.length > 0,
    truncated: limited.truncatedByFileCount || limited.truncatedByTotalSize,
  };
}

/** Hard-blocked directory segments — mirrors firewall BLOCKED_DIR_SEGMENTS. */
const HARD_BLOCKED_DIRS = new Set([
  ".aws", ".ssh", ".git", ".gnupg", "node_modules", "vendor", "dist",
  "build", "out", "coverage", ".next", ".nuxt", ".cache", ".gradle",
  "__pycache__", ".venv", "venv",
]);

function isDirHardBlocked(relDir: string): boolean {
  return relDir.split("/").some((seg) => HARD_BLOCKED_DIRS.has(seg.toLowerCase()));
}

// ── Content reading helpers (firewall-gated) ─────────────────────────

export interface FileContentResult {
  ok: true;
  relPath: string;
  text: string;
  truncated: boolean;
}

export type FileReadFailure =
  | { ok: false; reason: "blocked" | "binary" | "tooLarge" | "missing"; detail?: string };

/**
 * Read a single workspace file's content AFTER passing it through the
 * firewall. This is the ONLY sanctioned way for Zeus features to obtain file
 * content. Blocked/binary/oversized files are never opened.
 */
export async function readSafeFile(
  rootUri: vscode.Uri,
  relPath: string,
  firewall: PrivacyFirewall,
  maxBytes: number,
): Promise<FileContentResult | FileReadFailure> {
  const decision = firewall.classify(relPath);
  if (decision.kind !== "allowed") {
    return { ok: false, reason: decision.kind === "sensitive" ? "blocked" : decision.kind === "ignored" ? "blocked" : decision.kind === "skipped" && decision.reason === "binary" ? "binary" : "tooLarge" };
  }
  try {
    const uri = vscode.Uri.joinPath(rootUri, ...relPath.split("/"));
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.size > maxBytes) return { ok: false, reason: "tooLarge" };
    const bytes = await vscode.workspace.fs.readFile(uri);
    // Binary sniff: NUL byte in first 8KB → treat as binary.
    const sniffLen = Math.min(bytes.length, 8192);
    for (let i = 0; i < sniffLen; i++) {
      if (bytes[i] === 0) return { ok: false, reason: "binary" };
    }
    const decoder = new TextDecoder("utf-8", { fatal: false });
    let text = decoder.decode(bytes.slice(0, maxBytes));
    const truncated = bytes.length > maxBytes;
    if (truncated) text += "\n… [file truncated for size]";
    return { ok: true, relPath, text, truncated };
  } catch {
    return { ok: false, reason: "missing" };
  }
}
