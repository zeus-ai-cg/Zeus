import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------------------------------------------------------------------------
// Lemon Squeezy webhook handler. Replaces the old Paddle handler
// (src/routes/api/webhooks/paddle.ts, now removed) — Zeus AI's payment
// processor is Lemon Squeezy.
//
// This is the ONLY code path in the app that is allowed to set
// profiles.plan to "pro"/"ultimate" — it runs with the service role
// (supabaseAdmin), which bypasses the protect_privileged_profile_columns
// trigger added in supabase/migrations/20260725120000_lock_down_profile_privileges.sql,
// and every request is verified against Lemon Squeezy's HMAC signature
// before any database write happens. See src/lib/profile.functions.ts for
// the client side of this fix (completeOnboarding / setPlan can only ever
// self-service DOWN to "free", never up).
//
// Configure in Lemon Squeezy: Settings → Webhooks → add a webhook pointing
// at POST {your domain}/api/webhooks, subscribed to at least:
// subscription_created, subscription_updated, subscription_cancelled,
// subscription_expired, subscription_resumed. Copy the "Signing secret"
// into LEMONSQUEEZY_WEBHOOK_SECRET.
//
// IMPORTANT: this has been implemented against Lemon Squeezy's publicly
// documented webhook signing scheme and payload shape, but has not been
// exercised against a live Lemon Squeezy account from this environment (no
// network access here to Lemon Squeezy's dashboard/API). Send a test event
// from Lemon Squeezy's webhook simulator and confirm it flips a test
// user's plan before relying on this in production.
// ---------------------------------------------------------------------------

function verifyLemonSqueezySignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): boolean {
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  const digestBuf = Buffer.from(digest, "utf8");
  const signatureBuf = Buffer.from(signatureHeader, "utf8");
  if (digestBuf.length !== signatureBuf.length) return false;
  return timingSafeEqual(digestBuf, signatureBuf);
}

type LemonSqueezyEvent = {
  meta: {
    event_name: string;
    custom_data?: Record<string, unknown> | null;
  };
  data: {
    id: string;
    type: string;
    attributes: {
      status?: string;
      customer_id?: number | string;
      variant_id?: number | string;
      [key: string]: unknown;
    };
  };
};

function extractUserId(event: LemonSqueezyEvent): string | null {
  const custom = event.meta.custom_data;
  return custom && typeof custom["user_id"] === "string" ? (custom["user_id"] as string) : null;
}

// Feature 7 — Zeus Ultimate is a second, independent Lemon Squeezy variant.
// Only ever returns "ultimate" if an Ultimate variant id is configured AND
// the subscription's variant ID matches it; every other case — env var
// unset, variant ID missing, no match — falls back to "pro". Deployments
// that never configure Ultimate are unaffected.
//
// Bug fixed here: this used to read ONLY `LEMONSQUEEZY_VARIANT_ID_ULTIMATE`.
// The checkout route (src/routes/api/lemonsqueezy/checkout.ts) and
// .env.example both treat `LEMONSQUEEZY_ULTIMATE_VARIANT_ID` as the primary
// name and `LEMONSQUEEZY_VARIANT_ID_ULTIMATE` as the backward-compatible
// alias — but only the alias was ever actually read here, so a deployment
// configured with just the primary name (the common case) silently
// resolved every Ultimate purchase as "pro" instead. Check both.
function resolvePlanFromEvent(event: LemonSqueezyEvent): "pro" | "ultimate" {
  const ultimateVariantId =
    process.env.LEMONSQUEEZY_ULTIMATE_VARIANT_ID || process.env.LEMONSQUEEZY_VARIANT_ID_ULTIMATE;
  if (!ultimateVariantId) return "pro";
  const variantId = event.data.attributes.variant_id;
  return String(variantId) === String(ultimateVariantId) ? "ultimate" : "pro";
}

// Subscription attributes also carry order_id, status, and renews_at —
// required (per the production spec) to be stored alongside plan/customer
// id/subscription id so Billing can show real renewal info instead of a
// guess. All three are optional/defensive since Lemon Squeezy's payload
// shape for these can vary slightly by event type.
function extractOrderId(event: LemonSqueezyEvent): string | null {
  const orderId = event.data.attributes["order_id"];
  return orderId != null ? String(orderId) : null;
}

