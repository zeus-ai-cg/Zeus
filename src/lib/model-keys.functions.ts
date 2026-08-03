import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { encryptSecret, lastFour } from "./crypto.server";
import { PROVIDERS, getProvider, type ProviderId } from "./model-providers";

const PROVIDER_VALUES = PROVIDERS.map((p) => p.id) as [ProviderId, ...ProviderId[]];

export const listUserApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_api_keys")
      .select("provider, last_four, created_at, updated_at")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    // Never return encrypted_key — this is the client-visible shape only.
    return data ?? [];
  });

export const saveUserApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ provider: z.enum(PROVIDER_VALUES), apiKey: z.string().min(8).max(400) }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const encrypted = encryptSecret(data.apiKey);
    const { error } = await context.supabase.from("user_api_keys").upsert(
      {
        user_id: context.userId,
        provider: data.provider,
        encrypted_key: encrypted,
        last_four: lastFour(data.apiKey),
      },
      { onConflict: "user_id,provider" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteUserApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ provider: z.enum(PROVIDER_VALUES) }).parse(i))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("user_api_keys")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setActiveModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ provider: z.enum(PROVIDER_VALUES), modelId: z.string().min(1).max(120) }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const provider = getProvider(data.provider);
    if (!provider) throw new Error("Unknown provider");
    if (!provider.models.some((m) => m.id === data.modelId))
      throw new Error("Unknown model for that provider");
    const { error } = await context.supabase
      .from("profiles")
      .update({ active_model_provider: data.provider, active_model_id: data.modelId })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
