import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  FREE_QUESTION_LIMIT,
  FREE_RESET_HOURS,
  LEARNING_MODES,
  PRO_MONTHLY_REQUEST_LIMIT,
  PRO_RESET_DAYS,
  PRO_SOFT_WARNING_THRESHOLD,
  isLearningModeLocked,
} from "./achievements";
import { isProOrAbove } from "./plans";

const MODE_VALUES = LEARNING_MODES.map((m) => m.value) as [string, ...string[]];

const isValidTimestamp = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  return Number.isFinite(new Date(value).getTime());
};

const normalizeTimestamp = (value: unknown): string =>
  isValidTimestamp(value) ? value : new Date().toISOString();

const isMissingColumnError = (error: { code?: string; message?: string } | null) =>
  Boolean(error?.code === "42703");

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (!profile) return null;

    // Reset-if-due for both rolling windows, applied atomically server-side.
    // profiles.questions_used / pro_requests_used etc. are protected against
    // direct writes from the authenticated role (see
    // supabase/migrations/20260725120000_lock_down_profile_privileges.sql),
    // so a plain .update() here would silently no-op â€” this RPC is the only
    // way a request running under the user's own JWT can apply a reset.
    let questions_used = Number(profile.questions_used ?? 0);
    let usage_reset_at = normalizeTimestamp(profile.usage_reset_at);
    let pro_requests_used = Number(profile.pro_requests_used ?? 0);
    let pro_usage_reset_at = normalizeTimestamp(profile.pro_usage_reset_at ?? profile.created_at);
    const { data: usageRow, error: usageErr } = await supabase
      .rpc("get_current_usage", { p_user_id: userId })
      .maybeSingle();
    if (usageErr && !isMissingColumnError(usageErr)) throw new Error(usageErr.message);
    if (usageRow) {
      questions_used = Number(usageRow.questions_used ?? questions_used);
      usage_reset_at = normalizeTimestamp(usageRow.usage_reset_at ?? usage_reset_at);
      pro_requests_used = Number(usageRow.pro_requests_used ?? pro_requests_used);
      pro_usage_reset_at = normalizeTimestamp(usageRow.pro_usage_reset_at ?? pro_usage_reset_at);
    }

    const limit = isProOrAbove(profile.plan) ? Infinity : FREE_QUESTION_LIMIT;
    const nextReset = new Date(
      new Date(usage_reset_at).getTime() + FREE_RESET_HOURS * 3600 * 1000,
    ).toISOString();
    const proNextReset = new Date(
      new Date(pro_usage_reset_at).getTime() + PRO_RESET_DAYS * 24 * 3600 * 1000,
    ).toISOString();

    return {
      ...profile,
      questions_used,
      usage_reset_at,
      limit: Number.isFinite(limit) ? limit : null,
      remaining: Number.isFinite(limit) ? Math.max(0, (limit as number) - questions_used) : null,
      next_reset_at: nextReset,
      // Pro Fair Usage Policy
      pro_requests_used,
      pro_usage_reset_at,
      pro_limit: PRO_MONTHLY_REQUEST_LIMIT,
      pro_remaining: Math.max(0, PRO_MONTHLY_REQUEST_LIMIT - pro_requests_used),
      pro_soft_warning: pro_requests_used >= PRO_SOFT_WARNING_THRESHOLD,
      pro_next_reset_at: proNextReset,
    };
  });

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  // `plan` is accepted here only to know which screen to route to next â€”
  // it is NEVER written to the database. Onboarding used to write
  // `plan: data.plan` straight to profiles, which meant clicking "Upgrade
  // to Pro" on the onboarding screen granted Pro instantly with no payment
  // (profiles.plan is also now DB-protected against this either way â€” see
  // supabase/migrations/20260725120000_lock_down_profile_privileges.sql â€”
  // but the request should never have reached the table in the first
  // place). Real Pro activation only happens via the signature-verified
  // Lemon Squeezy webhook at src/routes/api/webhooks.ts.
  .validator((i: unknown) => z.object({ plan: z.enum(["free", "pro"]) }).parse(i))
  .handler(async ({ context }) => {
    await context.supabase
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", context.userId);
    return { ok: true };
  });

export const setPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  // Self-service downgrade only. Upgrading to "pro"/"ultimate" must go
  // through real payment â€” see the comment on completeOnboarding above and
  // src/routes/api/webhooks.ts. Prefer cancelSubscription (below) from the
  // UI where possible â€” it also cancels on Lemon Squeezy's side.
  .validator((i: unknown) => z.object({ plan: z.literal("free") }).parse(i))
  .handler(async ({ context, data }) => {
    await context.supabase.from("profiles").update({ plan: data.plan }).eq("id", context.userId);
    return { ok: true };
  });

