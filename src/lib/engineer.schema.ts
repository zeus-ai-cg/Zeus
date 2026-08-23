// Zeus AI — Project Engineer Mode (Feature 1)
//
// Shared zod schema + live-pipeline step definitions used by both the
// streaming server route (src/routes/api/engineer.ts) and the client
// panel (src/components/EngineerModePanel.tsx). Kept in its own file
// (no server-only imports) so it's safe to import from client code.

import { z } from "zod";

export const MAX_ENGINEER_FILES = 60;

export const engineerFileSchema = z.object({
  path: z.string().min(1).max(300).describe("Relative file path, e.g. src/components/App.tsx"),
  content: z.string().describe("Complete file contents. Never truncated, never a placeholder."),
});

export const engineerProjectSchema = z.object({
  projectName: z.string().describe("Short, human-readable project name."),
  description: z.string().describe("1-3 sentence description of what this project does."),
  framework: z
    .string()
    .describe(
      "Primary framework/stack label, e.g. 'Next.js + Tailwind' or 'FastAPI + PostgreSQL'.",
    ),
  stack: z.array(z.string()).max(12).describe("Key technologies used, as short tags."),
  architecture: z
    .string()
    .describe("A few paragraphs explaining the chosen architecture and why it fits the request."),
  databaseSchema: z
    .string()
    .optional()
    .describe(
      "Database schema (SQL DDL or equivalent) if the project needs persistence. Omit if not applicable.",
    ),
  files: z
    .array(engineerFileSchema)
    .max(MAX_ENGINEER_FILES)
    .describe("Every source file the project needs, complete and runnable together."),
  envVars: z
    .array(z.object({ key: z.string(), description: z.string() }))
    .max(20)
    .optional()
    .describe("Required environment variables, if any."),
  installGuide: z.string().describe("Step-by-step local setup/installation instructions."),
  deploymentGuide: z.string().describe("How to deploy this project to production."),
  testingGuide: z.string().describe("How to test this project — commands and what to check."),
  productionChecklist: z
    .array(z.string())
    .max(15)
    .describe("Concrete items to verify before calling this production-ready."),
  apiDocs: z
    .string()
    .optional()
    .describe("API endpoint documentation, if this project exposes an API. Omit otherwise."),
  devNotes: z
    .string()
    .describe(
      "Short closing engineering notes: tradeoffs made, known limitations, suggested next features.",
    ),
  readme: z.string().describe("A complete README.md body for the project (markdown)."),
});

export type EngineerProject = z.infer<typeof engineerProjectSchema>;
// Partial/in-progress shape streamed while generation is underway — every
// field and array element may be partially populated or absent.
export type PartialEngineerProject = Partial<{
  [K in keyof EngineerProject]: EngineerProject[K] extends Array<infer U>
    ? Array<Partial<U> | undefined> | undefined
    : Partial<EngineerProject[K]> | EngineerProject[K] | undefined;
}>;

export type EngineerStep = {
  key: string;
  label: string;
  check: (o: PartialEngineerProject | undefined) => boolean;
};

// Order mirrors the schema's field order above, which is also the order a
// model tends to fill in a structured object — so this reads as genuine
// live progress, not a canned animation.
export const ENGINEER_STEPS: EngineerStep[] = [
  {
    key: "requirements",
    label: "Understanding Requirements",
    check: (o) => !!o?.projectName && !!o?.description,
  },
  {
    key: "stack",
    label: "Choosing Stack",
    check: (o) => !!o?.framework && !!(o?.stack && o.stack.length > 0),
  },
  {
    key: "architecture",
    label: "Planning Architecture",
    check: (o) => !!o?.architecture && (o.architecture as string).length > 40,
  },
  {
    key: "database",
    label: "Designing Database",
    // databaseSchema is optional (the model omits it for projects that don't
    // need persistence), so this step must not block on it exclusively —
    // otherwise progress can never reach 100% for such projects. Falls back
    // to "generation has moved past this point" the same way the "env" step
    // below does for its own optional field (envVars).
    check: (o) => !!o?.databaseSchema || !!(o?.files && o.files.length >= 1),
  },
  {
    key: "backend",
    label: "Generating Backend & Frontend",
    check: (o) => !!(o?.files && o.files.length >= 1),
  },
  {
    key: "components",
    label: "Building Components",
    check: (o) => !!(o?.files && o.files.length >= 4),
  },
  {
    key: "env",
    label: "Configuring Environment",
    check: (o) => !!o?.envVars || !!(o?.files && o.files.length >= 4),
  },
  { key: "testing", label: "Writing Tests & Testing Guide", check: (o) => !!o?.testingGuide },
  { key: "deployment", label: "Preparing Deployment Guide", check: (o) => !!o?.deploymentGuide },
  {
    key: "checklist",
    label: "Production Checklist",
    check: (o) => !!(o?.productionChecklist && o.productionChecklist.length > 0),
  },
  { key: "docs", label: "Writing Documentation", check: (o) => !!o?.readme && !!o?.installGuide },
  { key: "ready", label: "Packaging Project", check: (o) => !!o?.devNotes },
];

