// Small LCS-based line diff. Good enough for the Diff Viewer's purposes
// (added/removed/modified line counts + a unified-style hunk list) without
// pulling in an external diff library. Capped so pathologically large files
// don't blow up the O(N*M) table — those fall back to a file-level summary.

export type DiffOp = { type: "same" | "add" | "remove"; line: string };

const MAX_LINES_FOR_LCS = 4000;

export function computeLineDiff(
  before: string,
  after: string,
): { ops: DiffOp[]; truncated: boolean } {
  const a = before.split("\n");
  const b = after.split("\n");

  if (a.length > MAX_LINES_FOR_LCS || b.length > MAX_LINES_FOR_LCS) {
    return { ops: [], truncated: true };
  }

  const n = a.length;
  const m = b.length;
  // dp[i][j] = length of LCS of a[i..] and b[j..]
  const dp: Uint32Array[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) dp[i] = new Uint32Array(m + 1);
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
      ops.push({ type: "same", line: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "remove", line: a[i] });
      i++;
    } else {
      ops.push({ type: "add", line: b[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: "remove", line: a[i++] });
  while (j < m) ops.push({ type: "add", line: b[j++] });

  return { ops, truncated: false };
}

export function diffStats(
  before: string,
  after: string,
): { added: number; removed: number; truncated: boolean } {
  const { ops, truncated } = computeLineDiff(before, after);
  if (truncated) return { added: 0, removed: 0, truncated: true };
  let added = 0;
  let removed = 0;
  for (const op of ops) {
    if (op.type === "add") added++;
    else if (op.type === "remove") removed++;
  }
  return { added, removed, truncated: false };
}
