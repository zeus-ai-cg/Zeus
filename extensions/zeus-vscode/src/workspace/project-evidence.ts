/**
 * Evidence-based project intelligence — pure module, unit-tested.
 *
 * Extracts ONLY what the provided safe files actually show. Missing evidence
 * is reported as "unknown" — Zeus must never fabricate project facts.
 */

import { LOCK_FILES } from "../privacy/firewall";

export interface ProjectEvidence {
  workspaceName: string;
  languages: Array<{ lang: string; files: number }>;
  packageManager: string | null;
  frameworks: string[];
  entryPoints: string[];
  keyConfigFiles: string[];
  testFramework: string | null;
  scripts: Array<{ name: string; command: string }>;
  lintCommand: string | null;
  buildCommand: string | null;
  testCommand: string | null;
  dependenciesNotable: string[];
  evidenceFiles: string[];
  unknowns: string[];
}

const LANG_BY_EXT: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript/React", ".mts": "TypeScript",
  ".js": "JavaScript", ".jsx": "JavaScript/React", ".mjs": "JavaScript", ".cjs": "JavaScript",
  ".py": "Python", ".rb": "Ruby", ".go": "Go", ".rs": "Rust", ".java": "Java",
  ".kt": "Kotlin", ".swift": "Swift", ".php": "PHP", ".cs": "C#", ".cpp": "C++",
  ".cc": "C++", ".c": "C", ".h": "C/C++ header", ".hpp": "C++ header",
  ".dart": "Dart", ".vue": "Vue", ".svelte": "Svelte", ".sql": "SQL",
  ".sh": "Shell", ".bash": "Shell", ".ps1": "PowerShell", ".lua": "Lua",
  ".html": "HTML", ".css": "CSS", ".scss": "SCSS", ".less": "Less",
};

interface FrameworkHint {
  dep: string | RegExp;
  name: string;
}

const FRAMEWORK_HINTS: FrameworkHint[] = [
  { dep: "next", name: "Next.js" },
  { dep: "react", name: "React" },
  { dep: "react-native", name: "React Native" },
  { dep: "vue", name: "Vue" },
  { dep: "@nuxt/", name: "Nuxt" },
  { dep: "svelte", name: "Svelte" },
  { dep: "@angular/core", name: "Angular" },
  { dep: "astro", name: "Astro" },
  { dep: "solid-js", name: "SolidJS" },
  { dep: "express", name: "Express" },
  { dep: "fastify", name: "Fastify" },
  { dep: "@nestjs/core", name: "NestJS" },
  { dep: "hono", name: "Hono" },
  { dep: "tailwindcss", name: "Tailwind CSS" },
  { dep: "electron", name: "Electron" },
  { dep: "@tauri-apps/api", name: "Tauri" },
  { dep: "expo", name: "Expo" },
  { dep: "django", name: "Django" },
  { dep: /^@?remix/, name: "Remix" },
];

