/**
 * Zeus Privacy Firewall — pure path/content classification core.
 *
 * NON-NEGOTIABLE: Zeus never reads, sends, logs, or indexes sensitive files.
 * This module decides, for any workspace-relative path, whether that file may
 * ever be read by extension code that forwards content onward (webview,
 * backend, AI provider).
 *
 * Enforcement happens in the EXTENSION HOST before anything is transmitted.
 * The webview only receives counts and already-filtered data — never this
 * module's internals and never blocked file contents.
 *
 * Hard blocks (product spec, minimum set):
 *   .env / .env.* (EXCEPT .env.example — allowed for structural analysis)
 *   *.pem *.key *.p12 *.pfx · id_rsa id_ed25519
 *   credentials* secrets* *token* *password*
 *   .aws/ .ssh/ .git/ node_modules/ vendor/ dist/ build/ coverage/
 *   .next/ .nuxt/ .cache/
 *
 * Additional safety nets beyond the spec minimum:
 *   - .npmrc / .netrc (auth token carriers), .htpasswd, .pgpass
 *   - other key material: .jks/.keystore/.kdbx/.gnupg dirs/.tfstate/.tfvars
 *   - binary/media/archive/executable artifacts (skipped, not "sensitive")
 *   - lock files & minified bundles & sourcemaps (skipped from inclusion;
 *     their EXISTENCE may still be used for package-manager detection)
 *   - .gitignore rules respected by default (practical subset)
 *   - user-configured extra blocked globs (zeus.privacy.extraBlockedPatterns)
 */

// ── Types ─────────────────────────────────────────────────────────────

export type Classification =
  | { kind: "allowed" }
  | { kind: "sensitive"; reason: string }
  | { kind: "ignored"; source: "gitignore" | "custom-glob" }
  | { kind: "skipped"; reason: "binary" | "lockfile" | "minified" | "sourcemap" };

export interface FirewallOptions {
  respectGitignore?: boolean;
  /** Raw .gitignore lines (root file). Practical subset of gitignore syntax. */
  gitignoreLines?: string[];
  /** User-configured extra blocked glob patterns. */
  customGlobs?: string[];
}

export interface ScanLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_SCAN_LIMITS: ScanLimits = {
  maxFiles: 300,
  maxFileBytes: 64 * 1024,
  maxTotalBytes: 512 * 1024,
};

/** `.env.example` is explicitly ALLOWED for structural analysis only. */
const ALLOWED_EXCEPTIONS = new Set([".env.example"]);

/** Exact file names (basename match) that are always hard-blocked. */
const BLOCKED_FILE_NAMES = new Set([
  ".env",
  ".npmrc",
  ".netrc",
  ".htpasswd",
  ".pgpass",
  ".my.cnf",
  ".gitcredentials",
  ".git-credentials",
  "id_rsa",
  "id_ed25519",
  "id_ecdsa",
  "id_dsa",
]);

/** Directory segments — a path containing ANY of these is hard-blocked. */
const BLOCKED_DIR_SEGMENTS = new Set([
  ".aws",
  ".ssh",
  ".git",
  ".gnupg",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "out", // common JS build output; harmless to over-block for analysis purposes
  "coverage",
  ".next",
  ".nuxt",
  ".cache",
  ".gradle",
  "__pycache__",
  ".venv",
  "venv",
]);

/** Extensions that are key/credential material. */
const BLOCKED_KEY_EXTENSIONS = new Set([
  ".pem",
  ".key",
  ".p12",
  ".pfx",
  ".jks",
  ".keystore",
  ".kdbx",
  ".tfstate",
]);

/** Binary / asset extensions — skipped (never sent), counted separately. */
export const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".bmp", ".tiff", ".svg",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".zip", ".gz", ".tgz", ".tar", ".rar", ".7z", ".bz2", ".xz",
  ".mp3", ".mp4", ".mov", ".avi", ".mkv", ".wav", ".webm", ".flac", ".ogg",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".exe", ".dll", ".so", ".dylib", ".jar", ".class", ".wasm", ".node",
  ".o", ".a", ".lib", ".obj", ".pyc", ".pyo", ".class",
  ".db", ".sqlite", ".sqlite3", ".pdb", ".bak", ".dmg", ".iso", ".bin", ".dat",
  ".psd", ".ai", ".sketch", ".blend", ".fbx", ".unity", ".asset",
]);

/** Lock files — existence used for detection; CONTENT is never included. */
export const LOCK_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "composer.lock",
  "Gemfile.lock",
  "poetry.lock",
  "Cargo.lock",
  "Pipfile.lock",
  "packages.locker",
  "packages.lock",
]);

/** Filename-substring rules on the basename (lowercased). */
function namePatternBlock(basenameLower: string): string | null {
  if (/^credentials/.test(basenameLower)) return "credential-named file";
  if (/^secret/.test(basenameLower)) return "secret-named file";
  if (basenameLower.includes("token")) return "token-named file";
  if (basenameLower.includes("password")) return "password-named file";
  if (basenameLower.startsWith(".env")) return "environment/secret file";
  return null;
}

