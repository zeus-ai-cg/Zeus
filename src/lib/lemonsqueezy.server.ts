// Server-only. Calls Lemon Squeezy's REST API directly (never exposed to
// the client) — used to actually cancel a subscription on Lemon
// Squeezy's side when a user cancels from Billing, not just flip
// profiles.plan locally. Optional: if LEMONSQUEEZY_API_KEY isn't set,
// callers should fall back to the local-only downgrade — Lemon Squeezy's
// subscription_cancelled webhook is the ultimate source of truth either
// way (src/routes/api/webhooks.ts), this is purely so the subscription
// doesn't keep renewing/charging after someone clicks "Cancel" in Zeus AI.

const API_BASE = "https://api.lemonsqueezy.com/v1";

export function isLemonSqueezyApiConfigured(): boolean {
  return Boolean(process.env.LEMONSQUEEZY_API_KEY);
}

/**
 * Cancels a subscription via Lemon Squeezy's API (sets it to cancel at
 * period end, matching "Pro access stays until the end of the period" in
 * the billing UI). Returns false (never throws) if the API key isn't
 * configured or the call fails — callers treat that as "fall back to a
 * local-only downgrade" rather than blocking the user.
 */
export async function cancelLemonSqueezySubscription(subscriptionId: string): Promise<boolean> {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  if (!apiKey) return false;
  try {
    const res = await fetch(`${API_BASE}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: "DELETE",
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!res.ok) {
      console.error(
        "[lemonsqueezy] cancel subscription failed",
        res.status,
        await res.text().catch(() => ""),
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error("[lemonsqueezy] cancel subscription error", error);
    return false;
  }
}
