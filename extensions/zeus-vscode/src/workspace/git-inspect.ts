/**
 * Read-only Git inspection helpers.
 *
 * SAFETY: only non-destructive, read-only commands are ever run
 * (status / diff / rev-parse). No commit, push, reset, checkout, clean,
 * rebase — ever. Paths passed to diff are pre-filtered through the Privacy
 * Firewall so ignored/private paths can never leak into a diff request.
 */

import { execFile } from "node:child_process";
import * as vscode from "vscode";

export type GitResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "no-workspace" | "not-a-repo" | "git-missing" | "error"; detail?: string };

function runGit(root: string, args: string[], timeoutMs = 15_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["-C", root, ...args],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err && typeof (err as NodeJS.ErrnoException).code === "string" && (err as NodeJS.ErrnoException).code === "ENOENT") {
          reject(Object.assign(new Error("git-missing"), { code: "ENOENT" }));
          return;
        }
        // execFile reports non-zero exit via err but still gives stdout/stderr.
        const code = err && typeof (err as { code?: number }).code === "number" ? (err as { code?: number }).code! : 0;
        resolve({ code, stdout: stdout ?? "", stderr: stderr ?? "" });
      },
    );
  });
}

export async function getWorkspaceGitRoot(): Promise<GitResult<string>> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) return { ok: false, reason: "no-workspace" };
  try {
    const r = await runGit(root.uri.fsPath, ["rev-parse", "--show-toplevel"]);
    if (r.code !== 0) return { ok: false, reason: "not-a-repo", detail: r.stderr };
    return { ok: true, value: r.stdout.trim() };
  } catch (err) {
    if (err instanceof Error && err.message === "git-missing") {
      return { ok: false, reason: "git-missing" };
    }
    return { ok: false, reason: "error", detail: err instanceof Error ? err.message : undefined };
  }
}

export interface ChangedFileEntry {
  /** Workspace-relative path (forward slashes). */
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "untracked";
}

/**
 * Enumerate uncommitted changes (staged + unstaged + untracked).
 */
export async function listUncommittedFiles(): Promise<GitResult<ChangedFileEntry[]>> {
  const wsRoot = vscode.workspace.workspaceFolders?.[0];
  if (!wsRoot) return { ok: false, reason: "no-workspace" };
  const gitRoot = await getWorkspaceGitRoot();
  if (!gitRoot.ok) return gitRoot;

  try {
    const r = await runGit(gitRoot.value, ["status", "--porcelain=v1", "-z"]);
    if (r.code !== 0) return { ok: false, reason: "error", detail: r.stderr };

    const entries: ChangedFileEntry[] = [];
    const tokens = r.stdout.split("\0").filter(Boolean);
    for (let i = 0; i < tokens.length; i++) {
      const xy = tokens[i].slice(0, 2);
      let path = tokens[i].slice(3);
      // Rename entries carry a second NUL-terminated original path.
      if (xy.includes("R") || xy.includes("C")) {
        i++; // skip rename target token
      }
      path = path.replace(/\\/g, "/").trim();
      if (!path) continue;
      let status: ChangedFileEntry["status"];
      if (xy.includes("?")) status = "untracked";
      else if (xy.includes("A")) status = "added";
      else if (xy.includes("D")) status = "deleted";
      else if (xy.includes("R") || xy.includes("C")) status = "renamed";
      else status = "modified";
      entries.push({ path, status });
    }
    return { ok: true, value: dedupeByPath(entries) };
  } catch (err) {
    return { ok: false, reason: "error", detail: err instanceof Error ? err.message : undefined };
  }
}

function dedupeByPath(entries: ChangedFileEntry[]): ChangedFileEntry[] {
  const seen = new Map<string, ChangedFileEntry>();
  for (const e of entries) {
    const existing = seen.get(e.path);
    if (!existing || (existing.status === "modified" && e.status !== "modified")) {
      seen.set(e.path, e);
    }
  }
  return [...seen.values()];
}

/**
 * Unified diff for specific workspace-relative paths (staged + unstaged),
 * plus full current content for untracked files (they never appear in diffs).
 */
export async function getDiffForPaths(paths: string[], maxDiffBytes = 64 * 1024): Promise<GitResult<string>> {
  const wsRoot = vscode.workspace.workspaceFolders?.[0];
  if (!wsRoot) return { ok: false, reason: "no-workspace" };
  const gitRoot = await getWorkspaceGitRoot();
  if (!gitRoot.ok) return gitRoot;

  const tracked = paths.filter((p) => !p.startsWith("(untracked)"));
  try {
    const parts: string[] = [];
    const cap = maxDiffBytes;
    let size = 0;
    if (tracked.length > 0) {
      for (const args of [
        ["diff", "--cached", "--no-color", "--unified=2", "--", ...tracked],
        ["diff", "--no-color", "--unified=2", "--", ...tracked],
      ]) {
        const r = await runGit(gitRoot.value, args);
        if (r.code !== 0) return { ok: false, reason: "error", detail: r.stderr };
        if (size + r.stdout.length > cap) break;
        parts.push(r.stdout);
        size += r.stdout.length;
      }
    }
    return { ok: true, value: parts.join("\n").trim() };
  } catch (err) {
    return { ok: false, reason: "error", detail: err instanceof Error ? err.message : undefined };
  }
}

/** Full current content of an untracked file via git (respects no hooks). */
export async function readUntrackedContent(relPath: string, maxBytes: number): Promise<GitResult<string>> {
  const wsRoot = vscode.workspace.workspaceFolders?.[0];
  if (!wsRoot) return { ok: false, reason: "no-workspace" };
  try {
    const abs = `${wsRoot.uri.fsPath}/${relPath}`;
    const fsMod = await import("node:fs/promises");
    const stat = await fsMod.stat(abs);
    if (stat.size > maxBytes) return { ok: false, reason: "error", detail: "file too large" };
    const buf = await fsMod.readFile(abs);
    if (buf.subarray(0, Math.min(8192, buf.length)).includes(0)) {
      return { ok: false, reason: "error", detail: "binary file" };
    }
    return { ok: true, value: buf.toString("utf8") };
  } catch (err) {
    return { ok: false, reason: "error", detail: err instanceof Error ? err.message : undefined };
  }
}
