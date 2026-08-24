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
    ? getRuntimeEnvValue(
        "LEMONSQUEEZY_ULTIMATE_CHECKOUT_URL",
        "VITE_LEMONSQUEEZY_ULTIMATE_CHECKOUT_URL",
      )
    : getRuntimeEnvValue("LEMONSQUEEZY_PRO_CHECKOUT_URL", "VITE_LEMONSQUEEZY_PRO_CHECKOUT_URL");
}

export function isLemonSqueezyConfigured(tier: CheckoutTier = "pro") {
  return Boolean(tierCheckoutUrl(tier));
}

export async function initLemonSqueezy(
  tier: CheckoutTier = "pro",
  token?: string | null,
): Promise<void> {
  if (initPromises[tier]) return initPromises[tier];

  initPromises[tier] = (async () => {
    try {
      console.info("[lemonsqueezy] init.request", { tier, route: CHECKOUT_ROUTE });
      const response = await fetch(CHECKOUT_ROUTE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tier, preview: true }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;

      // The probe must NOT block the real checkout attempt. A 401 here means
      // the session wasn't ready yet — openCheckout's own authenticated call
      // (with its recovery ladder) is the authority. Only config problems
      // (5xx) are worth surfacing at this stage.
      if (!response.ok && response.status !== 401) {
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
  // NOTE (H2 fix): opts.userId is accepted for call-site compatibility but
  // deliberately NOT sent — the checkout route now derives the account to
  // upgrade exclusively from the verified Supabase session (Authorization
  // header below). A client-supplied id could otherwise upgrade any account.
  opts: { email?: string; userId?: string } = {},
) {
  // Resolve the session FIRST so the init probe can also authenticate — the
  // server rejects every checkout-route request without a Bearer token,
  // including preview probes (H2 hardening).
  const { supabase } = await import("@/integrations/supabase/client");
  const { data: sessionData } = await supabase.auth.getSession();
  let token = sessionData.session?.access_token;

  // Resilience: a stale/expired access token would 401 on the server even
  // though the user IS signed in. Recovery ladder before giving up:
  // 1) getUser() forces supabase-js to validate/refresh via the refresh token
  // 2) explicit refreshSession()
  // 3) re-read the session — recovered tokens are picked up here
  if (!token) {
    await supabase.auth.getUser().catch(() => null);
    await supabase.auth.refreshSession().catch(() => null);
    const retry = await supabase.auth.getSession();
    token = retry.data.session?.access_token;
  }

  if (!token) {
    console.error(
      "[lemonsqueezy] checkout.no_session",
      "No usable Supabase session in this browser — user must log in again.",
    );
  }

  await initLemonSqueezy(tier, token);

  console.info("[lemonsqueezy] checkout.request", { tier, email: Boolean(opts.email), hadToken: Boolean(token) });

  const response = await fetch(CHECKOUT_ROUTE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    // A fresh timestamp guards against any cached intermediary response.
    cache: "no-store",
    body: JSON.stringify({ tier, email: opts.email }),
  });

  const payload = (await response.json().catch(() => null)) as {
    checkoutUrl?: string;
    error?: string;
    message?: string;
    hint?: string;
  } | null;

  if (!response.ok || !payload?.checkoutUrl) {
    if (payload?.error === "auth_required") {
      // The hint distinguishes "no token was sent" from "token was rejected"
      // so a stuck checkout is diagnosable from the console alone.
      throw new Error(
        `Please sign in before upgrading.${payload.hint ? ` [${payload.hint}]` : ""}`,
      );
    }
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
