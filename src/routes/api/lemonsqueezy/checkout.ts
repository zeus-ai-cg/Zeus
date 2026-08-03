import { createFileRoute } from "@tanstack/react-router";
import { createCheckout, lemonSqueezySetup } from "@lemonsqueezy/lemonsqueezy.js";

type CheckoutRequestBody = {
  tier?: "pro" | "ultimate";
  email?: string;
  userId?: string;
  preview?: boolean;
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

export const Route = createFileRoute("/api/lemonsqueezy/checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => null)) as CheckoutRequestBody | null;
          const tier = body?.tier === "ultimate" ? "ultimate" : "pro";
          const email = body?.email?.trim();
          const userId = body?.userId?.trim();
          const preview = Boolean(body?.preview);

          if (preview) {
            console.info("[lemonsqueezy] init.request", { tier, preview: true });
          }

          const directCheckoutUrl =
            tier === "ultimate"
              ? getRuntimeEnvValue("LEMONSQUEEZY_ULTIMATE_CHECKOUT_URL", "VITE_LEMONSQUEEZY_ULTIMATE_CHECKOUT_URL")
              : getRuntimeEnvValue("LEMONSQUEEZY_PRO_CHECKOUT_URL", "VITE_LEMONSQUEEZY_PRO_CHECKOUT_URL");

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
              ? getRuntimeEnvValue("LEMONSQUEEZY_ULTIMATE_VARIANT_ID", "LEMONSQUEEZY_VARIANT_ID_ULTIMATE")
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

          const { data, error } = await createCheckout(storeId, variantId, {
            checkoutOptions: {
              embed: true,
              dark: true,
            },
          });

          if (error || !data?.url) {
            const message = error?.message ?? "No checkout URL returned";
            console.error("[lemonsqueezy] checkout.create_failed", { tier, message });
            return buildCheckoutError(message);
          }

          const url = new URL(data.url);
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