export function computeEngineerProgress(o: PartialEngineerProject | undefined): {
  completedSteps: number;
  totalSteps: number;
  percent: number;
  currentStepLabel: string;
} {
  const completed = ENGINEER_STEPS.filter((s) => s.check(o));
  const totalSteps = ENGINEER_STEPS.length;
  const completedSteps = completed.length;
  const current = ENGINEER_STEPS[Math.min(completedSteps, totalSteps - 1)];
  return {
    completedSteps,
    totalSteps,
    percent: Math.round((completedSteps / totalSteps) * 100),
    currentStepLabel: completedSteps >= totalSteps ? "Ready" : current.label,
  };
}

// --- Build-intent detection (Claude-style, deliberately conservative) -------
// Engineer Mode should open ONLY when the message reads as "build me an
// entire project from scratch" — e.g. "Act as a senior full-stack engineer,
// create a SaaS dashboard". Ordinary coding chat ("create a helper function",
// "how do I create a component?", "add login to my app") must stay in normal
// chat mode, where Zeus answers conversationally instead of scaffolding a
// whole project.

/** Any verb that expresses producing something. */
const BUILD_VERB =
  /\b(build|create|make|develop|design|generate|clone|code|program)\b/i;

/** Nouns that imply a WHOLE product/project, not a snippet inside one. */
const PROJECT_NOUNS =
  /\b(app|application|web ?app|website|web ?site|saas|platform|dashboard|crm|erp|admin panel|mvp|startup product|social network|marketplace|landing page|portfolio website|blog website|e-?commerce site|online store|game|mobile app|android app|ios app|discord bot|telegram bot|slack bot|twitter bot|chrome extension|vs ?code extension|browser extension|wordpress plugin|full[ -]?stack (app|project|site)|rest api|graphql api|backend api)\b/i;

/** Phrases that make "build from scratch" explicit even without a noun above. */
const SCRATCH_SIGNALS =
  /\b(from scratch|full[ -]?stack|end[ -]to[ -]end|complete (project|app|application|website|product)|whole (project|app|application)|entire (project|app|application)|new (project|product))\b/i;

/** Persona framing like "Act as a senior full-stack engineer ..." + a build ask. */
const ENGINEER_PERSONA =
  /\b(act as|you are|acting as|work as|behave as)\b[^.!?\n]{0,60}\b(senior |lead |staff )?(full[ -]?stack |software |web |backend|frontend)?\s?(engineer|developer|architect)/i;

/** Small-scope artifacts — these belong in normal chat, never scaffold a project. */
const SMALL_SCOPE =
  /\b(function|method|helper|util(s|ity|ities)?|snippet|regex|query|command|script|component|hook|middleware|route|endpoint|module|class|interface|type|variable|constant|config|schema|migration|seed|test case|unit test|integration test|fixture|mock|css|animation|svg|icon|logo|readme|commit message)\b/i;

/** Questions and explanations — even ones containing build words — stay in chat. */
const QUESTION_OR_EXPLAIN =
  /^(how|what|why|when|where|which|who|can you|could you explain|explain|describe|tell me|show me how|teach me|help me understand|i want to know|i need to know|kya|kaise|is there|are there|do you know|whats|what's|how's|hows)\b/i;

/** Work on EXISTING code/projects — modifications, not greenfield builds. */
const MODIFY_EXISTING =
  /\b(fix|debug|refactor|optimize|improve|update|modify|change|edit|extend|enhance|migrate|convert|port|rewrite|clean ?up|add(ed|ing)? (a |an |the )?)?\b(this|my|the|our|existing|current) (project|repo|repository|codebase|code|app|application|website|file|folder)\b|\b(add|integrate|connect|implement|attach)\b.{0,40}\b(to|in|into|with)\b.{0,20}\b(my|the|this|existing|current)\b/i;

const TOO_SHORT_OR_META =
  /^(build|create|make|develop|generate|clone)\s*(it|this|that|one|me)?\s*(a |an |the )?(it|this|that)?\s*[.?!]*$/i;

export function detectEngineerIntent(raw: string): boolean {
  const text = raw.trim();
  if (text.length < 8 || text.length > 2000) return false;
  if (TOO_SHORT_OR_META.test(text)) return false;
  if (!BUILD_VERB.test(text)) return false;
  if (QUESTION_OR_EXPLAIN.test(text)) return false;
  if (SMALL_SCOPE.test(text)) return false;
  if (MODIFY_EXISTING.test(text)) return false;

  // Explicit greenfield signals win immediately.
  if (SCRATCH_SIGNALS.test(text)) return true;
  if (ENGINEER_PERSONA.test(text)) return true;

  // Otherwise require BOTH a build verb AND a project-scale noun.
  return PROJECT_NOUNS.test(text);
}