const TEST_FRAMEWORKS: FrameworkHint[] = [
  { dep: "vitest", name: "Vitest" },
  { dep: "jest", name: "Jest" },
  { dep: "mocha", name: "Mocha" },
  { dep: "@playwright/test", name: "Playwright" },
  { dep: "cypress", name: "Cypress" },
  { dep: "pytest", name: "pytest" },
];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Build the full evidence model from already-classified-safe file contents. */
export function buildProjectEvidence(
  workspaceName: string,
  manifestPaths: string[],
  fileContents: Map<string, string>,
): ProjectEvidence {
  const ev: ProjectEvidence = {
    workspaceName,
    languages: [],
    packageManager: null,
    frameworks: [],
    entryPoints: [],
    keyConfigFiles: [],
    testFramework: null,
    scripts: [],
    lintCommand: null,
    buildCommand: null,
    testCommand: null,
    dependenciesNotable: [],
    evidenceFiles: [...fileContents.keys()].sort(),
    unknowns: [],
  };

  // Language histogram from the allowed manifest paths.
  const counts = new Map<string, number>();
  for (const p of manifestPaths) {
    const dot = p.lastIndexOf(".");
    if (dot < 0) continue;
    const ext = p.slice(dot).toLowerCase();
    const lang = LANG_BY_EXT[ext];
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  ev.languages = [...counts.entries()]
    .map(([lang, files]) => ({ lang, files }))
    .sort((x, y) => y.files - x.files)
    .slice(0, 8);

  // Package manager from lock-file EXISTENCE in the manifest.
  for (const p of manifestPaths) {
    const base = p.split("/").pop()!.toLowerCase();
    if (!LOCK_FILES.has(base)) continue;
    if (base === "package-lock.json") ev.packageManager = ev.packageManager ?? "npm";
    else if (base === "yarn.lock") ev.packageManager = ev.packageManager ?? "yarn";
    else if (base === "pnpm-lock.yaml") ev.packageManager = ev.packageManager ?? "pnpm";
    else if (base === "bun.lockb") ev.packageManager = ev.packageManager ?? "bun";
  }

  // package.json facts
  const pkgRaw = fileContents.get("package.json");
  let deps: Record<string, string> = {};
  let devDeps: Record<string, string> = {};
  if (pkgRaw !== undefined) {
    try {
      const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
      if (isObject(pkg.dependencies)) deps = pkg.dependencies as Record<string, string>;
      if (isObject(pkg.devDependencies)) devDeps = pkg.devDependencies as Record<string, string>;
      if (typeof pkg.main === "string") ev.entryPoints.push(pkg.main);
      if (typeof pkg.module === "string") ev.entryPoints.push(pkg.module);
      if (isObject(pkg.bin)) {
        for (const v of Object.values(pkg.bin)) {
          if (typeof v === "string") ev.entryPoints.push(v);
        }
      }
      if (isObject(pkg.scripts)) {
        for (const [name, cmd] of Object.entries(pkg.scripts)) {
          if (typeof cmd !== "string") continue;
          ev.scripts.push({ name, command: cmd });
          if (name === "lint") ev.lintCommand = `npm run ${name}`;
          if (name === "build") ev.buildCommand = `npm run ${name}`;
          if (name === "test") ev.testCommand = `npm run ${name}`;
        }
      }
    } catch {
      ev.unknowns.push("package.json was unreadable/malformed");
    }

    // Framework detection from dependency names.
    const allDeps = { ...deps, ...devDeps };
    for (const hint of FRAMEWORK_HINTS) {
      const dep = hint.dep;
      const hit =
        typeof dep === "string"
          ? Object.keys(allDeps).some((d) => d === dep || d.startsWith(dep + "-"))
          : Object.keys(allDeps).some((d) => dep.test(d));
      if (hit && !ev.frameworks.includes(hint.name)) ev.frameworks.push(hint.name);
    }
    for (const tf of TEST_FRAMEWORKS) {
      const tfDep = tf.dep;
      const hit = Object.keys({ ...devDeps }).some((d) =>
        typeof tfDep === "string" ? d === tfDep : tfDep.test(d),
      );
      if (hit) {
        ev.testFramework = ev.testFramework ?? tf.name;
        break;
      }
    }
    // Notable dependencies (cap list).
    ev.dependenciesNotable = Object.keys(deps).slice(0, 20);
  } else {
    ev.unknowns.push("no package.json found at workspace root");
  }

  if (!ev.packageManager && pkgRaw !== undefined) {
    ev.packageManager = "npm (assumed — no lock file present)";
    ev.unknowns.push("no lock file found; package manager assumed npm");
  }

  // Entry-point heuristics from the manifest itself.
  const commonEntries = [
    "src/index.ts", "src/index.tsx", "src/main.ts", "src/main.tsx",
    "index.js", "index.ts", "main.go", "app.py", "manage.py", "main.py",
    "src/App.tsx", "src/App.vue", "cmd/main.go",
  ];
  for (const ce of commonEntries) {
    if (manifestPaths.includes(ce)) ev.entryPoints.push(ce);
  }

  // Key config files that exist in the manifest.
  const configNames = [
    "tsconfig.json", "vite.config.ts", "vite.config.js", "next.config.js",
    "next.config.mjs", "webpack.config.js", "rollup.config.js", "esbuild.js",
    ".eslintrc.json", ".eslintrc.js", "eslint.config.js", "eslint.config.mjs",
    "prettier.config.js", ".prettierrc", "jest.config.js", "vitest.config.ts",
    "playwright.config.ts", "docker-compose.yml", "Dockerfile", "Makefile",
    "requirements.txt", "pyproject.toml", "go.mod", "Cargo.toml", "pubspec.yaml",
  ];
  for (const cn of configNames) {
    if (manifestPaths.some((p) => p === cn || p.endsWith("/" + cn))) ev.keyConfigFiles.push(cn);
  }

  return ev;
}

/**
 * Render the evidence as compact text for AI prompts. Facts only — every
 * line traces back to a real file we read.
 */
export function evidenceToPromptText(ev: ProjectEvidence): string {
  const L: string[] = [];
  L.push(`Workspace: ${ev.workspaceName}`);
  L.push(
    `Languages (by allowed-file count): ${
      ev.languages.length > 0
        ? ev.languages.map((l) => `${l.lang} (${l.files})`).join(", ")
        : "unknown"
    }`,
  );
  L.push(`Package manager: ${ev.packageManager ?? "unknown"}`);
  L.push(`Frameworks/libraries detected: ${ev.frameworks.length > 0 ? ev.frameworks.join(", ") : "none detected"}`);
  L.push(`Entry points: ${ev.entryPoints.length > 0 ? ev.entryPoints.join(", ") : "unknown"}`);
  L.push(`Key configuration files: ${ev.keyConfigFiles.length > 0 ? ev.keyConfigFiles.join(", ") : "none detected"}`);
  L.push(`Test framework: ${ev.testFramework ?? "unknown"}`);
  if (ev.scripts.length > 0) {
    L.push("package.json scripts:");
    for (const s of ev.scripts) L.push(`  - ${s.name}: ${s.command}`);
  }
  L.push(`Lint command: ${ev.lintCommand ?? "not discovered"}`);
  L.push(`Build command: ${ev.buildCommand ?? "not discovered"}`);
  L.push(`Test command: ${ev.testCommand ?? "not discovered"}`);
  L.push(
    `Notable direct dependencies: ${
      ev.dependenciesNotable.length > 0 ? ev.dependenciesNotable.join(", ") : "unknown"
    }`,
  );
  L.push(`Evidence files read: ${ev.evidenceFiles.join(", ") || "none"}`);
  if (ev.unknowns.length > 0) L.push(`Explicit unknowns: ${ev.unknowns.join("; ")}`);
  return L.join("\n");
}
