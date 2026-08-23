/**
 * Pure diff + structured-edit utilities for Zeus coding actions.
 *
 * The AI never applies changes itself. It returns SEARCH/REPLACE blocks in a
 * strict text format; Zeus parses them here, computes a real unified diff
 * locally, shows it to the user, and only applies after explicit approval.
 *
 * Everything in this module is pure and unit-tested.
 */

// ── Line diff (LCS-based) ────────────────────────────────────────────

export type DiffOp =
  | { op: "same"; line: string }
  | { op: "del"; line: string }
  | { op: "add"; line: string };

const LCS_LINE_CAP = 4000; // avoid O(n²) blowups on huge files

export function splitLines(text: string): string[] {
  if (text === "") return [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  // A trailing newline yields a final empty element — drop it but remember
  // semantics are handled by callers comparing joined content instead.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** LCS line diff. Falls back to replace-all when files are enormous. */
export function diffLines(a: string[], b: string[]): DiffOp[] {
  if (a.length + b.length > LCS_LINE_CAP * 2) {
    return [
      ...a.map((line) => ({ op: "del" as const, line })),
      ...b.map((line) => ({ op: "add" as const, line })),
    ];
  }

  const n = a.length;
  const m = b.length;
  // DP table of LCS lengths (uint32 rows to keep memory sane).
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ op: "same", line: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ op: "del", line: a[i] });
      i++;
    } else {
      ops.push({ op: "add", line: b[j] });
      j++;
    }
  }
  while (i < n) ops.push({ op: "del", line: a[i++] });
  while (j < m) ops.push({ op: "add", line: b[j++] });
  return ops;
}

export interface DiffStats {
  additions: number;
  deletions: number;
}

export function diffStats(oldText: string, newText: string): DiffStats {
  const ops = diffLines(splitLines(oldText), splitLines(newText));
  let additions = 0;
  let deletions = 0;
  for (const op of ops) {
    if (op.op === "add") additions++;
    else if (op.op === "del") deletions++;
  }
  return { additions, deletions };
}

/**
 * Produce a unified-diff-style text (Zeus display format — hunk headers with
 * start lines; not intended for `git apply`).
 */
export function unifiedDiff(path: string, oldText: string, newText: string, context = 3): string {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const ops = diffLines(a, b);

  const out: string[] = [`--- ${path} (current)`, `+++ ${path} (proposed)`];

  // Group consecutive changes into hunks with `context` lines around them.
  let idxA = 0;
  let idxB = 0;
  type Row = { op: DiffOp["op"]; line: string; ai?: number; bi?: number };
  const rows: Row[] = ops.map((op) => {
    const row: Row = { op: op.op, line: op.line };
    if (op.op !== "add") row.ai = idxA++;
    if (op.op !== "del") row.bi = idxB++;
    return row;
  });

  const changeIdxs: number[] = [];
  rows.forEach((r, k) => {
    if (r.op !== "same") changeIdxs.push(k);
  });
  if (changeIdxs.length === 0) return "";

  // Merge nearby changes into ranges.
  const ranges: Array<[number, number]> = [];
  let start = changeIdxs[0];
  let prev = changeIdxs[0];
  for (let t = 1; t < changeIdxs.length; t++) {
    if (changeIdxs[t] - prev <= context * 2 + 1) {
      prev = changeIdxs[t];
    } else {
      ranges.push([start, prev]);
      start = prev = changeIdxs[t];
    }
  }
  ranges.push([start, prev]);

  for (const [cStart, cEnd] of ranges) {
    const from = Math.max(0, cStart - context);
    const to = Math.min(rows.length - 1, cEnd + context);
    const slice = rows.slice(from, to + 1);
    const firstA = slice.find((r) => r.ai !== undefined)?.ai ?? 0;
    const firstB = slice.find((r) => r.bi !== undefined)?.bi ?? 0;
    const lenA = slice.filter((r) => r.op !== "add").length;
    const lenB = slice.filter((r) => r.op !== "del").length;
    out.push(`@@ -${firstA + 1},${lenA} +${firstB + 1},${lenB} @@`);
    for (const r of slice) {
      if (r.op === "same") out.push(" " + r.line);
      else if (r.op === "del") out.push("-" + r.line);
      else out.push("+" + r.line);
    }
  }
  return out.join("\n");
}

// ── SEARCH/REPLACE edit blocks ───────────────────────────────────────

export interface FileEdits {
  path: string;
  /** create → file must not exist yet; update → SEARCH/REPLACE blocks */
  action: "create" | "update";
  blocks: EditBlock[];
  fullContent?: string; // for create
}

