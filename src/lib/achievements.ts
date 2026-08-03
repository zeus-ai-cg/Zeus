import { isProOrAbove } from "./plans";

// Feature 8 — Learning Modes go Pro-only, except the "beginner" default
// (profiles.learning_mode DEFAULTs to it, so every free/new user already
// starts here — locking it too would leave free users with no usable
// mode at all, not "limited daily usage" like the rest of the free tier).
export const LEARNING_MODES = [
  {
    value: "eli10",
    label: "Explain Like I'm 10",
    systemHint:
      "Explain everything in extremely simple terms, as if to a curious 10-year-old. Use analogies, short sentences, and avoid jargon.",
    tier: "pro",
  },
  {
    value: "beginner",
    label: "Beginner Mode",
    systemHint:
      "Assume the user is a complete beginner. Define every term, go slowly, give tiny examples, and finish with a small practice exercise.",
    tier: "free",
  },
  {
    value: "intermediate",
    label: "Intermediate Mode",
    systemHint: "Assume the user knows basics. Focus on idioms, gotchas, and real-world patterns.",
    tier: "pro",
  },
  {
    value: "advanced",
    label: "Advanced Engineer Mode",
    systemHint:
      "Assume senior-level knowledge. Discuss tradeoffs, complexity, performance, and architecture. Be concise and precise.",
    tier: "pro",
  },
  {
    value: "interview",
    label: "Interview Mode",
    systemHint:
      "Behave like a coding interviewer. Ask clarifying questions, push for optimal complexity, walk through DSA/system-design reasoning step by step.",
    tier: "pro",
  },
  {
    value: "debug",
    label: "Debugging Mode",
    systemHint:
      "Treat input as buggy code or an error. Identify root cause, explain WHY, then provide a corrected version and prevention tips.",
    tier: "pro",
  },
  {
    value: "project",
    label: "Project Mentor Mode",
    systemHint:
      "Act as a senior project mentor. Help with planning, architecture, tech-stack choices, milestones, and code reviews.",
    tier: "pro",
  },
] as const;

export type LearningMode = (typeof LEARNING_MODES)[number]["value"];
export const FREE_LEARNING_MODES: LearningMode[] = LEARNING_MODES.filter(
  (m) => m.tier === "free",
).map((m) => m.value);
export function isLearningModeLocked(mode: string, plan: string | null | undefined): boolean {
  const found = LEARNING_MODES.find((m) => m.value === mode);
  if (!found || found.tier === "free") return false;
  return !isProOrAbove(plan);
}

export const FREE_QUESTION_LIMIT = 15;
export const FREE_RESET_HOURS = 24;

// ── Zeus AI Pro — Fair Usage Policy ─────────────────────────────────
// Pro is "very high limits, not literally unlimited" — this protects the
// service from bots/scripts hammering the Gemini API under one account.
// All three constants are the single source of truth: change a number here
// and both the server-side gate (src/routes/api/chat.ts) and every UI
// surface (ChatWindow, sidebar, dashboard) pick it up automatically.
export const PRO_MONTHLY_REQUEST_LIMIT = 5000;
export const PRO_SOFT_WARNING_THRESHOLD = 4500;
export const PRO_RESET_DAYS = 30;
