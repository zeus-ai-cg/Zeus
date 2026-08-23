// Gated VS Code extension download.
//
// The .vsix is a Pro/Ultimate perk: Free accounts get the desktop app only.
// This route authenticates the caller (Bearer token, same scheme as
// /api/chat), reads their plan straight from `profiles`, and either 302s to
// the hosted artifact or returns a machine-readable error the download page
// can act on ({ error: "auth_required" | "upgrade_required" | "not_configured" }).
//
// The file itself lives outside the web deployment (Supabase Storage or any
// static host) so we never stream megabytes through the serverless function.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { isProOrAbove, normalizePlan } from "@/lib/plans";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export const Route = createFileRoute("/api/download/vsix")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = process.env.ZEUS_VSIX_URL;
          if (!url) {
            console.error("[download.vsix] not_configured: ZEUS_VSIX_URL is not set");
            return json(
              { error: "not_configured", message: "Extension download is not available yet." },
              503,
            );
          }

          const auth = request.headers.get("authorization") ?? "";
          const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
          if (!token) return json({ error: "auth_required" }, 401);

          const SUPABASE_URL = process.env.SUPABASE_URL!;
          const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
          const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });

          const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
          const userId = claimsData?.claims?.sub;
          if (claimsErr || !userId) return json({ error: "auth_required" }, 401);

          const { data: profile, error: profileErr } = await supabase
            .from("profiles")
            .select("plan")
            .eq("id", userId)
            .maybeSingle();
          if (profileErr) throw profileErr;

          const tier = normalizePlan(profile?.plan ?? undefined);
          console.info("[download.vsix] eligibility", { userId, tier });
          if (!isProOrAbove(tier)) return json({ error: "upgrade_required", plan: tier }, 403);

          return new Response(null, {
            status: 302,
            headers: { Location: url, "Cache-Control": "no-store" },
          });
        } catch (error) {
          console.error("[download.vsix] failed", error);
          return json({ error: "server_error" }, 500);
        }
      },
    },
  },
});
