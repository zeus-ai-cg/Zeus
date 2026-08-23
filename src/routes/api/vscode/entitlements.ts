import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { normalizePlan, isProOrAbove, PLAN_LABELS } from "@/lib/plans";

/**
 * GET /api/vscode/entitlements
 *
 * Server-side entitlement verification for the Zeus AI VS Code extension.
 *
 * This is the single enforcement point for the product rule: only paid
 * (Pro/Ultimate) users may use the extension's AI/project features.
 *
 * Security model (mirrors /api/chat exactly):
 *   - Bearer JWT from the Authorization header
 *   - Token validated by Supabase (`auth.getClaims`)
 *   - Profile read through an RLS-scoped client using the user's own token,
 *     so a user can only ever read their own plan row
 *   - `profiles.plan` is server-owned: RLS triggers force `plan := old.plan`
 *     for authenticated writes; only the Lemon Squeezy webhook (service role)
 *     can change it. A client can therefore never self-upgrade.
 *
 * The response contains ONLY the plan tier and derived booleans — no tokens,
 * no subscription ids, no billing internals.
 */
export const Route = createFileRoute("/api/vscode/entitlements")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
          if (!token) {
            return new Response(
              JSON.stringify({ error: "unauthorized", message: "Unauthorized" }),
              { status: 401, headers: { "Content-Type": "application/json" } },
            );
          }

          const SUPABASE_URL = process.env.SUPABASE_URL!;
          const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
          const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
          if (claimsErr || !claimsData?.claims?.sub) {
            return new Response(
              JSON.stringify({ error: "unauthorized", message: "Unauthorized" }),
              { status: 401, headers: { "Content-Type": "application/json" } },
            );
          }
          const userId = claimsData.claims.sub;

          // RLS-scoped read of the user's own profile row.
          const { data: profile, error: profileErr } = await supabase
            .from("profiles")
            .select("plan")
            .eq("id", userId)
            .maybeSingle();
          if (profileErr) throw profileErr;

          const plan = normalizePlan(profile?.plan);
          return new Response(
            JSON.stringify({
              ok: true,
              plan,
              label: PLAN_LABELS[plan],
              entitled: isProOrAbove(plan),
              checkedAt: new Date().toISOString(),
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (err) {
          console.error("[entitlements] lookup failed:", err);
          return new Response(
            JSON.stringify({
              error: "entitlement_lookup_failed",
              message: "Could not verify your plan. Try again.",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
