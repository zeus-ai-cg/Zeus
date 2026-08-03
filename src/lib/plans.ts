// Zeus AI — plan tiers (Feature 7).
//
// Three tiers now: free, pro, ultimate. "ultimate" is additive — it's a
// strict superset of "pro" (never locked out of anything pro has) plus no
// Fair Usage Policy ceiling. Every place in the app that used to check
// `plan === "pro"` should go through normalizePlan()/isProOrAbove()/
// isUltimate() here instead, so a subscriber's access never depends on a
// stray string comparison being kept in sync by hand across a dozen files.

export type PlanTier = "free" | "pro" | "ultimate";

export const PLAN_LABELS: Record<PlanTier, string> = {
  free: "Free",
  pro: "Pro",
  ultimate: "Ultimate",
};

export function normalizePlan(plan: string | null | undefined): PlanTier {
  return plan === "pro" || plan === "ultimate" ? plan : "free";
}

/** True for both "pro" and "ultimate" — use for anything gated at the Pro tier and above. */
export function isProOrAbove(plan: string | null | undefined): boolean {
  const tier = normalizePlan(plan);
  return tier === "pro" || tier === "ultimate";
}

export function isUltimate(plan: string | null | undefined): boolean {
  return normalizePlan(plan) === "ultimate";
}
