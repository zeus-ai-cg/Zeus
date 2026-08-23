import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  processLemonSqueezyEvent,
  verifyLemonSqueezySignature,
  type BillingPatch,
  type BillingWebhookDeps,
  type LsEvent,
} from "@/lib/lemonsqueezy-webhook.server";

// ---------------------------------------------------------------------------
// Lemon Squeezy webhook handler (thin wrapper).
//
// All decision logic lives in src/lib/lemonsqueezy-webhook.server.ts — see
// the header comment there for the billing semantics (H1 cancellation keeps
// paid access until expiry, H3 safe identity recovery, H4 pause/resume
// preserving subscription identity, per-branch idempotency).
//
// This route remains the ONLY code path allowed to set profiles.plan to
// "pro"/"ultimate": it runs with the service role (supabaseAdmin), which
// bypasses the protect_privileged_profile_columns trigger added in
// supabase/migrations/20260725120000_lock_down_profile_privileges.sql and
// extended in 20260803090000_billing_details_and_engineer_lock.sql. Every
// request is verified against Lemon Squeezy's HMAC signature before any
// database write.
//
// Configure in Lemon Squeezy: Settings → Webhooks → POST {domain}/api/webhooks,
// subscribed to at least: subscription_created, subscription_updated,
// subscription_cancelled, subscription_expired, subscription_resumed,
// subscription_paused, subscription_unpaused. Copy the "Signing secret" into
// LEMONSQUEEZY_WEBHOOK_SECRET.
// ---------------------------------------------------------------------------

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Wire the pure processor to the real database. */
const deps: BillingWebhookDeps = {
  async getProfileById(userId) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    return data ? String((data as { id: string }).id) : null;
  },

  async findProfileIdBySubscriptionId(subscriptionId) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("lemonsqueezy_subscription_id", subscriptionId)
      .limit(2);
    if (!data || data.length === 0) return null;
    if (data.length > 1) {
      console.error(
        `[lemonsqueezy webhook] MULTIPLE profiles share subscription ${subscriptionId} (${data.map((d) => (d as { id: string }).id).join(", ")}) — using the first; investigate this data conflict.`,
      );
    }
    return String((data[0] as { id: string }).id);
  },

  async findProfileIdByCustomerId(customerId) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("lemonsqueezy_customer_id", customerId)
      .limit(2);
    if (!data || data.length === 0) return null;
    if (data.length > 1) {
      console.error(
        `[lemonsqueezy webhook] MULTIPLE profiles share customer ${customerId} (${data.map((d) => (d as { id: string }).id).join(", ")}) — using the first; investigate this data conflict.`,
      );
    }
    return String((data[0] as { id: string }).id);
  },

  async updateProfileById(userId, patch: BillingPatch) {
    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", userId);
    if (error) throw error;
  },
};

export const Route = createFileRoute("/api/webhooks")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
        if (!secret) {
          console.error(
            "[lemonsqueezy webhook] LEMONSQUEEZY_WEBHOOK_SECRET is not set — rejecting all events.",
          );
          return json({ error: "not_configured" }, 500);
        }

        const signature = request.headers.get("x-signature");
        if (!signature) {
          return json({ error: "missing_signature" }, 400);
        }

        // Signature is computed over the exact raw request body — must be
        // read as text before any JSON.parse.
        const rawBody = await request.text();
        if (!verifyLemonSqueezySignature(rawBody, signature, secret)) {
          console.error("[lemonsqueezy webhook] signature verification failed");
          return json({ error: "invalid_signature" }, 401);
        }

        let event: LsEvent;
        try {
          event = JSON.parse(rawBody);
        } catch {
          return json({ error: "invalid_json" }, 400);
        }

        try {
          const outcome = await processLemonSqueezyEvent(event, deps, {
            ultimateVariantId:
              process.env.LEMONSQUEEZY_ULTIMATE_VARIANT_ID ||
              process.env.LEMONSQUEEZY_VARIANT_ID_ULTIMATE,
          });

          if (outcome.action === "unmatched") {
            // H3: never guess an account match. Surface the failure loudly so
            // an administrator can link the account manually (set the
            // profile's lemonsqueezy_customer_id/subscription_id to the ids
            // below, then redeliver the event from Lemon Squeezy's dashboard)
            // and so the event shows up as failing in Lemon Squeezy's own
            // delivery log (non-2xx triggers their retry policy).
            console.error(
              `[BILLING-ACTION-REQUIRED] lemonsqueezy webhook could not identify the account — manual recovery needed. ${outcome.reason}` +
                (outcome.staleUserId ? ` stale custom_data.user_id="${outcome.staleUserId}".` : ""),
            );
            return json({ error: "unmatched_subscription" }, 500);
          }

          if (outcome.action !== "ignored") {
            console.info(`[lemonsqueezy webhook] ${outcome.action} | user=${outcome.userId}`);
          }
        } catch (error) {
          console.error("[lemonsqueezy webhook] handler error", error);
          // Surface 500 for genuine failures so Lemon Squeezy's retry policy
          // kicks in, rather than silently swallowing a transient DB failure.
          return json({ error: "processing_failed" }, 500);
        }

        return json({ ok: true }, 200);
      },
    },
  },
});
