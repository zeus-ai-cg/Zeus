// Heuristic, dependency-free Project Health Score (Phase 7). Not a real
// static-analysis toolchain (no ESLint/tsc/lighthouse runs — this sandbox
// has no execution environment for arbitrary uploaded projects) — instead,
// signal-based scoring from what's observable in the indexed files
// themselves. Framed to the user as guidance, not a certified audit.

export type HealthCategory =
  | "codeQuality"
  | "security"
  | "performance"
  | "accessibility"
  | "maintainability"
  | "dependencies"
  | "typeSafety"
  | "errorHandling"
  | "testing"
  | "documentation";

export type HealthFinding = {
  category: HealthCategory;
  severity: "info" | "warning" | "critical";
  message: string;
  recommendation: string;
  estimatedDifficulty: "easy" | "medium" | "hard";
};

export type ProjectHealthScore = {
  overall: number;
  categories: Record<HealthCategory, number>;
  findings: HealthFinding[];
  generatedAt: string;
};

const CATEGORY_LABELS: HealthCategory[] = [
  "codeQuality",
  "security",
  "performance",
  "accessibility",
  "maintainability",
  "dependencies",
  "typeSafety",
  "errorHandling",
  "testing",
  "documentation",
];

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function buildHealthScore(
  files: { path: string; content: string; size: number }[],
  dependencies: string[],
): ProjectHealthScore {
  const findings: HealthFinding[] = [];
  const scores: Record<HealthCategory, number> = {
    codeQuality: 80,
    security: 90,
    performance: 85,
    accessibility: 80,
    maintainability: 80,
    dependencies: 85,
    typeSafety: 70,
    errorHandling: 75,
    testing: 60,
    documentation: 60,
  };

  const codeFiles = files.filter((f) => /\.(ts|tsx|js|jsx|py|go|rb|java|cs|php|rs)$/i.test(f.path));
  const allContent = () => codeFiles.map((f) => f.content).join("\n");

  // --- Security -------------------------------------------------------
  const secretPattern = /(api[_-]?key|secret|password|token)\s*[:=]\s*["'][A-Za-z0-9_-]{12,}["']/i;
  const secretHits = codeFiles.filter(
    (f) => secretPattern.test(f.content) && !/\.(test|spec|example)\./i.test(f.path),
  );
  if (secretHits.length > 0) {
    scores.security -= Math.min(40, secretHits.length * 15);
    findings.push({
      category: "security",
      severity: "critical",
      message: `Possible hardcoded secret(s) in ${secretHits.length} file(s): ${secretHits
        .slice(0, 3)
        .map((f) => f.path)
        .join(", ")}`,
      recommendation:
        "Move secrets to environment variables and confirm none of these files were committed with real credentials.",
      estimatedDifficulty: "easy",
    });
  }
  const evalHits = codeFiles.filter((f) => /\beval\(|new Function\(/.test(f.content));
  if (evalHits.length > 0) {
    scores.security -= Math.min(20, evalHits.length * 10);
    findings.push({
      category: "security",
      severity: "warning",
      message: `eval()/Function() usage found in ${evalHits.length} file(s).`,
      recommendation: "Avoid dynamic code execution from untrusted input where possible.",
      estimatedDifficulty: "medium",
    });
  }
  if (files.some((f) => f.path === ".env" || f.path.endsWith("/.env"))) {
    scores.security -= 25;
    findings.push({
      category: "security",
      severity: "critical",
      message: "A .env file appears to be included in the uploaded project.",
      recommendation:
        "Remove .env from version control/uploads and add it to .gitignore — it may contain live secrets.",
      estimatedDifficulty: "easy",
    });
  }

  // --- Type safety ------------------------------------------------------
  const tsFiles = files.filter((f) => /\.tsx?$/i.test(f.path));
  const jsFiles = files.filter((f) => /\.jsx?$/i.test(f.path));
  if (tsFiles.length + jsFiles.length > 0) {
    const tsRatio = tsFiles.length / (tsFiles.length + jsFiles.length);
    scores.typeSafety = clamp(40 + tsRatio * 60);
    const tsconfig = files.find((f) => f.path.endsWith("tsconfig.json"));
    if (tsconfig && !/"strict"\s*:\s*true/.test(tsconfig.content)) {
      scores.typeSafety -= 10;
      findings.push({
        category: "typeSafety",
        severity: "info",
        message: 'tsconfig.json doesn\'t have "strict": true.',
        recommendation: "Enabling strict mode catches a large class of bugs at compile time.",
        estimatedDifficulty: "medium",
      });
    }
    if (jsFiles.length > tsFiles.length && tsFiles.length > 0) {
      findings.push({
        category: "typeSafety",
        severity: "info",
        message: `${jsFiles.length} JavaScript files alongside ${tsFiles.length} TypeScript files.`,
        recommendation:
          "Consider migrating the remaining JS files to TypeScript for consistent type coverage.",
        estimatedDifficulty: "hard",
      });
    }
  }

  // --- Error handling -----------------------------------------------------
  const tryCount = (allContent().match(/\btry\s*{/g) ?? []).length;
  const catchEmptyCount = (allContent().match(/catch\s*\([^)]*\)\s*{\s*}/g) ?? []).length;
  const asyncCount = (allContent().match(/\basync\s+/g) ?? []).length;
  if (asyncCount > 0) {
    const ratio = tryCount / Math.max(asyncCount, 1);
    scores.errorHandling = clamp(40 + ratio * 60);
  }
  if (catchEmptyCount > 0) {
    scores.errorHandling -= Math.min(20, catchEmptyCount * 5);
    findings.push({
      category: "errorHandling",
      severity: "warning",
      message: `${catchEmptyCount} empty catch block(s) found.`,
      recommendation: "Empty catch blocks silently swallow errors — at minimum log them.",
      estimatedDifficulty: "easy",
    });
  }

  // --- Testing --------------------------------------------------------
  const testFiles = files.filter(
    (f) =>
      /\.(test|spec)\.(ts|tsx|js|jsx|py)$/i.test(f.path) || /\/(tests?|__tests__)\//i.test(f.path),
  );
  const testRatio = codeFiles.length > 0 ? testFiles.length / codeFiles.length : 0;
  scores.testing = testFiles.length === 0 ? 20 : clamp(30 + testRatio * 300);
  if (testFiles.length === 0) {
    findings.push({
      category: "testing",
      severity: "warning",
      message: "No test files detected in this project.",
      recommendation:
        "Add at least basic tests for critical logic (auth, payments, data mutations).",
      estimatedDifficulty: "medium",
    });
  }

  // --- Documentation -----------------------------------------------------
  const readme = files.find((f) => /^readme\.md$/i.test(f.path.split("/").pop() ?? ""));
  scores.documentation = readme ? clamp(50 + Math.min(readme.content.length / 40, 50)) : 25;
  if (!readme) {
    findings.push({
      category: "documentation",
      severity: "warning",
      message: "No README.md found.",
      recommendation:
        "Add a README covering setup, environment variables, and how to run the project.",
      estimatedDifficulty: "easy",
    });
  }
  const commentDensity =
    (allContent().match(/\/\/|\/\*|#\s/g) ?? []).length / Math.max(codeFiles.length, 1);
  if (commentDensity < 2 && codeFiles.length > 5) {
    scores.documentation -= 10;
  }

  // --- Accessibility (frontend-ish projects only) -------------------------
  const jsxFiles = files.filter((f) => /\.(tsx|jsx|vue)$/i.test(f.path));
  if (jsxFiles.length > 0) {
    const imgTags =
      jsxFiles
        .map((f) => f.content)
        .join("\n")
        .match(/<img\b[^>]*>/gi) ?? [];
    const imgsWithoutAlt = imgTags.filter((tag) => !/\balt\s*=/.test(tag));
    if (imgsWithoutAlt.length > 0) {
      scores.accessibility -= Math.min(25, imgsWithoutAlt.length * 5);
      findings.push({
        category: "accessibility",
        severity: "warning",
        message: `${imgsWithoutAlt.length} <img> tag(s) without an alt attribute.`,
        recommendation:
          'Add descriptive alt text (or alt="" for decorative images) for screen reader support.',
        estimatedDifficulty: "easy",
      });
    }
    const ariaUsage = (
      jsxFiles
        .map((f) => f.content)
        .join("\n")
        .match(/aria-[a-z]+=/gi) ?? []
    ).length;
    if (ariaUsage === 0 && jsxFiles.length > 5) {
      scores.accessibility -= 10;
      findings.push({
        category: "accessibility",
        severity: "info",
        message: "No ARIA attributes detected across this project's components.",
        recommendation:
          "Review interactive components (menus, modals, tabs) for appropriate ARIA roles/labels.",
        estimatedDifficulty: "medium",
      });
    }
  } else {
    scores.accessibility = 70; // not really applicable — neutral score, no findings
  }

  // --- Dependencies -------------------------------------------------------
  const hasLockfile = files.some((f) =>
    /package-lock\.json$|yarn\.lock$|pnpm-lock\.yaml$/.test(f.path),
  );
  if (dependencies.length > 0 && !hasLockfile) {
    scores.dependencies -= 15;
    findings.push({
      category: "dependencies",
      severity: "info",
      message: "No lockfile detected (it may have been filtered out during upload/indexing).",
      recommendation:
        "Commit a lockfile (package-lock.json / yarn.lock / pnpm-lock.yaml) for reproducible installs.",
      estimatedDifficulty: "easy",
    });
  }
  if (dependencies.length > 120) {
    scores.dependencies -= 10;
    findings.push({
      category: "dependencies",
      severity: "info",
      message: `${dependencies.length} dependencies detected — unusually large.`,
      recommendation:
        "Audit for unused packages; a smaller dependency tree is easier to secure and maintain.",
      estimatedDifficulty: "medium",
    });
  }

  // --- Performance (heuristic) ---------------------------------------
  const largeFiles = files.filter((f) => f.size > 100_000);
  if (largeFiles.length > 0) {
    scores.performance -= Math.min(15, largeFiles.length * 5);
    findings.push({
      category: "performance",
      severity: "info",
      message: `${largeFiles.length} unusually large source file(s) (>100KB).`,
      recommendation:
        "Large files are harder to bundle-split and review — consider breaking them up.",
      estimatedDifficulty: "medium",
    });
  }

  // --- Code quality / maintainability (very rough) ----------------------
  const longFiles = codeFiles.filter((f) => f.content.split("\n").length > 500);
  if (longFiles.length > 0) {
    scores.maintainability -= Math.min(20, longFiles.length * 4);
    findings.push({
      category: "maintainability",
      severity: "info",
      message: `${longFiles.length} file(s) over 500 lines.`,
      recommendation:
        "Large files tend to accumulate unrelated responsibilities — consider splitting them.",
      estimatedDifficulty: "hard",
    });
  }
  const todoCount = (allContent().match(/\bTODO\b|\bFIXME\b/g) ?? []).length;
  if (todoCount > 10) {
    scores.codeQuality -= Math.min(10, Math.floor(todoCount / 10) * 2);
    findings.push({
      category: "codeQuality",
      severity: "info",
      message: `${todoCount} TODO/FIXME markers found.`,
      recommendation: "Triage outstanding TODOs — resolve, ticket, or remove stale ones.",
      estimatedDifficulty: "medium",
    });
  }

  for (const cat of CATEGORY_LABELS) scores[cat] = clamp(scores[cat]);

  const overall = clamp(
    CATEGORY_LABELS.reduce((sum, c) => sum + scores[c], 0) / CATEGORY_LABELS.length,
  );

  const severityRank = { critical: 0, warning: 1, info: 2 };
  findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return { overall, categories: scores, findings, generatedAt: new Date().toISOString() };
}
