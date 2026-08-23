/**
 * "Review Changes" action — read-only inspection of uncommitted Git changes.
 *
 * SAFETY: only `git status` / `git diff` are executed (see git-inspect.ts).
 * Paths are filtered through the Privacy Firewall BEFORE any diff is read,
 * so protected/untracked-sensitive paths can never enter a review request.
 */

import * as vscode from "vscode";
import { ApprovalStore } from "../tools/approval-store";
import { runToolFlow } from "../tools/stream";
import { buildFirewall } from "../context/builders";
import {
  listUncommittedFiles,
  getDiffForPaths,
  readUntrackedContent,
  type ChangedFileEntry,
} from "../workspace/git-inspect";

const reviewApprovals = new ApprovalStore<{ entries: ChangedFileEntry[]; allowedPaths: Set<string> }>();

export async function startReview(webview: vscode.Webview): Promise<void> {
  const post = (msg: Record<string, unknown>) => void webview.postMessage(msg);

  const listing = await listUncommittedFiles();
  if (!listing.ok) {
    const msg =
      listing.reason === "not-a-repo" ? "This workspace is not a Git repository."
      : listing.reason === "git-missing" ? "Git was not found on this machine."
      : listing.reason === "no-workspace" ? "No workspace folder is open."
      : "Could not read Git status.";
    post({ type: "reviewUnavailable", message: msg });
    return;
  }

  const firewall = await buildFirewall();
  const allowed: ChangedFileEntry[] = [];
  let protectedSkipped = 0;
  for (const e of listing.value) {
    if (!firewall.isReadable(e.path)) {
      protectedSkipped++;
      continue;
    }
    allowed.push(e);
  }

  if (allowed.length === 0) {
    post({
      type: "reviewUnavailable",
      message:
        protectedSkipped > 0
          ? "Uncommitted changes exist only in privacy-protected files — nothing can be reviewed."
          : "No uncommitted changes found.",
    });
    return;
  }

  const pending = reviewApprovals.create("scan", {
    entries: allowed,
    allowedPaths: new Set(allowed.map((e) => e.path)),
  });

  post({
    type: "reviewFilesPreview",
    approvalId: pending.id,
    files: allowed.map((e) => ({ path: e.path, status: e.status })),
    protectedSkipped,
  });
}

export function cancelReview(approvalId: string): boolean {
  return reviewApprovals.reject(approvalId);
}

export async function reviewSelected(
  webview: vscode.Webview,
  approvalId: string,
  selectedPaths: string[],
): Promise<void> {
  const post = (msg: Record<string, unknown>) => void webview.postMessage(msg);
  const payload = reviewApprovals.approve(approvalId, "scan");
  if (!payload) {
    post({ type: "toolError", flowId: "gitReview", message: "That review preview expired. Start again." });
    return;
  }

  // Only paths that were in the approved preview are eligible.
  const safeSelected = selectedPaths.filter((p) => payload.allowedPaths.has(p));
  if (safeSelected.length === 0) {
    post({ type: "toolError", flowId: "gitReview", message: "No reviewable files were selected." });
    return;
  }

  const tracked = safeSelected.filter((p) => {
    const entry = payload.entries.find((e) => e.path === p);
    return entry && entry.status !== "untracked";
  });
  const untracked = safeSelected.filter((p) => {
    const entry = payload.entries.find((e) => e.path === p);
    return entry && entry.status === "untracked";
  });

  const sections: string[] = [];
  if (tracked.length > 0) {
    const diff = await getDiffForPaths(tracked);
    if (!diff.ok) {
      post({ type: "toolError", flowId: "gitReview", message: "Could not read the Git diff." });
      return;
    }
    sections.push(diff.value || "(tracked diff empty)");
  }
  for (const p of untracked.slice(0, 10)) {
    const content = await readUntrackedContent(p, 16 * 1024);
    sections.push(content.ok ? `NEW FILE ${p}:\n${content.value}` : `NEW FILE ${p}: (content unavailable)`);
  }

  const prompt = [
    "CODE REVIEW REQUEST — review the uncommitted changes below.",
    "",
    "RULES:",
    "- Judge ONLY what the diff shows. Do not invent surrounding code or history.",
    "- Be specific: reference exact functions/lines.",
    "",
    "OUTPUT SECTIONS (markdown headings):",
    "## Summary of Changes",
    "## Correctness Concerns",
    "## Security & Safety Notes",
    "## Test Coverage Gaps",
    "## Risk Assessment (low / medium / high + why)",
    "",
    "=== UNCOMMITTED CHANGES ===",
    sections.join("\n\n"),
  ].join("\n");

  await runToolFlow({
    flowId: "gitReview",
    webview,
    label: "Change Review",
    prompt,
    onText: () => undefined,
  });
}

// Re-export for typing convenience elsewhere.
export type { ChangedFileEntry };
