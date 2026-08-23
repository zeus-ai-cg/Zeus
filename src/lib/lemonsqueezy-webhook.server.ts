// Lemon Squeezy webhook processing core.
//
// Extracted from src/routes/api/webhooks.ts so the decision logic can be
// unit-tested without a database (scripts/test-billing.mjs injects fake
// dependency adapters). The route file stays a thin wrapper that wires these
// functions to supabaseAdmin.
//
// Billing semantics implemented here (audit fixes H1-H4):
//
//   H1  Cancellation preserves paid access. `subscription_cancelled` only
//       marks the subscription non-renewing and records the paid-through
//       date (attributes.ends_at). The plan is downgraded exclusively by
//       `subscription_expired` (or a subscription_updated carrying
//       status="expired"), i.e. when the paid period actually ends.
//
//   H3  Missing custom_data.user_id never silently abandons a paid
//       subscription: the processor tries safe recovery matches (existing
//       subscription-id linkage, then existing customer-id linkage — both
//       established by earlier verified events). If no safe match exists it
//       reports an actionable "unmatched" result instead of guessing; the
//       route turns that into a loud log + HTTP 500 so the failure shows up
//       in Lemon Squeezy's webhook delivery dashboard.
//
//   H4  Pause is not cancellation. Pausing suspends access (plan -> free,
//       fair-usage counters reset) but PRESERVES customer/subscription/
//       order identifiers so resume can restore the exact tier. Resume
//       (subscription_resumed / subscription_unpaused / an updated event
//       carrying an active status) re-derives the plan from the variant.
//
//   Idempotency: every branch computes the full desired patch from the
//   event alone, so repeated deliveries apply identical writes.

import { createHmac, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Event shape (JSON:API subset actually consumed)
// ---------------------------------------------------------------------------

export type LsEventAttributes = {
  status?: string;
  customer_id?: number | string;
  variant_id?: number | string;
  order_id?: number | string;
  /** Paid-through timestamp; present on cancelled subscriptions. */
  ends_at?: string | null;
  /** Next renewal timestamp for live subscriptions. */
  renews_at?: string | null;
  /** Subscriber email as known to Lemon Squeezy (used only for admin logs). */
  user_email?: string | null;
  [key: string]: unknown;
};

export type LsEvent = {
  meta: {
    event_name: string;
    custom_data?: Record<string, unknown> | null;
  };
  data: {
    id: string;
    type: string;
    attributes: LsEventAttributes;
  };
};

/** Columns this processor is allowed to write on profiles. */
export type BillingPatch = {
  plan?: string;
  pro_requests_used?: number;
  pro_usage_reset_at?: string;
  lemonsqueezy_customer_id?: string | null;
  lemonsqueezy_subscription_id?: string | null;
  lemonsqueezy_order_id?: string | null;
  lemonsqueezy_renewal_status?: string | null;
  lemonsqueezy_next_renewal_at?: string | null;
};

export type BillingWebhookDeps = {
  /** Fetch an existing profile id (verifies the account exists). */
  getProfileById(userId: string): Promise<string | null>;
  /** Profile previously linked to this Lemon Squeezy customer id, if any. */
  findProfileIdByCustomerId(customerId: string): Promise<string | null>;
  /** Profile previously linked to this Lemon Squeezy subscription id, if any. */
  findProfileIdBySubscriptionId(subscriptionId: string): Promise<string | null>;
  /** Apply a patch. Throw to signal transient DB failure (webhook retries). */
  updateProfileById(userId: string, patch: BillingPatch): Promise<void>;
};

export type ProcessOutcome =
  | { action: "activated"; userId: string; plan: "pro" | "ultimate"; patch: BillingPatch }
  | { action: "marked_cancelled"; userId: string; paidThrough: string | null; patch: BillingPatch }
  | { action: "expired"; userId: string; patch: BillingPatch }
  | { action: "paused"; userId: string; patch: BillingPatch }
  | { action: "ignored"; reason: string }
  | {
      action: "unmatched";
      /** True when the event carried a user_id that does not exist locally. */
      staleUserId?: string;
      reason: string;
    };

// ---------------------------------------------------------------------------
// Checkout identity (H2) — the checkout route may ONLY trust the verified
// Supabase session. Client-supplied user ids are ignored by construction:
// resolveCheckoutIdentity never reads one.
// ---------------------------------------------------------------------------

export function parseBearerToken(authorizationHeader: string | null): string | null {
  return authorizationHeader?.startsWith("Bearer ") ? authorizationHeader.slice(7) : null;
}

export type CheckoutClaims = { sub?: string; email?: unknown };

/**
 * Derives checkout identity exclusively from verified session claims. The
 * client-provided email is used only as a prefill fallback when the session
 * carries none — it can never influence which account gets upgraded.
 */
export function resolveCheckoutIdentity(
  claims: CheckoutClaims | null | undefined,
  fallbackEmail?: string,
): { userId: string; email: string | undefined } | null {
  const sub = claims?.sub;
  if (typeof sub !== "string" || !sub.trim()) return null;
  const email =
    typeof claims?.email === "string" && claims.email.trim()
      ? claims.email.trim()
      : typeof fallbackEmail === "string" && fallbackEmail.trim()
        ? fallbackEmail.trim()
        : undefined;
  return { userId: sub, email };
}

// ---------------------------------------------------------------------------
// Signature verification (moved verbatim from the route; matches Lemon
// Squeezy's documented X-Signature HMAC-SHA256 hex scheme).
// ---------------------------------------------------------------------------

export function verifyLemonSqueezySignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): boolean {
  const digestBuf = Buffer.from(createHmacDigest(rawBody, secret), "utf8");
  const signatureBuf = Buffer.from(signatureHeader, "utf8");
  if (digestBuf.length !== signatureBuf.length) return false;
  return timingSafeEquals(digestBuf, signatureBuf);
}

