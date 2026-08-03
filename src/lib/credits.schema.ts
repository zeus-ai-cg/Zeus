// Zeus AI — Zeus Credits (Feature 6).
//
// A transparent, per-action credit cost model layered on top of the
// existing free/Pro question quota — it does NOT replace or gate on it.
// See supabase/migrations/20260728100000_credit_ledger.sql for why.
// Safe to import from client or server code (no side effects).

export type CreditAction = "chat_message" | "chat_debug" | "feature_generate" | "engineer_project";

export const CREDIT_ACTION_LABELS: Record<CreditAction, string> = {
  chat_message: "Question",
  chat_debug: "Debug Code",
  feature_generate: "Generate Component",
  engineer_project: "Generate Full Project",
};

// Flat costs for the small, predictable actions.
export const FLAT_CREDIT_COSTS: Record<Exclude<CreditAction, "engineer_project">, number> = {
  chat_message: 1,
  chat_debug: 3,
  feature_generate: 5,
};

/**
 * Zeus Project Engineer runs are the one "dynamic credits depending on
 * project size" case in the spec. We don't know the final file count until
 * generation finishes, so this gives an honest *estimate* (shown to the
 * user before they commit — Feature 9's "Smart Warning") from the request
 * text alone, then the real, final cost — computed the same way but from
 * the actual file count — is what gets logged to the ledger.
 */
export function estimateEngineerCredits(prompt: string): number {
  const length = prompt.trim().length;
  // Longer, more detailed requests tend to ask for bigger projects.
  const complexityBonus = Math.min(20, Math.floor(length / 60));
  return clampCredits(15 + complexityBonus);
}

export function computeEngineerCreditsFromFileCount(fileCount: number): number {
  return clampCredits(10 + fileCount * 2);
}

function clampCredits(n: number): number {
  return Math.max(5, Math.min(60, Math.round(n)));
}

export function estimatedGenerationMinutes(estimatedCredits: number): string {
  // Rough, conservative UX estimate — not a hard guarantee.
  const minutes = Math.max(1, Math.round(estimatedCredits / 8));
  return minutes <= 1 ? "under a minute" : `${minutes}-${minutes + 2} minutes`;
}

/**
 * Issue 2 fix — Engineer Mode's real cost differs by plan (Free: the
 * entire remaining balance, and only once ever; Pro: one project against
 * Fair Usage; Ultimate: nothing). The confirmation screen used to show
 * the same "this still counts as one normal request" line for every plan,
 * which was accurate for Pro but not for Free (where it silently consumed
 * only 1 of the displayed ~15 credits — the bug this fixes) or Ultimate
 * (where nothing should be consumed at all).
 */
export function engineerCreditPolicyLabel(planTier: "free" | "pro" | "ultimate"): string {
  if (planTier === "ultimate") {
    return "Unlimited on your Ultimate plan — this project won't use any credits.";
  }
  if (planTier === "pro") {
    return "This counts as 1 project against your Pro plan's Fair Usage Policy — build as many as you like.";
  }
  return "This is your one free Engineer project — building it will use your entire remaining Free plan balance, and Engineer Mode will lock until you upgrade.";
}