export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  // H1 fix: cancelling stops the NEXT charge but must NOT end paid access
  // immediately. The plan stays untouched here; the only local change is
  // marking the subscription non-renewing and recording the paid-through
  // date so Billing can show exactly when access ends. The actual downgrade
  // happens when Lemon Squeezy fires subscription_expired at the end of the
  // paid period (src/lib/lemonsqueezy-webhook.server.ts).
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("lemonsqueezy_subscription_id")
      .eq("id", context.userId)
      .maybeSingle();

    const subscriptionId = (profile as { lemonsqueezy_subscription_id?: string | null } | null)
      ?.lemonsqueezy_subscription_id;

    if (!subscriptionId) {
      // No subscription to cancel remotely (already free, or the webhook
      // hasn't linked one yet). Keep whatever state exists — a free user
      // clicking "Cancel" should simply stay free.
      return { ok: true, cancelledRemotely: false, endsAt: null as string | null };
    }

    const { cancelLemonSqueezySubscription } = await import("./lemonsqueezy.server");
    const result = await cancelLemonSqueezySubscription(subscriptionId);

    if (!result.ok) {
      // Remote cancellation failed (missing API key or transient API error).
      // Do NOT touch any profile state: silently downgrading while Lemon
      // Squeezy keeps charging would be the worst outcome. The UI tells the
      // user to retry; the subscription_cancelled webhook remains the source
      // of truth if they succeed elsewhere.
      return { ok: false, cancelledRemotely: false, endsAt: null as string | null };
    }

    // Mark non-renewing WITHOUT downgrading. These two columns are frozen
    // for the authenticated role by protect_privileged_profile_columns, so
    // the write goes through the service-role client.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        lemonsqueezy_renewal_status: "cancelled",
        ...(result.endsAt ? { lemonsqueezy_next_renewal_at: result.endsAt } : {}),
      } as never)
      .eq("id", context.userId)
      .eq("lemonsqueezy_subscription_id", subscriptionId);
    if (error) throw new Error(error.message);

    return { ok: true, cancelledRemotely: true, endsAt: result.endsAt };
  });

export const setLearningMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ mode: z.enum(MODE_VALUES) }).parse(i))
  .handler(async ({ context, data }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("plan")
      .eq("id", context.userId)
      .maybeSingle();
    if (isLearningModeLocked(data.mode, profile?.plan)) {
      throw new Error("This learning mode is a Pro feature. Upgrade to Zeus AI Pro to unlock it.");
    }
    await context.supabase
      .from("profiles")
      .update({ learning_mode: data.mode })
      .eq("id", context.userId);
    return { ok: true };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z
      .object({
        display_name: z.string().min(1).max(80).optional(),
        full_name: z.string().min(1).max(120).optional().nullable(),
        age: z.number().int().min(5).max(120).optional().nullable(),
        nationality: z.string().min(1).max(80).optional().nullable(),
        avatar_url: z.string().url().max(2048).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const patch = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("profiles")
      .update(patch as never)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setCodingPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z
      .object({
        codingStyle: z.enum(["idiomatic", "concise", "verbose", "functional"]).optional(),
        responseLength: z.enum(["brief", "balanced", "detailed"]).optional(),
        creativityLevel: z.enum(["conservative", "balanced", "creative"]).optional(),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const patch: Record<string, unknown> = {};
    if (data.codingStyle) patch.coding_style = data.codingStyle;
    if (data.responseLength) patch.response_length = data.responseLength;
    if (data.creativityLevel) patch.creativity_level = data.creativityLevel;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("profiles")
      .update(patch as never)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const [{ count: totalMessages }, { count: weekMessages }, { data: threads }] =
      await Promise.all([
        supabase.from("messages").select("*", { count: "exact", head: true }).eq("role", "user"),
        supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("role", "user")
          .gte("created_at", weekAgo),
        supabase
          .from("threads")
          .select("id, title, updated_at")
          .order("updated_at", { ascending: false })
          .limit(5),
      ]);
    const { data: profile } = await supabase
      .from("profiles")
      .select("streak_days, favorite_language, plan")
      .eq("id", userId)
      .maybeSingle();
    return {
      total_questions: totalMessages ?? 0,
      questions_this_week: weekMessages ?? 0,
      recent_threads: threads ?? [],
      streak_days: profile?.streak_days ?? 0,
      favorite_language: profile?.favorite_language ?? null,
      plan: profile?.plan ?? "free",
    };
  });

export const listSnippets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("saved_snippets")
      .select("*")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const createSnippet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z
      .object({
        title: z.string().min(1).max(120),
        language: z.string().min(1).max(40),
        code: z.string().min(1).max(20000),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("saved_snippets")
      .insert({ ...data, user_id: context.userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteSnippet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    await context.supabase.from("saved_snippets").delete().eq("id", data.id);
    return { ok: true };
  });
