import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CreditAction } from "./credits.schema";
import { CREDIT_ACTION_LABELS } from "./credits.schema";

// Server-only, plain export (not a createServerFn) — called directly from
// /api/chat.ts, /api/engineer.ts, and modification.functions.ts, which
// already hold a request-scoped, user-JWT-bound Supabase client. Mirrors
// the achievements-insert pattern already used in /api/chat.ts: best
// effort, never throws, never blocks the actual response.
export async function logCredits(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  action: CreditAction,
  credits: number,
  meta: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabase.from("credit_ledger").insert({ user_id: userId, action, credits, meta });
  } catch (e) {
    console.error("credit ledger insert failed", e);
  }
}

export const getCreditsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const since = new Date();
    since.setHours(0, 0, 0, 0);

    const { data: todayRows, error: todayErr } = await supabase
      .from("credit_ledger")
      .select("action, credits")
      .eq("user_id", userId)
      .gte("created_at", since.toISOString());
    if (todayErr) throw new Error(todayErr.message);

    const byAction: Record<string, { label: string; credits: number; count: number }> = {};
    let totalToday = 0;
    for (const row of todayRows ?? []) {
      totalToday += row.credits;
      const key = row.action as string;
      byAction[key] ??= {
        label: CREDIT_ACTION_LABELS[key as CreditAction] ?? key,
        credits: 0,
        count: 0,
      };
      byAction[key].credits += row.credits;
      byAction[key].count += 1;
    }

    const { data: recentRows, error: recentErr } = await supabase
      .from("credit_ledger")
      .select("action, credits, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (recentErr) throw new Error(recentErr.message);

    return {
      totalToday,
      breakdown: Object.values(byAction).sort((a, b) => b.credits - a.credits),
      recent: (recentRows ?? []).map(
        (r: { action: string; credits: number; created_at: string }) => ({
          action: r.action,
          label: CREDIT_ACTION_LABELS[r.action as CreditAction] ?? r.action,
          credits: r.credits,
          createdAt: r.created_at,
        }),
      ),
    };
  });
