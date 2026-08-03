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

// --- Build-intent detection -------------------------------------------------
// Deliberately conservative: only phrases that read as "build me a whole
// project" should switch the user into Engineer Mode. Ordinary chat like
// "make this function faster" or "create a helper for X" must NOT trigger
// it — see ENGINEER_INTENT_NEGATIVE below.

const ENGINEER_INTENT_VERBS = /^(build|create|develop|clone|generate)\b/i;
const MAKE_VERB = /^make\b/i;
const APP_NOUNS =
  /\b(app|application|website|web ?site|clone|saas|platform|dashboard|crm|discord bot|bot|api|backend|landing page|portfolio|blog|e-?commerce|store|game|mobile app|chrome extension|extension|plugin|admin panel|mvp)\b/i;
const TOO_SHORT_OR_META =
  /^(build|create|make|develop|generate|clone)\s*(it|this|that)?\s*[.?!]*$/i;

export function detectEngineerIntent(raw: string): boolean {
  const text = raw.trim();
  if (text.length < 8 || text.length > 2000) return false;
  if (TOO_SHORT_OR_META.test(text)) return false;
  if (ENGINEER_INTENT_VERBS.test(text)) return true;
  if (MAKE_VERB.test(text) && APP_NOUNS.test(text)) return true;
  return false;
}
