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
 * the billing UI).
 *
 * H1 fix: returns the paid-through date (`data.attributes.ends_at`) so the
 * caller can record exactly when access ends WITHOUT downgrading the plan —
 * the downgrade itself happens only when the subscription_expired webhook
 * fires. Returns { ok: false } (never throws) if the API key isn't
 * configured or the call fails; callers must NOT change any plan state in
 * that case (the user keeps their current tier and can retry).
 */
export async function cancelLemonSqueezySubscription(
  subscriptionId: string,
): Promise<{ ok: boolean; endsAt: string | null }> {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  if (!apiKey) return { ok: false, endsAt: null };
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
      return { ok: false, endsAt: null };
    }
    let endsAt: string | null = null;
    try {
      const body = (await res.json()) as {
        data?: { attributes?: { ends_at?: string | null } };
      };
      const value = body.data?.attributes?.ends_at;
      endsAt = typeof value === "string" && value ? value : null;
    } catch {
      // Response body isn't required for a successful cancel; treat as
      // unknown paid-through date and fall back to the webhook's ends_at.
    }
    return { ok: true, endsAt };
  } catch (error) {
    console.error("[lemonsqueezy] cancel subscription error", error);
    return { ok: false, endsAt: null };
  }
}
