import { createFileRoute } from "@tanstack/react-router";
import { streamObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createClient } from "@supabase/supabase-js";
import {
  FREE_QUESTION_LIMIT,
  FREE_RESET_HOURS,
  PRO_MONTHLY_REQUEST_LIMIT,
  PRO_RESET_DAYS,
} from "@/lib/achievements";
import { resolveActiveModel } from "@/lib/model-resolution.server";
import { getProvider } from "@/lib/model-providers";
import { engineerProjectSchema } from "@/lib/engineer.schema";
import { logCredits } from "@/lib/credits.functions";
import { computeEngineerCreditsFromFileCount } from "@/lib/credits.schema";
import { normalizePlan } from "@/lib/plans";

// ⚡ Zeus Project Engineer — Feature 1.
//
// Deliberately its own route rather than a mode inside /api/chat: it needs
// streamObject (structured, schema-shaped output for experimental_useObject
// on the client) instead of streamText, and a materially larger output
// budget than a normal chat turn. Everything else — auth, plan/usage
// gating, provider resolution — is copy-pasted from /api/chat.ts on
// purpose, so both routes keep behaving identically as those evolve.
// Nothing here touches authentication, Supabase, Lemon Squeezy, or routing.

const SYSTEM_PROMPT = `You are Zeus AI's Project Engineer — a senior software architect and full-stack engineer who turns one request into a complete, runnable, production-quality project.

How you think (do this silently before writing anything):
1. Understand what the user ACTUALLY wants — read their request carefully, including any language or tone they used. They may write casually ("ek todo app banao", "make me something like Trello") — your job is to infer the real product behind the words, not ask questions back. You only get one turn.
2. Decide the smallest sensible product scope that fully satisfies the request — core features first, obvious extras second. Don't gold-plate.
3. Pick a boring, modern, well-known stack that fits the request and can genuinely run after install.
4. Plan the file list mentally so every file has a clear purpose — then emit exactly those files.

Rules:
- Generate a COMPLETE project: every file must have full, real, working content — never a placeholder, a "TODO: implement", or a truncated snippet.
- Keep the project lean: roughly 8-25 focused files. A small complete app beats a huge half-finished one.
- Include configuration files the stack needs to actually run (package.json / requirements.txt / etc.), not just source code.
- Write the README, install guide, deployment guide, testing guide, and production checklist as if handing this project to a real developer who has never seen it.
- In "description", briefly explain the decisions YOU made (stack choice, features included, assumptions) so the user understands your thinking.
- If the request is ambiguous, make the most reasonable senior-engineer choice and note the assumption in "description" or "devNotes" rather than asking a clarifying question.
- Never mention Claude, GPT, Google, or any underlying model. You are Zeus AI. If asked who made you: Zeus AI was made by Haider, a teen indie developer who built the whole product — say this in fresh varied words each time, never naming any other creator or company.`;