/**
 * Normalize a workspace-relative path: forward slashes, no leading "./".
 * Returns null for paths that try to escape the workspace.
 */
export function normalizeRelPath(p: string): string | null {
  let s = p.replace(/\\/g, "/").trim();
  while (s.startsWith("./")) s = s.slice(2);
  if (s.startsWith("/") || /^[a-zA-Z]:/.test(s) || s.includes("../")) return null;
  return s === "" ? null : s;
}

function basename(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx === -1 ? p : p.slice(idx + 1);
}

// ── Glob translation (for custom globs + gitignore subset) ───────────

interface CompiledRule {
  regex: RegExp;
  negated: boolean;
  dirOnly: boolean;
  anchored: boolean;
}

/**
 * Translate a practical subset of gitignore/glob syntax into a RegExp:
 *   `*` matches within one segment, `**` crosses segments, `?` one char.
 *   Trailing "/" → directory-only rule. Leading "/" or embedded "/" →
 *   anchored to root. Otherwise the pattern may match at any depth.
 */
export function compileGlobRule(raw: string): CompiledRule | null {
  let pat = raw.trim();
  if (!pat || pat.startsWith("#")) return null;

  const negated = pat.startsWith("!");
  if (negated) pat = pat.slice(1);

  const dirOnly = pat.endsWith("/");
  if (dirOnly) pat = pat.slice(0, -1);
  pat = pat.replace(/\/+$/, "");

  const anchored = pat.startsWith("/") || pat.slice(1).includes("/");
  if (pat.startsWith("/")) pat = pat.slice(1);

  // Split into segments and translate.
  const segRe: string[] = [];
  for (const seg of pat.split("/")) {
    segRe.push(translateSegment(seg));
  }
  let body = segRe.join("/");
  if (!anchored) body = `(?:^.*/)?${body}`;
  if (!dirOnly) body += "(?:/.*)?$";
  else body += "(?:/|$)";

  let regex: RegExp;
  try {
    regex = new RegExp(`^${body}`);
  } catch {
    return null;
  }
  return { regex, negated, dirOnly, anchored };
}