function extractRenewsAt(event: LemonSqueezyEvent): string | null {
  const renewsAt = event.data.attributes["renews_at"];
  return typeof renewsAt === "string" && renewsAt ? renewsAt : null;
}

export const Route = createFileRoute("/api/webhooks")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
        if (!secret) {
          console.error(
            "[lemonsqueezy webhook] LEMONSQUEEZY_WEBHOOK_SECRET is not set — rejecting all events.",
          );
          return new Response(JSON.stringify({ error: "not_configured" }), { status: 500 });
        }

        const signature = request.headers.get("x-signature");
        if (!signature) {
          return new Response(JSON.stringify({ error: "missing_signature" }), { status: 400 });
        }

        // Signature is computed over the exact raw request body — must
        // read as text before any JSON.parse.
        const rawBody = await request.text();
        if (!verifyLemonSqueezySignature(rawBody, signature, secret)) {
          console.error("[lemonsqueezy webhook] signature verification failed");
          return new Response(JSON.stringify({ error: "invalid_signature" }), { status: 401 });
        }

        let event: LemonSqueezyEvent;
        try {
          event = JSON.parse(rawBody);
        } catch {
          return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400 });
        }

        try {
          switch (event.meta.event_name) {
            case "subscription_created":
            case "subscription_updated":
            case "subscription_resumed":
            case "subscription_unpaused": {
              const status = event.data.attributes.status;
              // subscription_updated fires for lots of non-plan-changing
              // reasons too (card updated, name changed, ...) — only
              // (re)activate on statuses that mean "this subscription is
              // actually live." Anything else falls through to the
              // cancelled/expired branch below, which no-ops if the
              // subscription id isn't found.
              if (status !== "active" && status !== "on_trial") break;

              const userId = extractUserId(event);
              if (!userId) {
                console.error(
                  "[lemonsqueezy webhook] no custom_data.user_id on",
                  event.meta.event_name,
                );
                break;
              }
              const { error } = await supabaseAdmin
                .from("profiles")
                .update({
                  plan: resolvePlanFromEvent(event),
                  pro_requests_used: 0,
                  pro_usage_reset_at: new Date().toISOString(),
                  lemonsqueezy_customer_id:
                    event.data.attributes.customer_id != null
                      ? String(event.data.attributes.customer_id)
                      : null,
                  lemonsqueezy_subscription_id: event.data.id,
                  lemonsqueezy_order_id: extractOrderId(event),
                  lemonsqueezy_renewal_status: status,
                  lemonsqueezy_next_renewal_at: extractRenewsAt(event),
                })
                .eq("id", userId);
              if (error) throw error;
              break;
            }

            case "subscription_cancelled":
            case "subscription_expired":
            case "subscription_paused": {
              const subscriptionId = event.data.id;
              if (!subscriptionId) break;
              const cancelledStatus = event.data.attributes.status ?? event.meta.event_name;
              const { error } = await supabaseAdmin
                .from("profiles")
                .update({
                  plan: "free",
                  pro_requests_used: 0,
                  pro_usage_reset_at: new Date().toISOString(),
                  lemonsqueezy_customer_id: null,
                  lemonsqueezy_subscription_id: null,
                  lemonsqueezy_order_id: null,
                  lemonsqueezy_renewal_status: cancelledStatus,
                  lemonsqueezy_next_renewal_at: null,
                })
                .eq("lemonsqueezy_subscription_id", subscriptionId);
              if (error) throw error;
              break;
            }

            default:
              // Ignore everything else (order_created, license_key_created,
              // etc.) — the subscription_* lifecycle events above are
              // sufficient to gate access.
              break;
          }
        } catch (error) {
          console.error("[lemonsqueezy webhook] handler error", error);
          // Surface 500 for genuine failures so Lemon Squeezy's retry
          // policy kicks in, rather than silently swallowing a transient
          // DB failure with a 200.
          return new Response(JSON.stringify({ error: "processing_failed" }), { status: 500 });
        }

        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    },
  },
});
