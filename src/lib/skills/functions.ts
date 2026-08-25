import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { BUILTIN_SKILLS } from "./builtin";

type CustomSkillRow = {
  id: string;
  name: string;
  description: string | null;
  instructions: string;
  examples: string | null;
  is_active: boolean;
  created_at: string;
};

// ---- Raw REST helpers (same pattern as memory.functions.ts) ----

async function restFetch(url: string, token: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...opts.headers,
    },
  });
}

// ---- Builtin skill toggle ----

export const getEnabledBuiltinSkills = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const base = process.env.SUPABASE_URL!;
    const url = `${base}/rest/v1/profiles?id=eq.${context.userId}&select=enabled_skill_ids,plan`;
    const res = await restFetch(url, context.token);
    const rows = (await res.json()) as Array<{
      enabled_skill_ids: string[];
      plan: string;
    }>;
    const row = rows?.[0];
    return {
      enabledIds: row?.enabled_skill_ids ?? [],
      plan: row?.plan ?? "free",
    };
  });

export const toggleBuiltinSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ skillId: z.string(), enabled: z.boolean() }).parse(input))
  .handler(async ({ context, data }) => {
    const base = process.env.SUPABASE_URL!;
    const token = context.token;

    // Get current enabled IDs
    const getUrl = `${base}/rest/v1/profiles?id=eq.${context.userId}&select=enabled_skill_ids,plan`;
    const getRes = await restFetch(getUrl, token);
    const rows = (await getRes.json()) as Array<{
      enabled_skill_ids: string[];
      plan: string;
    }>;
    const current = rows?.[0]?.enabled_skill_ids ?? [];
    const plan = rows?.[0]?.plan ?? "free";

    // Plan limits
    const maxBuiltin = plan === "free" ? 3 : 8;

    let updated: string[];
    if (data.enabled) {
      if (current.length >= maxBuiltin) {
        throw new Error(`Maximum ${maxBuiltin} skills for ${plan} plan.`);
      }
      updated = [...new Set([...current, data.skillId])];
    } else {
      updated = current.filter((id) => id !== data.skillId);
    }

    const patchUrl = `${base}/rest/v1/profiles?id=eq.${context.userId}`;
    const patchRes = await restFetch(patchUrl, token, {
      method: "PATCH",
      body: JSON.stringify({ enabled_skill_ids: updated }),
    });
    if (!patchRes.ok) throw new Error("Failed to update skill toggle");
    return { enabledIds: updated };
  });

// ---- Custom skills ----

export const listCustomSkills = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CustomSkillRow[]> => {
    const base = process.env.SUPABASE_URL!;
    const url = `${base}/rest/v1/user_custom_skills?user_id=eq.${context.userId}&order=created_at.desc&limit=50`;
    const res = await restFetch(url, context.token);
    if (!res.ok) return [];
    return (await res.json()) as CustomSkillRow[];
  });

export const createCustomSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: unknown) =>
      z
        .object({
          name: z.string().min(1).max(100),
          description: z.string().max(200).optional(),
          instructions: z.string().min(1).max(2000),
          examples: z.string().max(1000).optional(),
        })
        .parse(input),
  )
  .handler(async ({ context, data }): Promise<CustomSkillRow> => {
    const base = process.env.SUPABASE_URL!;
    const token = context.token;

    // Check plan allows custom skills
    const profileUrl = `${base}/rest/v1/profiles?id=eq.${context.userId}&select=plan`;
    const profileRes = await restFetch(profileUrl, token);
    const profileRows = (await profileRes.json()) as Array<{ plan: string }>;
    const plan = profileRows?.[0]?.plan ?? "free";
    if (plan === "free") {
      throw new Error("Custom skills require Pro or Ultimate plan.");
    }

    // Count existing custom skills
    const countUrl = `${base}/rest/v1/user_custom_skills?user_id=eq.${context.userId}&select=id`;
    const countRes = await restFetch(countUrl, token);
    const countRows = (await countRes.json()) as unknown[];
    const maxCustom = plan === "pro" ? 3 : 10;
    if (countRows.length >= maxCustom) {
      throw new Error(`Maximum ${maxCustom} custom skills for ${plan} plan.`);
    }

    const insertUrl = `${base}/rest/v1/user_custom_skills`;
    const insertRes = await restFetch(insertUrl, token, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: context.userId,
        ...data,
      }),
    });
    if (!insertRes.ok) {
      const err = await insertRes.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message ?? "Failed to create skill");
    }
    const rows = (await insertRes.json()) as CustomSkillRow[];
    return rows[0];
  });

export const deleteCustomSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const base = process.env.SUPABASE_URL!;
    const url = `${base}/rest/v1/user_custom_skills?id=eq.${data.id}&user_id=eq.${context.userId}`;
    const res = await restFetch(url, context.token, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete skill");
    return { ok: true };
  });

// ---- Skill resolution for /api/chat (server-side only) ----

/**
 * Resolve active skills for a user and message. Returns combined skill instructions.
 * Called from /api/chat — injects relevant skill instructions into system prompt.
 * Max 2000 chars total to avoid excessive prompt bloat.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveActiveSkillInstructions(
  supabase: any,
  userId: string,
  userMessage: string,
): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("enabled_skill_ids")
    .eq("id", userId)
    .maybeSingle();

  const enabledIds = (profile as unknown as Record<string, unknown>)?.enabled_skill_ids as string[] | undefined;
  if (!enabledIds || enabledIds.length === 0) return "";

  // Match builtin skills by keyword against user message
  const activeBuiltin = BUILTIN_SKILLS.filter((s) => enabledIds.includes(s.id));
  const lastMsg = userMessage.toLowerCase();

  const relevant = activeBuiltin.filter((s) => {
    // Split triggers on | and check for substring match (safe, no ReDoS risk)
    const keywords = s.triggers.split("|").map((k) => k.trim().toLowerCase());
    return keywords.some((kw) => lastMsg.includes(kw));
  });

  // Fetch active custom skills for this user
  let customSkills: CustomSkillRow[] = [];
  try {
    const { data } = await supabase
      .from("user_custom_skills")
      .select("instructions, is_active")
      .eq("user_id", userId)
      .eq("is_active", true);
    customSkills = (data as CustomSkillRow[]) ?? [];
  } catch {
    // Table may not exist yet — fail open
  }

  const allInstructions = [
    ...relevant.map((s) => `[${s.name}]\n${s.instructions}`),
    ...customSkills.map((s) => `[Custom: ${s.name}]\n${s.instructions}`),
  ];

  // Cap at 2000 chars, but try to stop at a complete instruction boundary
  const combined = allInstructions.join("\n\n");
  if (combined.length <= 2000) return combined;
  const lastBoundary = combined.lastIndexOf("\n\n", 2000);
  return lastBoundary > 0 ? combined.slice(0, lastBoundary) : combined.slice(0, 2000);
}
