// Lightweight Lemon Squeezy checkout helper. Replaces src/lib/paddle.ts —
// Zeus AI's payment processor is now Lemon Squeezy.
//
// The checkout is created server-side so we can verify the runtime
// configuration, log the real failure reason, and surface specific errors to
// the user instead of the generic "Checkout script failed to load" message.

const CHECKOUT_ROUTE = "/api/lemonsqueezy/checkout";
const initPromises: Record<CheckoutTier, Promise<void> | null> = {
  pro: null,
  ultimate: null,
};

export type CheckoutTier = "pro" | "ultimate";

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

function tierCheckoutUrl(tier: CheckoutTier): string | undefined {
  return tier === "ultimate"
    ? getRuntimeEnvValue("LEMONSQUEEZY_ULTIMATE_CHECKOUT_URL", "VITE_LEMONSQUEEZY_ULTIMATE_CHECKOUT_URL")
    : getRuntimeEnvValue("LEMONSQUEEZY_PRO_CHECKOUT_URL", "VITE_LEMONSQUEEZY_PRO_CHECKOUT_URL");
}

export function isLemonSqueezyConfigured(tier: CheckoutTier = "pro") {
  return Boolean(tierCheckoutUrl(tier));
}

export async function initLemonSqueezy(tier: CheckoutTier = "pro"): Promise<void> {
  if (initPromises[tier]) return initPromises[tier];

  initPromises[tier] = (async () => {
    try {
      console.info("[lemonsqueezy] init.request", { tier, route: CHECKOUT_ROUTE });
      const response = await fetch(CHECKOUT_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, preview: true }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Lemon Squeezy checkout could not be initialized.");
      }

      console.info("[lemonsqueezy] init.ready", { tier, status: response.status });
    } catch (error) {
      console.error("[lemonsqueezy] init.failed", { tier, error });
      initPromises[tier] = null;
      throw error;
    }
  })();

  return initPromises[tier];
}

export async function openCheckout(
  tier: CheckoutTier,
  opts: { email?: string; userId?: string } = {},
) {
  try {
    await initLemonSqueezy(tier);
  } catch (error) {
    throw error;
  }

  console.info("[lemonsqueezy] checkout.request", { tier, email: Boolean(opts.email), userId: Boolean(opts.userId) });

  const response = await fetch(CHECKOUT_ROUTE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier, email: opts.email, userId: opts.userId }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { checkoutUrl?: string; error?: string; message?: string }
    | null;

  if (!response.ok || !payload?.checkoutUrl) {
    const message = payload?.message ?? payload?.error ?? "Checkout creation failed";
    console.error("[lemonsqueezy] checkout.failed", { tier, message });
    throw new Error(message);
  }

  const checkoutUrl = payload.checkoutUrl;
  console.info("[lemonsqueezy] checkout.created", { tier, checkoutUrl });

  const popup = window.open(checkoutUrl, "_blank", "noopener,noreferrer");
  if (!popup) {
    window.location.assign(checkoutUrl);
  }
}

export async function openProCheckout(opts: { email?: string; userId?: string } = {}) {
  return openCheckout("pro", opts);
}

export async function openUltimateCheckout(opts: { email?: string; userId?: string } = {}) {
  return openCheckout("ultimate", opts);
}
