// Pure version comparator — no VS Code imports so it stays unit-testable
// under plain Node (see scripts/test-update-version.mjs).

/** Strict semver-ish comparison: splits on dots/hyphens, compares numerically. */
export function isNewerVersion(remote: string, local: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split(/[.-]/)
      .map((part) => Number.parseInt(part, 10))
      .map((n) => (Number.isFinite(n) ? n : 0));
  const remoteParts = parse(remote);
  const localParts = parse(local);
  const len = Math.max(remoteParts.length, localParts.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (remoteParts[i] ?? 0) - (localParts[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}
