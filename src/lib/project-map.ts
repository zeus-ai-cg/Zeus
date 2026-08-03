// Pure, dependency-free static analysis used to build the Visual Project
// Map (Phase 5). Regex/heuristic-based on purpose — a real language-aware
// parser per supported framework is out of scope for this phase, but this
// gives genuinely useful categorization, an import graph, detected external
// services, and referenced env var *names* (never values).

export type MapCategory = "frontend" | "backend" | "database" | "api" | "auth" | "config" | "other";

export type ProjectMapNode = {
  id: string; // file path, doubles as node id
  label: string; // basename
  category: MapCategory;
  description: string;
  size: number;
};

export type ProjectMapEdge = { from: string; to: string };

export type ProjectMap = {
  nodes: ProjectMapNode[];
  edges: ProjectMapEdge[];
  externalServices: string[];
  envVars: string[];
  generatedAt: string;
};

const CONFIG_BASENAME =
  /^(\.env(\..+)?|tsconfig.*\.json|package\.json|tailwind\.config\.(js|ts)|vite\.config\.(js|ts)|next\.config\.(js|ts|mjs)|webpack\.config\.js|\.eslintrc.*|babel\.config\.js)$/i;
const CONFIG_PATH = /\/(config|configs)\//i;

const DB_CONTENT =
  /supabase\s*\.\s*from\(|CREATE\s+TABLE|mongoose\.Schema|prisma\.\w+\.(find|create|update)|models\.Model|sequelize\.define|DATABASE_URL/i;
const DB_PATH = /\/(migrations|models|schema)\//i;

const AUTH_HINT = /\bauth\b|\blogin\b|\bsignin\b|\bsignup\b|\bsession\b|\bjwt\b|passport/i;

const API_CONTENT =
  /app\.(get|post|put|delete|patch)\(|router\.(get|post|put|delete|patch)\(|@app\.route|@router\.(get|post)|createFileRoute\(["']\/api/i;
const API_PATH = /\/api\/|\/routes\//i;

const FRONTEND_EXT = /\.(tsx|jsx|vue|svelte)$/i;
const FRONTEND_PATH = /\/(components|pages|views)\//i;

const BACKEND_EXT = /\.(py|go|rb|java|cs|php|rs)$/i;

const SERVICE_KEYWORDS: [RegExp, string][] = [
  [/stripe/i, "Stripe"],
  [/paddle/i, "Paddle"],
  [/lemonsqueezy|lemon-squeezy|lemon squeezy/i, "Lemon Squeezy"],
  [/supabase/i, "Supabase"],
  [/firebase/i, "Firebase"],
  [/twilio/i, "Twilio"],
  [/sendgrid/i, "SendGrid"],
  [/openai/i, "OpenAI"],
  [/@?anthropic/i, "Anthropic"],
  [/googleapis|google-cloud/i, "Google Cloud"],
  [/aws-sdk|@aws-sdk/i, "AWS"],
  [/redis/i, "Redis"],
  [/mongodb|mongoose/i, "MongoDB"],
  [/postgres|pg\b/i, "PostgreSQL"],
  [/algolia/i, "Algolia"],
  [/cloudinary/i, "Cloudinary"],
  [/vercel/i, "Vercel"],
];

function categorize(path: string, content: string): { category: MapCategory; description: string } {
  const basename = path.split("/").pop() ?? path;

  if (CONFIG_BASENAME.test(basename) || CONFIG_PATH.test(path)) {
    return { category: "config", description: "Configuration file" };
  }
  if (DB_PATH.test(path) || DB_CONTENT.test(content)) {
    return { category: "database", description: "Database model, schema, or migration" };
  }
  if (AUTH_HINT.test(path) || AUTH_HINT.test(content.slice(0, 2000))) {
    return { category: "auth", description: "Authentication-related file" };
  }
  if (API_PATH.test(path) || API_CONTENT.test(content)) {
    return { category: "api", description: "API route / endpoint handler" };
  }
  if (FRONTEND_EXT.test(path) || FRONTEND_PATH.test(path)) {
    return { category: "frontend", description: "Frontend component or page" };
  }
  if (BACKEND_EXT.test(path)) {
    return { category: "backend", description: "Backend module" };
  }
  return { category: "other", description: "Project file" };
}

function resolveImport(fromPath: string, importPath: string, allPaths: Set<string>): string | null {
  if (!importPath.startsWith(".")) return null;
  const fromDir = fromPath.split("/").slice(0, -1);
  const parts = [...fromDir];
  for (const seg of importPath.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  const base = parts.join("/");
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
  ];
  for (const c of candidates) if (allPaths.has(c)) return c;
  return null;
}

const IMPORT_RE = /(?:import\s+(?:[\w*{}\s,]+\s+from\s+)?|require\()\s*["']([^"']+)["']/g;
const ENV_RE = /(?:process\.env\.|import\.meta\.env\.)([A-Z_][A-Z0-9_]*)/g;

export function buildProjectMap(
  files: { path: string; content: string; size: number }[],
): ProjectMap {
  const allPaths = new Set(files.map((f) => f.path));
  const nodes: ProjectMapNode[] = [];
  const edges: ProjectMapEdge[] = [];
  const services = new Set<string>();
  const envVars = new Set<string>();

  for (const file of files) {
    const { category, description } = categorize(file.path, file.content);
    nodes.push({
      id: file.path,
      label: file.path.split("/").pop() ?? file.path,
      category,
      description,
      size: file.size,
    });

    for (const [pattern, label] of SERVICE_KEYWORDS) {
      if (pattern.test(file.content) || pattern.test(file.path)) services.add(label);
    }

    let m: RegExpExecArray | null;
    ENV_RE.lastIndex = 0;
    while ((m = ENV_RE.exec(file.content))) envVars.add(m[1]);

    if (/\.(ts|tsx|js|jsx)$/i.test(file.path)) {
      IMPORT_RE.lastIndex = 0;
      while ((m = IMPORT_RE.exec(file.content))) {
        const resolved = resolveImport(file.path, m[1], allPaths);
        if (resolved && resolved !== file.path) edges.push({ from: file.path, to: resolved });
      }
    }
  }

  return {
    nodes,
    edges,
    externalServices: [...services].sort(),
    envVars: [...envVars].sort(),
    generatedAt: new Date().toISOString(),
  };
}