export interface EditBlock {
  search: string;
  replace: string;
}

const MARK_FILE = "*** FILE:";
const MARK_ADD = "*** ADD FILE:";
const MARK_SEARCH = "<<<<<<< SEARCH";
const MARK_SEP = "=======";
const MARK_REPLACE = ">>>>>>> REPLACE";

/**
 * Parse the structured edit format emitted by Zeus planning requests:
 *
 *   *** FILE: src/x.ts
 *   <<<<<<< SEARCH
 *   ...exact existing lines...
 *   =======
 *   ...new lines...
 *   >>>>>>> REPLACE
 *
 *   *** ADD FILE: src/new.ts
 *   <complete new file content>
 *
 * Returns parsed files plus a list of unparsable segments (never thrown away
 * silently — callers surface them as conflicts).
 */
export function parseEditInstructions(
  text: string,
): { files: FileEdits[]; unparsableCount: number } {
  const files: FileEdits[] = [];
  let unparsableCount = 0;

  const lines = splitLines(text);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith(MARK_ADD)) {
      const path = extractPath(line.slice(MARK_ADD.length));
      i++;
      const contentLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith("*** ")) {
        contentLines.push(lines[i]);
        i++;
      }
      if (path) {
        files.push({
          path,
          action: "create",
          blocks: [],
          fullContent: contentLines.join("\n") + "\n",
        });
      } else {
        unparsableCount++;
      }
      continue;
    }

    if (line.startsWith(MARK_FILE)) {
      const path = extractPath(line.slice(MARK_FILE.length));
      i++;
      const blocks: EditBlock[] = [];
      while (i < lines.length && !lines[i].startsWith("*** ")) {
        if (lines[i].trimEnd() === MARK_SEARCH) {
          i++;
          const searchLines: string[] = [];
          while (i < lines.length && lines[i].trimEnd() !== MARK_SEP) {
            searchLines.push(lines[i]);
            i++;
          }
          if (i >= lines.length) {
            unparsableCount++;
            break;
          }
          i++; // skip =======
          const replaceLines: string[] = [];
          while (i < lines.length && lines[i].trimEnd() !== MARK_REPLACE) {
            replaceLines.push(lines[i]);
            i++;
          }
          if (i >= lines.length) {
            unparsableCount++;
            break;
          }
          i++; // skip >>>>>>> REPLACE
          blocks.push({ search: searchLines.join("\n"), replace: replaceLines.join("\n") });
        } else {
          i++;
        }
      }
      if (path && blocks.length > 0) {
        files.push({ path, action: "update", blocks });
      } else if (!path || blocks.length === 0) {
        unparsableCount += path ? 0 : 1;
      }
      continue;
    }

    i++;
  }

  return { files, unparsableCount };
}

function extractPath(raw: string): string | null {
  let p = raw.trim();
  // Strip optional backticks/fences the model may add.
  p = p.replace(/^[`'"]+/, "").replace(/[`'"]+$/, "").trim();
  if (!p || /[<>:"|?*]/.test(p) || p.includes("\u0000")) return null;
  const normalized = normalizeRelPathLocal(p);
  return normalized;
}

function normalizeRelPathLocal(p: string): string | null {
  let s = p.replace(/\\/g, "/");
  while (s.startsWith("./")) s = s.slice(2);
  if (!s || s.startsWith("/") || /^[a-zA-Z]:/.test(s) || s.split("/").includes("..")) return null;
  return s;
}

/**
 * Apply SEARCH/REPLACE blocks to original text. Each block's SEARCH must
 * match EXACTLY once (after CRLF normalization); otherwise that block fails
 * and is reported — nothing partial gets applied by this function itself.
 */
export function applyEditBlocks(
  original: string,
  blocks: EditBlock[],
): { result: string | null; failedBlocks: number[] } {
  let result = original.replace(/\r\n/g, "\n");
  const failed: number[] = [];

  for (let bi = 0; bi < blocks.length; bi++) {
    const { search, replace } = blocks[bi];
    const needle = search.replace(/\r\n/g, "\n");
    const idx = result.indexOf(needle);
    if (idx === -1 || needle === "") {
      failed.push(bi);
      continue;
    }
    const second = result.indexOf(needle, idx + 1);
    if (second !== -1) {
      // Ambiguous match — refuse rather than guess.
      failed.push(bi);
      continue;
    }
    result = result.slice(0, idx) + replace.replace(/\r\n/g, "\n") + result.slice(idx + needle.length);
  }

  return { result: failed.length === 0 ? result : null, failedBlocks: failed };
}
