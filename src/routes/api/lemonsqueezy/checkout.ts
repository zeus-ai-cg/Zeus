import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createCheckout, lemonSqueezySetup } from "@lemonsqueezy/lemonsqueezy.js";
import { parseBearerToken, resolveCheckoutIdentity } from "@/lib/lemonsqueezy-webhook.server";

type CheckoutRequestBody = {
  tier?: "pro" | "ultimate";
  email?: string;
  preview?: boolean;
  // NOTE (H2 fix): a client-supplied userId is deliberately NOT accepted —
  // the account to upgrade is derived exclusively from the verified session.
};

function getRuntimeEnvValue(...keys: string[]): string | undefined {
  const candidates = new Set<string>();
  for (const key of keys) {
    if (!key) continue;
    candidates.add(key);
    if (!key.startsWith("VITE_")) {
      candidates.add(`VITE_${key}`);
    }
  }

  const env = import.meta.env as Record<string, string | boolean | undefined> | undefined;
  for (const key of candidates) {
    const value = env?.[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    const processValue = typeof process !== "undefined" ? process.env?.[key] : undefined;
    if (typeof processValue === "string" && processValue.trim()) {
      return processValue;
    }
  }

  return undefined;
}

function buildCheckoutError(message: string) {
  return new Response(JSON.stringify({ error: "checkout_creation_failed", message }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}

function buildUnauthorized(hint: string) {
  return new Response(
    JSON.stringify({
      error: "auth_required",
      message: "Sign in before starting checkout.",
      // Diagnostic only — distinguishes "browser sent no token" from
      // "server rejected the token". Contains no secrets.
      hint,
    }),
    { status: 401, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * H2 fix: verifies the caller's Supabase session and returns the identity
 * used for checkout custom-data. Returns null when unauthenticated. The
 * returned userId/email come ONLY from verified claims — the request body
 * can never choose which account gets upgraded.
 */
async function authenticateCheckoutRequest(
  request: Request,
): Promise<
  | {
      ok: true;
      identity: ReturnType<typeof resolveCheckoutIdentity>;
      supabase: ReturnType<typeof createClient>;
    }
  | { ok: false; hint: string }
> {
  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) return { ok: false, hint: "no_token_in_request" };

  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) {
    console.error("[lemonsqueezy] checkout.claims_rejected", {
      reason: error?.message ?? "no claims returned",
    });
    return { ok: false, hint: "claims_rejected" };
  }

  return {
    ok: true,
    identity: resolveCheckoutIdentity(data.claims as { sub?: string; email?: unknown }),
    supabase,
  };
}

function buildAlreadySubscribed(plan: string) {
  return new Response(
    JSON.stringify({
      error: "already_subscribed",
      message: `Your account is already on the ${plan} plan — no need to purchase this again.`,
    }),
    { status: 409, headers: { "Content-Type": "application/json" } },
  );
}

export const Route = createFileRoute("/api/lemonsqueezy/checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = await authenticateCheckoutRequest(request);
          if (!auth.ok) {
            return buildUnauthorized(auth.hint);
          }
          if (!auth.identity) {
            return buildUnauthorized("identity_unresolvable");
          }
          const identity = auth.identity;

          const body = (await request.json().catch(() => null)) as CheckoutRequestBody | null;
          const tier = body?.tier === "ultimate" ? "ultimate" : "pro";
          const preview = Boolean(body?.preview);

          // Double-purchase guard (server-side, authoritative): if the
          // account already holds a plan that covers the requested tier,
          // refuse to open another checkout — regardless of what any client
          // flash-of-enabled-state let the user click.
          if (identity.userId && !preview) {
            const { data: prof } = (await auth.supabase
              .from("profiles")
              .select("plan")
              .eq("id", identity.userId)
              .single()) as unknown as { data: { plan?: string } | null };
            const plan = typeof prof?.plan === "string" ? prof.plan.toLowerCase() : "";
            const coversRequested = plan === "ultimate" || (tier === "pro" && plan === "pro");
            if (coversRequested) {
              console.info("[lemonsqueezy] checkout.already_subscribed", { tier, plan });
              return buildAlreadySubscribed(plan);
            }
          }

          // Email: verified session first; client value is only a prefill
          // fallback when the session carries none. It never affects which
          // account gets upgraded.
          const email = identity.email ?? body?.email?.trim();
          const userId = identity.userId;

          if (preview) {
            console.info("[lemonsqueezy] init.request", { tier, preview: true });
          }

          const directCheckoutUrl =
            tier === "ultimate"
              ? getRuntimeEnvValue(
                  "LEMONSQUEEZY_ULTIMATE_CHECKOUT_URL",
                  "VITE_LEMONSQUEEZY_ULTIMATE_CHECKOUT_URL",
                )
              : getRuntimeEnvValue(
                  "LEMONSQUEEZY_PRO_CHECKOUT_URL",
                  "VITE_LEMONSQUEEZY_PRO_CHECKOUT_URL",
                );

          if (directCheckoutUrl) {
            const url = new URL(directCheckoutUrl);
            url.searchParams.set("embed", "1");
            url.searchParams.set("dark", "1");
            if (email) url.searchParams.set("checkout[email]", email);
            if (userId) url.searchParams.set("checkout[custom][user_id]", userId);
            console.info("[lemonsqueezy] checkout.url", { tier, source: "env" });
            return new Response(JSON.stringify({ checkoutUrl: url.toString() }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          const storeId = getRuntimeEnvValue("LEMONSQUEEZY_STORE_ID");
          const variantId =
            tier === "ultimate"
              ? getRuntimeEnvValue(
                  "LEMONSQUEEZY_ULTIMATE_VARIANT_ID",
                  "LEMONSQUEEZY_VARIANT_ID_ULTIMATE",
                )
              : getRuntimeEnvValue("LEMONSQUEEZY_PRO_VARIANT_ID", "LEMONSQUEEZY_VARIANT_ID_PRO");
          const apiKey = getRuntimeEnvValue("LEMONSQUEEZY_API_KEY");

          const missing = [] as string[];
          if (!storeId) missing.push("Missing Store ID (LEMONSQUEEZY_STORE_ID)");
          if (!variantId) {
            missing.push(
              `Missing Variant ID (${tier === "ultimate" ? "LEMONSQUEEZY_ULTIMATE_VARIANT_ID" : "LEMONSQUEEZY_PRO_VARIANT_ID"})`,
            );
          }
          if (!apiKey) missing.push("Missing API key (LEMONSQUEEZY_API_KEY)");
          if (missing.length > 0) {
            console.error("[lemonsqueezy] checkout.config_missing", { tier, missing });
            return buildCheckoutError(missing.join("; "));
          }

          console.info("[lemonsqueezy] checkout.create", { tier, storeId, variantId });
          lemonSqueezySetup({
            apiKey,
            onError: (error) => {
              console.error("[lemonsqueezy] sdk.setup_error", { tier, error });
            },
          });

          console.info("[lemonsqueezy] sdk.initialized", { tier, storeId, variantId });

          const { data, error } = await createCheckout(storeId!, variantId!, {
            checkoutOptions: {
              embed: true,
              dark: true,
            },
          });

          const checkoutUrl = data?.data?.attributes?.url;
          if (error || !checkoutUrl) {
            const message = error?.message ?? "No checkout URL returned";
            console.error("[lemonsqueezy] checkout.create_failed", { tier, message });
            return buildCheckoutError(message);
          }

          const url = new URL(checkoutUrl);
          if (email) url.searchParams.set("checkout[email]", email);
          if (userId) url.searchParams.set("checkout[custom][user_id]", userId);

          console.info("[lemonsqueezy] checkout.created", { tier, checkoutUrl: url.toString() });

          return new Response(JSON.stringify({ checkoutUrl: url.toString() }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Checkout creation failed";
          console.error("[lemonsqueezy] checkout.request_failed", { error: message });
          return buildCheckoutError(message);
        }
      },
    },
  },
});