function translateSegment(seg: string): string {
  if (seg === "**") return "(?:[^/]+/)*[^/]+";
  let out = "";
  for (let i = 0; i < seg.length; i++) {
    const ch = seg[i];
    if (ch === "*") out += "[^/]*";
    else if (ch === "?") out += "[^/]";
    else out += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return out;
}

/** Parse raw .gitignore lines into ordered rules (later rules win). */
export function parseGitignore(lines: string[]): CompiledRule[] {
  const rules: CompiledRule[] = [];
  for (const line of lines) {
    const trimmed = line.replace(/\r$/, "");
    if (!trimmed.trim() || trimmed.trim().startsWith("#")) continue;
    const rule = compileGlobRule(trimmed);
    if (rule) rules.push(rule);
  }
  return rules;
}

/** Evaluate compiled ignore rules with gitignore last-match-wins semantics. */
export function evaluateIgnoreRules(rules: CompiledRule[], relPath: string): boolean {
  const parts = relPath.split("/");
  // A path is ignored if the full path OR any ancestor directory ends up
  // ignored after applying all rules in order (later matches override
  // earlier ones). Once an ancestor directory is ignored, everything under
  // it is ignored — gitignore does not re-include children of excluded dirs.
  for (let depth = 1; depth <= parts.length; depth++) {
    const prefix = parts.slice(0, depth).join("/");
    const isFinalSegment = depth === parts.length;
    let ignored = false;
    for (const rule of rules) {
      if (rule.dirOnly && isFinalSegment) continue;
      if (rule.regex.test(prefix)) ignored = !rule.negated;
    }
    if (ignored) return true;
  }
  return false;
}

// ── The firewall ─────────────────────────────────────────────────────

export class PrivacyFirewall {
  private readonly gitRules: CompiledRule[];
  private readonly customRules: CompiledRule[];
  private readonly respectGitignore: boolean;

  constructor(opts: FirewallOptions = {}) {
    this.respectGitignore = opts.respectGitignore !== false;
    this.gitRules = opts.gitignoreLines ? parseGitignore(opts.gitignoreLines) : [];
    // Custom globs are block-only: any match means "never read this file".
    this.customRules = (opts.customGlobs ?? [])
      .map((g) => compileGlobRule(g.startsWith("!") ? g.slice(1) : g))
      .filter((r): r is CompiledRule => r !== null);
  }

  /**
   * Classify a workspace-relative path. Blocked ("sensitive") files must
   * NEVER be opened/read/logged by calling code under any circumstance.
   */
  classify(relPathRaw: string): Classification {
    const relPath = normalizeRelPath(relPathRaw);
    if (!relPath) return { kind: "sensitive", reason: "path outside workspace" };

    const base = basename(relPath);
    const baseLower = base.toLowerCase();

    // Explicit allow exception FIRST (e.g. .env.example for structural use).
    if (ALLOWED_EXCEPTIONS.has(baseLower)) {
      // still subject to gitignore/custom rules below
    } else {
      // Exact names
      if (BLOCKED_FILE_NAMES.has(baseLower)) {
        return { kind: "sensitive", reason: "protected system/credential file" };
      }
      // .env.* family except .env.example
      if (baseLower.startsWith(".env")) {
        return { kind: "sensitive", reason: "environment/secret file" };
      }
      // Key material extensions
      const dotIdx = baseLower.lastIndexOf(".");
      const ext = dotIdx >= 0 ? baseLower.slice(dotIdx) : "";
      if (BLOCKED_KEY_EXTENSIONS.has(ext)) {
        return { kind: "sensitive", reason: "key/certificate material" };
      }
      if (baseLower.endsWith(".tfvars")) {
        return { kind: "sensitive", reason: "terraform variables may contain secrets" };
      }
      if (
        baseLower.startsWith("id_rsa") ||
        baseLower.startsWith("id_ed25519") ||
        baseLower.startsWith("id_ecdsa") ||
        baseLower.startsWith("id_dsa")
      ) {
        return { kind: "sensitive", reason: "SSH private key" };
      }
      // Substring patterns
      const named = namePatternBlock(baseLower);
      if (named) return { kind: "sensitive", reason: named };
      // Directory segments
      for (const seg of relPath.split("/").slice(0, -1)) {
        if (BLOCKED_DIR_SEGMENTS.has(seg.toLowerCase())) {
          return { kind: "sensitive", reason: `protected directory (${seg}/)` };
        }
      }
    }

    // User-configured extra globs block BEFORE allow decisions.
    for (const rule of this.customRules) {
      if (rule.regex.test(relPath) || rule.regex.test(base)) {
        return { kind: "ignored", source: "custom-glob" };
      }
    }

    // Respect .gitignore by default where practical.
    if (this.respectGitignore && this.gitRules.length > 0) {
      if (evaluateIgnoreRules(this.gitRules, relPath)) {
        return { kind: "ignored", source: "gitignore" };
      }
    }

    // Lock files: detectable but never includable.
    if (LOCK_FILES.has(baseLower)) return { kind: "skipped", reason: "lockfile" };

    // Minified / sourcemaps
    if (/\.min\.[cm]?js$/.test(baseLower) || /\.min\.css$/.test(baseLower)) {
      return { kind: "skipped", reason: "minified" };
    }
    if (baseLower.endsWith(".map")) return { kind: "skipped", reason: "sourcemap" };

    // Binaries/assets
    const dotIdx = baseLower.lastIndexOf(".");
    const ext = dotIdx >= 0 ? baseLower.slice(dotIdx) : "";
    if (ext && BINARY_EXTENSIONS.has(ext)) return { kind: "skipped", reason: "binary" };

    return { kind: "allowed" };
  }

  /** Convenience predicate for call sites that simply must not proceed. */
  isReadable(relPath: string): boolean {
    const c = this.classify(relPath);
    return c.kind === "allowed";
  }

  /** Human-safe explanation used when a user-selected file is blocked. */
  static readonly USER_BLOCKED_MESSAGE =
    "This file is protected by Zeus privacy rules and was not included.";
}

// ── Limit math (pure) ─────────────────────────────────────────────────

export interface AllowedFile {
  relPath: string;
  bytes: number;
}

export interface LimitedManifest {
  included: AllowedFile[];
  skippedTooLarge: number;
  truncatedByFileCount: boolean;
  truncatedByTotalSize: boolean;
  totalIncludedBytes: number;
  estimatedTokens: number;
}

/** Apply scan limits to a prioritized list of allowed files (pure). */
export function applyLimits(entries: AllowedFile[], limits: ScanLimits): LimitedManifest {
  const included: AllowedFile[] = [];
  let skippedTooLarge = 0;
  let total = 0;
  let stoppedForFiles = false;
  let stoppedForBytes = false;

  for (const e of entries) {
    if (e.bytes > limits.maxFileBytes) {
      skippedTooLarge++;
      continue;
    }
    if (included.length >= limits.maxFiles) {
      stoppedForFiles = true;
      break;
    }
    if (total + e.bytes > limits.maxTotalBytes) {
      stoppedForBytes = true;
      break;
    }
    included.push(e);
    total += e.bytes;
  }

  return {
    included,
    skippedTooLarge,
    truncatedByFileCount: stoppedForFiles || entries.length - skippedTooLarge > limits.maxFiles,
    truncatedByTotalSize: stoppedForBytes,
    totalIncludedBytes: total,
    estimatedTokens: Math.ceil(total / 4),
  };
}

export function estimateTokens(bytes: number): number {
  return Math.ceil(bytes / 4);
}