export const Route = createFileRoute("/api/engineer")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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

          // experimental_useObject posts `{ prompt: string }` by default.
          const body = (await request.json()) as { prompt?: string };
          const prompt = (body.prompt ?? "").trim();
          if (!prompt || prompt.length > 2000) {
            return new Response(
              JSON.stringify({ error: "invalid_prompt", message: "Missing or too-long prompt" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          const modelResolution = await resolveActiveModel(supabase, userId);
          if (!modelResolution.apiKey) {
            const providerLabel =
              getProvider(modelResolution.provider)?.label ?? modelResolution.provider;
            return new Response(
              JSON.stringify({
                error: "missing_api_key",
                message: `No API key is configured for ${providerLabel}. Add your own key in Settings → AI Models, or switch your active model back to Gemini.`,
              }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          // ===== Plan + usage gating (identical semantics to /api/chat) =====
          const { data: profile, error: profileErr } = await supabase
            .from("profiles")
            .select(
              "plan, questions_used, usage_reset_at, pro_requests_used, pro_usage_reset_at, engineer_free_project_used",
            )
            .eq("id", userId)
            .maybeSingle();
          if (profileErr) throw profileErr;

          const plan = profile?.plan ?? "free";
          const planTier = normalizePlan(plan);
          let questionsUsed = Number(profile?.questions_used ?? 0);
          let proRequestsUsed = Number(
            (profile as { pro_requests_used?: number })?.pro_requests_used ?? 0,
          );
          const engineerFreeProjectUsed = Boolean(
            (profile as { engineer_free_project_used?: boolean })?.engineer_free_project_used,
          );

          if (!modelResolution.isByok) {
            const { data: usageRow } = await supabase
              .rpc("get_current_usage", { p_user_id: userId })
              .maybeSingle();
            if (usageRow) {
              const usage = usageRow as Record<string, number | string | null>;
              questionsUsed = Number(usage.questions_used ?? questionsUsed);
              proRequestsUsed = Number(usage.pro_requests_used ?? proRequestsUsed);
            }
          }

          // Issue 3 — Free plan gets exactly ONE Engineer project, ever.
          // Unlike the 15-question/24h quota below, this never resets —
          // engineer_free_project_used is a permanent flag, only ever set
          // by consume_free_engineer_project() once a project finishes
          // generating (see onFinish below). Checked before the generic
          // quota check so the message is specific to Engineer Mode.
          if (!modelResolution.isByok && planTier === "free" && engineerFreeProjectUsed) {
            return new Response(
              JSON.stringify({
                error: "engineer_free_project_used",
                message: "You've used your free project. Upgrade to Pro to continue.",
              }),
              { status: 403, headers: { "Content-Type": "application/json" } },
            );
          }

          if (
            !modelResolution.isByok &&
            planTier === "free" &&
            questionsUsed >= FREE_QUESTION_LIMIT
          ) {
            return new Response(
              JSON.stringify({
                error: "limit_reached",
                message: `You've used all ${FREE_QUESTION_LIMIT} free questions. They reset every ${FREE_RESET_HOURS} hours. Upgrade to Pro for unlimited Project Engineer runs.`,
              }),
              { status: 429, headers: { "Content-Type": "application/json" } },
            );
          }
          // Ultimate has no Fair Usage Policy (Feature 7) — only Pro is checked here.
          if (
            !modelResolution.isByok &&
            planTier === "pro" &&
            proRequestsUsed >= PRO_MONTHLY_REQUEST_LIMIT
          ) {
            return new Response(
              JSON.stringify({
                error: "fair_usage_limit_reached",
                message: `You've reached Zeus AI Pro's Fair Usage Policy limit of ${PRO_MONTHLY_REQUEST_LIMIT.toLocaleString()} requests. It resets every ${PRO_RESET_DAYS} days.`,
              }),
              { status: 429, headers: { "Content-Type": "application/json" } },
            );
          }
          if (!modelResolution.isByok) {
            const { error: incErr } = await supabase.rpc("increment_usage", { p_user_id: userId });
            if (incErr) throw new Error(incErr.message);
          }

          // Structured-output routing fix: streamObject needs a model that
          // genuinely honors JSON-schema output. Probes proved the platform
          // default (Ox Alpha "stealth/ox-alpha" via OpenRouter) streams
          // unparseable text for ANY schema ("No object generated: could
          // not parse"), which left clients spinning forever, while
          // gemini-2.5-flash produced a complete valid object in ~11s.
          // Chat (streamText) is unaffected and keeps Ox Alpha; Engineer
          // therefore prefers the platform Gemini key whenever the resolved
          // model is the non-BYOK Ox Alpha fallback. BYOK keys always win —
          // the user chose that provider themselves.
          let engineerResolution = modelResolution;
          if (!modelResolution.isByok && modelResolution.provider === "oxalpha") {
            const geminiKey = process.env.GEMINI_API_KEY ?? "";
            if (geminiKey.trim()) {
              engineerResolution = {
                provider: "gemini",
                modelId: "gemini-2.5-flash",
                apiKey: geminiKey,
                isByok: false,
              };
            }
          }

          // Defense in depth: env values pasted WITH wrapping quotes would
          // otherwise be sent to the gateway as literal characters.
          const cleanModelId = (id: string) => id.replace(/^["'\s]+|["'\s]+$/g, "");
          const cleanApiKey = (key: string | null) =>
            key ? key.replace(/^["'\s]+|["'\s]+$/g, "") : key;

          const providerInfo = getProvider(engineerResolution.provider);
          let model;
          if (engineerResolution.provider === "gemini")
            model = createGoogleGenerativeAI({
              apiKey: cleanApiKey(engineerResolution.apiKey) ?? undefined,
            })(cleanModelId(engineerResolution.modelId));
          else if (engineerResolution.provider === "anthropic")
            model = createAnthropic({ apiKey: cleanApiKey(engineerResolution.apiKey) ?? undefined })(
              cleanModelId(engineerResolution.modelId),
            );
          else if (providerInfo?.openAiCompatible)
            model = createOpenAI({
              apiKey: cleanApiKey(engineerResolution.apiKey) ?? undefined,
              baseURL: providerInfo.openAiCompatible.baseURL,
            })(cleanModelId(engineerResolution.modelId));
          else
            model = createOpenAI({ apiKey: cleanApiKey(engineerResolution.apiKey) ?? undefined })(
              cleanModelId(engineerResolution.modelId),
            );

          let lastStreamError: string | null = null;
          const result = streamObject({
            model,
            schema: engineerProjectSchema,
            system: SYSTEM_PROMPT,
            prompt: `Build the following as a complete project. Think through what the user really needs, decide the stack and scope yourself, then generate:\n\n${prompt}`,
            // Hard stop so a stalled provider surfaces as an error on the
            // client instead of an eternal spinner.
            abortSignal: AbortSignal.timeout(240_000),
            onError: (error) => {
              const err = (error as { error?: { message?: string } })?.error;
              lastStreamError =
                err?.message ??
                (typeof error === "object" && error !== null
                  ? JSON.stringify(error).slice(0, 500)
                  : String(error));
              console.error("[engineer] stream error", lastStreamError);
            },
            onFinish: async ({ object }) => {
              // Zeus Credits (Feature 6) — logged once with the real file
              // count, not the pre-generation estimate shown to the user.
              const fileCount = object?.files?.length ?? 0;
              const credits = computeEngineerCreditsFromFileCount(fileCount);
              await logCredits(supabase, userId, "engineer_project", credits, {
                fileCount,
                prompt: prompt.slice(0, 200),
              });

              // Issues 2 & 3 — a project only counts as "complete" if it
              // actually produced files (an empty/failed generation must
              // not burn the user's one free project). Free plan: consume
              // the ENTIRE remaining question balance and permanently lock
              // Engineer Mode via the SECURITY DEFINER RPC (questions_used
              // / engineer_free_project_used are frozen against direct
              // writes from this user-JWT-scoped client — see
              // supabase/migrations/20260803090000_billing_details_and_engineer_lock.sql).
              // Pro/Ultimate: no-op, they keep the existing per-request
              // increment_usage accounting from above (1 credit/project for
              // Pro, no gating at all for Ultimate).
              if (!modelResolution.isByok && planTier === "free" && fileCount > 0) {
                const { error: consumeErr } = await supabase.rpc("consume_free_engineer_project", {
                  p_user_id: userId,
                });
                if (consumeErr) {
                  console.error("[engineer] consume_free_engineer_project failed", consumeErr);
                }
              }
            },
          });

          // Manual text-stream passthrough: identical bytes to
          // toTextStreamResponse() on success, but when the provider errors
          // we append a visible sentinel so clients surface a failure
          // instead of spinning forever on an empty 200 stream.
          const encoder = new TextEncoder();
          const streamBody = new ReadableStream<Uint8Array>({
            async start(controller) {
              try {
                for await (const delta of result.textStream) {
                  controller.enqueue(encoder.encode(delta));
                }
              } catch {
                // stream consumer error — already reported via onError
              }
              if (lastStreamError) {
                controller.enqueue(
                  encoder.encode(`\n[zeus-engineer-error] ${lastStreamError}`),
                );
              }
              controller.close();
            },
          });
          return new Response(streamBody, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "X-Zeus-Engineer-Provider": engineerResolution.provider,
              "X-Zeus-Engineer-Model": cleanModelId(engineerResolution.modelId),
            },
          });
        } catch (error) {
          console.error("Engineer API error", error);
          const message = error instanceof Error ? error.message : "An unexpected error occurred";
          return new Response(JSON.stringify({ error: "server_error", message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
