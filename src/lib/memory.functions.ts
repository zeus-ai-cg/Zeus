import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const MEMORY_LIMITS: Record<string, number> = {
  free: 10,
  pro: 50,
  ultimate: 200,
};

export type MemoryRow = {
  id: string;
  content: string;
  category: string;
  source: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const memorySchema = z.object({
  content: z.string().min(1).max(500),
  category: z.enum(["general", "preference", "goal", "context", "constraint"]).default("general"),
  source: z.enum(["user", "auto", "system"]).default("user"),
});

// Raw REST helper — user_memories table not yet in generated Supabase types.
// After migration + `supabase gen types typescript`, switch to typed client.
async function restQuery(
  url: string,
  token: string,
  opts: RequestInit = {},
): Promise<Response> {
  return fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...opts.headers,
    },
  });
}

export const listMemories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MemoryRow[]> => {
    const base = process.env.SUPABASE_URL!;
    const url = `${base}/rest/v1/user_memories?user_id=eq.${context.userId}&is_active=eq.true&order=updated_at.desc&limit=50&select=id,content,category,source,is_active,created_at,updated_at`;
    const res = await restQuery(url, context.token);
    if (!res.ok) return [];
    return (await res.json()) as MemoryRow[];
  });

export const createMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => memorySchema.parse(input))
  .handler(async ({ context, data }): Promise<MemoryRow> => {
    const base = process.env.SUPABASE_URL!;
    const token = context.token;

    // Check memory_enabled and plan via RPC-safe raw query
    const profileUrl = `${base}/rest/v1/profiles?id=eq.${context.userId}&select=plan,memory_enabled`;
    const profileRes = await restQuery(profileUrl, token);
    const profileRows = (await profileRes.json()) as Array<{
      plan: string;
      memory_enabled: boolean;
    }>;
    const profile = profileRows?.[0];
    if (!profile?.memory_enabled) {
      throw new Error("Memory feature is disabled in your settings.");
    }

    const plan = profile.plan ?? "free";
    const limit = MEMORY_LIMITS[plan] ?? MEMORY_LIMITS.free;

    // Count active
    const countUrl = `${base}/rest/v1/user_memories?user_id=eq.${context.userId}&is_active=eq.true&select=id`;
    const countRes = await restQuery(countUrl, token);
    const countRows = (await countRes.json()) as unknown[];
    if (countRows.length >= limit) {
      throw new Error(`Memory limit reached (${limit} for ${plan} plan). Delete some memories first.`);
    }

    // Reject secrets/passwords/API keys
    const secretPattern = /(?:password|secret|api[_-]?key|token|credential)\s*[:=]/i;
    if (secretPattern.test(data.content)) {
      throw new Error("Cannot store passwords, API keys, or secrets as memories.");
    }

    const insertUrl = `${base}/rest/v1/user_memories`;
    const insertRes = await restQuery(insertUrl, token, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: context.userId,
        content: data.content,
        category: data.category,
        source: data.source,
      }),
    });
    if (!insertRes.ok) {
      const err = await insertRes.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message ?? "Failed to create memory");
    }
    const rows = (await insertRes.json()) as MemoryRow[];
    return rows[0];
  });

export const deleteMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const base = process.env.SUPABASE_URL!;
    const url = `${base}/rest/v1/user_memories?id=eq.${data.id}&user_id=eq.${context.userId}`;
    const res = await restQuery(url, context.token, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete memory");
    return { ok: true };
  });

export const clearMemories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const base = process.env.SUPABASE_URL!;
    const url = `${base}/rest/v1/user_memories?user_id=eq.${context.userId}`;
    const res = await restQuery(url, context.token, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to clear memories");
    return { ok: true };
  });

export const getMemorySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const base = process.env.SUPABASE_URL!;
    const url = `${base}/rest/v1/profiles?id=eq.${context.userId}&select=memory_enabled,plan`;
    const res = await restQuery(url, context.token);
    const rows = (await res.json()) as Array<{
      memory_enabled: boolean;
      plan: string;
    }>;
    const row = rows?.[0];
    return {
      enabled: row?.memory_enabled ?? true,
      plan: row?.plan ?? "free",
      limit: MEMORY_LIMITS[row?.plan ?? "free"] ?? MEMORY_LIMITS.free,
    };
  });

export const setMemorySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ context, data }) => {
    const base = process.env.SUPABASE_URL!;
    const url = `${base}/rest/v1/profiles?id=eq.${context.userId}`;
    const res = await restQuery(url, context.token, {
      method: "PATCH",
      body: JSON.stringify({ memory_enabled: data.enabled }),
    });
    if (!res.ok) throw new Error("Failed to update memory settings");
    return { ok: true };
  });