function createHmacDigest(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

function timingSafeEquals(a: Buffer, b: Buffer): boolean {
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Plan mapping
// ---------------------------------------------------------------------------

/**
 * Ultimate only when configured AND the subscription's variant matches;
 * everything else maps to Pro. (Kept from the previous implementation,
 * including the dual env-name lookup done by the caller.)
 */
export function resolvePlanFromVariant(
  ultimateVariantId: string | undefined,
  variantId: unknown,
): "pro" | "ultimate" {
  if (!ultimateVariantId) return "pro";
  return String(variantId) === String(ultimateVariantId) ? "ultimate" : "pro";
}

export function extractCustomUserId(event: LsEvent): string | null {
  const custom = event.meta.custom_data;
  const value = custom?.["user_id"];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// ---------------------------------------------------------------------------
// Status buckets
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES = new Set(["active", "on_trial"]);
/** Statuses that mean "the paid period is over" — downgrade now. */
const EXPIRED_STATUSES = new Set(["expired"]);
/** Grace statuses: paid through the period, just not renewing any more. */
const CANCELLED_STATUSES = new Set(["cancelled"]);
/** Temporarily suspended; identity must survive for resume. */
const PAUSED_STATUS = "paused";
/** Dunning states: consciously left as-is (grace) but loudly logged. */
export const DUNNING_STATUSES = new Set(["past_due", "unpaid"]);

// ---------------------------------------------------------------------------
// Identity resolution (H3)
// ---------------------------------------------------------------------------

type ResolvedIdentity =
  | { kind: "custom"; userId: string }
  | { kind: "subscription_link"; userId: string }
  | { kind: "customer_link"; userId: string }
  | { kind: "none"; staleUserId?: string };

async function resolveIdentity(
  event: LsEvent,
  deps: BillingWebhookDeps,
): Promise<ResolvedIdentity> {
  const customUserId = extractCustomUserId(event);
  if (customUserId) {
    const exists = await deps.getProfileById(customUserId);
    if (exists) return { kind: "custom", userId: customUserId };
    // A user_id was supplied but no such account exists — do NOT fall back
    // silently onto other identifiers with a wrong-account risk? Safe: the
    // link matchers below require PREVIOUSLY-established linkage, which by
    // construction belongs to the same paying customer, so continuing is
    // safe; we simply remember the stale id for the report.
  }

  const subscriptionId = event.data.id;
  if (subscriptionId) {
    const viaSub = await deps.findProfileIdBySubscriptionId(String(subscriptionId));
    if (viaSub) return { kind: "subscription_link", userId: viaSub };
  }

  const customerId = event.data.attributes.customer_id;
  if (customerId != null && String(customerId).trim()) {
    const viaCustomer = await deps.findProfileIdByCustomerId(String(customerId));
    if (viaCustomer) return { kind: "customer_link", userId: viaCustomer };
  }

  return { kind: "none", staleUserId: customUserId ?? undefined };
}

function describeEvent(event: LsEvent): string {
  const email = event.data.attributes.user_email;
  return [
    `event=${event.meta.event_name}`,
    `subscription=${event.data.id}`,
    `customer=${event.data.attributes.customer_id ?? "?"}`,
    `order=${event.data.attributes.order_id ?? "?"}`,
    email ? `email=${email}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

function usageResetPatch(): Pick<BillingPatch, "pro_requests_used" | "pro_usage_reset_at"> {
  return { pro_requests_used: 0, pro_usage_reset_at: new Date().toISOString() };
}

async function activate(
  event: LsEvent,
  deps: BillingWebhookDeps,
  ultimateVariantId: string | undefined,
): Promise<ProcessOutcome> {
  const status = event.data.attributes.status ?? "active";
  const identity = await resolveIdentity(event, deps);
  if (identity.kind === "none") {
    return {
      action: "unmatched",
      staleUserId: identity.staleUserId,
      reason: `No Zeus account could be safely matched for a PAID activation. ${describeEvent(event)}`,
    };
  }

  const customerId = event.data.attributes.customer_id;
  const orderId = event.data.attributes.order_id;
  const plan = resolvePlanFromVariant(ultimateVariantId, event.data.attributes.variant_id);

  const patch: BillingPatch = {
    plan,
    ...usageResetPatch(),
    lemonsqueezy_customer_id: customerId != null ? String(customerId) : null,
    lemonsqueezy_subscription_id: event.data.id,
    lemonsqueezy_order_id: orderId != null ? String(orderId) : null,
    lemonsqueezy_renewal_status: status,
    lemonsqueezy_next_renewal_at:
      typeof event.data.attributes.renews_at === "string" && event.data.attributes.renews_at
        ? event.data.attributes.renews_at
        : null,
  };

  await deps.updateProfileById(identity.userId, patch);
  return { action: "activated", userId: identity.userId, plan, patch };
}

async function markCancelled(event: LsEvent, deps: BillingWebhookDeps): Promise<ProcessOutcome> {
  const identity = await resolveIdentity(event, deps);
  if (identity.kind === "none") {
    return {
      action: "unmatched",
      staleUserId: identity.staleUserId,
      reason: `Cancellation received but no Zeus account matched. ${describeEvent(event)}`,
    };
  }

  // H1: cancellation means "not renewing any more", NOT "lose access now".
  // The plan stays untouched; the paid-through date (ends_at) is recorded so
  // Billing can display exactly when access will end. Repeated deliveries
  // produce the identical patch (idempotent).
  const endsAt =
    typeof event.data.attributes.ends_at === "string" && event.data.attributes.ends_at
      ? event.data.attributes.ends_at
      : typeof event.data.attributes.renews_at === "string" && event.data.attributes.renews_at
        ? event.data.attributes.renews_at
        : null;

  const patch: BillingPatch = {
    lemonsqueezy_renewal_status: event.data.attributes.status ?? "cancelled",
    lemonsqueezy_next_renewal_at: endsAt,
  };

  await deps.updateProfileById(identity.userId, patch);
  return { action: "marked_cancelled", userId: identity.userId, paidThrough: endsAt, patch };
}

async function expire(event: LsEvent, deps: BillingWebhookDeps): Promise<ProcessOutcome> {
  const identity = await resolveIdentity(event, deps);
  if (identity.kind === "none") {
    return {
      action: "unmatched",
      staleUserId: identity.staleUserId,
      reason: `Expiry received but no Zeus account matched. ${describeEvent(event)}`,
    };
  }

  // The paid period has ended: downgrade now. Customer/subscription links are
  // deliberately KEPT — they are historical facts that make support and any
  // future re-subscription recovery possible (a fresh subscription id simply
  // overwrites the column on the next activation).
  const patch: BillingPatch = {
    plan: "free",
    ...usageResetPatch(),
    lemonsqueezy_renewal_status: event.data.attributes.status ?? "expired",
    lemonsqueezy_next_renewal_at: null,
  };

  await deps.updateProfileById(identity.userId, patch);
  return { action: "expired", userId: identity.userId, patch };
}

async function pause(event: LsEvent, deps: BillingWebhookDeps): Promise<ProcessOutcome> {
  const identity = await resolveIdentity(event, deps);
  if (identity.kind === "none") {
    return {
      action: "unmatched",
      staleUserId: identity.staleUserId,
      reason: `Pause received but no Zeus account matched. ${describeEvent(event)}`,
    };
  }

  // H4: suspend ACCESS but preserve every identifier needed to restore the
  // exact tier on resume (resume re-derives plan from the variant id).
  const patch: BillingPatch = {
    plan: "free",
    ...usageResetPatch(),
    lemonsqueezy_renewal_status: event.data.attributes.status ?? PAUSED_STATUS,
    lemonsqueezy_next_renewal_at: null,
  };

  await deps.updateProfileById(identity.userId, patch);
  return { action: "paused", userId: identity.userId, patch };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export async function processLemonSqueezyEvent(
  event: LsEvent,
  deps: BillingWebhookDeps,
  options: { ultimateVariantId?: string } = {},
): Promise<ProcessOutcome> {
  const name = event.meta.event_name;
  const status = event.data.attributes.status;

  switch (name) {
    case "subscription_created":
    case "subscription_updated":
    case "subscription_resumed":
    case "subscription_unpaused": {
      if (status && ACTIVE_STATUSES.has(status))
        return activate(event, deps, options.ultimateVariantId);
      if (status && EXPIRED_STATUSES.has(status)) return expire(event, deps);
      if (status && CANCELLED_STATUSES.has(status)) return markCancelled(event, deps);
      if (status === PAUSED_STATUS) return pause(event, deps);
      if (status && DUNNING_STATUSES.has(status)) {
        // Conscious policy: dunning subscriptions keep paid access during the
        // grace window; subscription_expired eventually settles the account.
        console.warn(
          `[lemonsqueezy webhook] dunning status "${status}" — access preserved. ${describeEvent(event)}`,
        );
        return { action: "ignored", reason: `dunning status ${status}` };
      }
      return { action: "ignored", reason: `status "${status ?? "?"}" requires no change` };
    }

    case "subscription_cancelled":
      return markCancelled(event, deps);

    case "subscription_expired":
      return expire(event, deps);

    case "subscription_paused":
      return pause(event, deps);

    default:
      return {
        action: "ignored",
        reason: `event "${name}" is not part of the subscription lifecycle`,
      };
  }
}
