import { decryptSecret } from "./crypto.server";
import type { ProviderId } from "./model-providers";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Server-only. NOT a createServerFn — called directly from other server
// functions/routes that already hold an authenticated Supabase client for
// the current request (src/routes/api/chat.ts, modification.functions.ts,
// code-review.functions.ts, git-tools.functions.ts, terminal.functions.ts).
//
// Deliberately kept in its own file, separate from model-keys.functions.ts:
// that file also exports client-callable createServerFn()s
// (listUserApiKeys, saveUserApiKey, deleteUserApiKey, setActiveModel) that
// are imported directly by client components (e.g. ModelSettingsPanel.tsx).
// Because this function is a plain export (not wrapped in createServerFn),
// bundlers can't strip its body out of the client bundle the way they do
// for createServerFn handlers — keeping it (and its crypto.server.ts / the
// scryptSync it uses under node:crypto) in a module that's never imported
// by client code avoids "node:crypto has no export scryptSync" build
// failures from that server-only dependency leaking into the browser
// bundle.
//
// Decides which provider/model/key a user's chat request should actually
// use, decrypting a BYOK key only in server memory for the duration of the
// request. Never returns the raw key to a route response body.
// ---------------------------------------------------------------------------
export async function resolveActiveModel(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ provider: ProviderId; modelId: string; apiKey: string | null; isByok: boolean; overridden?: boolean }> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("active_model_provider, active_model_id")
    .eq("id", userId)
    .maybeSingle();

  const provider = (profile?.active_model_provider ?? "gemini") as ProviderId;
  const modelId = profile?.active_model_id ?? "gemini-2.5-flash";

  const { data: keyRow } = await supabase
    .from("user_api_keys")
    .select("encrypted_key")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();

  if (keyRow?.encrypted_key) {
    return { provider, modelId, apiKey: decryptSecret(keyRow.encrypted_key), isByok: true };
  }

  // No BYOK key. Platform fallback priority:
  // 1. Gemini (primary — powers engineer mode and chat fallback)
  // 2. OxAlpha/OpenRouter (secondary)
  const geminiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (geminiKey) {
    const geminiModelId = (process.env.GEMINI_ENGINEER_MODEL ?? "gemini-2.5-flash").trim();
    return {
      provider: "gemini",
      modelId: geminiModelId,
      apiKey: geminiKey,
      isByok: false,
      overridden: provider !== "gemini",
    };
  }
  const oxAlphaKey = (process.env.OxALPHA_API_KEY ?? process.env.OXALPHA_API_KEY ?? "").trim();
  if (oxAlphaKey) {
    return {
      provider: "oxalpha",
      modelId: process.env.OXALPHA_MODEL || "stealth/ox-alpha",
      apiKey: oxAlphaKey,
      isByok: false,
      overridden: provider !== "oxalpha",
    };
  }
  if (provider === "gemini") {
    return { provider, modelId, apiKey: process.env.GEMINI_API_KEY ?? null, isByok: false };
  }
  return { provider, modelId, apiKey: null, isByok: false };
}
