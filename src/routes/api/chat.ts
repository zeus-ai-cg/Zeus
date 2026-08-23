import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createClient } from "@supabase/supabase-js";
import {
  FREE_QUESTION_LIMIT,
  FREE_RESET_HOURS,
  LEARNING_MODES,
  PRO_MONTHLY_REQUEST_LIMIT,
  PRO_RESET_DAYS,
  isLearningModeLocked,
} from "@/lib/achievements";
import { buildProjectContextBundle } from "@/lib/project-context";
import { resolveActiveModel } from "@/lib/model-resolution.server";
import { getProvider } from "@/lib/model-providers";
import { logCredits } from "@/lib/credits.functions";
import { FLAT_CREDIT_COSTS } from "@/lib/credits.schema";
import { normalizePlan } from "@/lib/plans";
import { detectPowerFeature } from "@/lib/power-features";

const isValidTimestamp = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms);
};

const normalizeTimestamp = (value: unknown): string =>
  isValidTimestamp(value) ? value : new Date().toISOString();

const BASE_PROMPT = `You are Zeus AI — not a single chatbot persona, but the combined voice of a senior software architect, a startup CTO, a hands-on engineer, a product designer, a DevOps expert, a QA engineer, and a mentor who's genuinely on the user's side. Professional. Fast. Confident. Practical. You sound like the most useful person on a great engineering team, not like a generic AI assistant — never mention Claude, ChatGPT, GPT, Anthropic, OpenAI, or any other underlying model or company; you are Zeus AI, full stop.

Mission: help developers understand, debug, build, and ship real code and real projects — clear, direct, and professional. Never insult or embarrass anyone. Celebrate progress. Bias toward the practical answer that actually ships over the theoretically complete one, and say so when you're making that tradeoff.

Personality — talk like a real human teammate, not a corporate manual:
- Warm and natural. Use occasional emojis (1-2 max) where they fit the mood — celebrate wins 🎉, flag warnings ⚠️ — but never decorate every line; technical answers stay mostly clean.
- If the user is joking or being funny, laugh along and play back the joke briefly before getting to work. Match their energy instead of staying stiff.
- Mirror the user's language naturally: if they write in Roman Urdu/Hindi ("banao", "kaise karun", "yaar ye error aa raha"), reply in the same Roman Urdu/Hindi style they used. Same for any other language — Spanish, Arabic, French, whatever they use, use it back. Code, identifiers, and error messages stay in English.
- Keep it friendly but never sloppy about the actual engineering.

You work across all major languages and stacks (Python, JS/TS, Java, C/C++, C#, Go, Rust, PHP, Ruby, Swift, Kotlin, Dart, R, SQL, Bash; HTML/CSS/Tailwind, React, Next.js, Vue, Angular, Node, Express; Flutter, React Native, Android, iOS; ML/DL/NLP/CV; AWS, GCP, Azure, Docker, Kubernetes, CI/CD).

Structure when explaining a concept or change:
1. Explanation
2. Example
3. Code Sample (in a fenced code block with the correct language tag)
4. Common Pitfalls
5. Suggested Next Step

Always format code in fenced code blocks. Be multilingual: reply in the user's language and style. Be direct, clear, and helpful — skip preamble and hedging; lead with the answer, then the reasoning if it's needed.

Image understanding: When the user attaches an image (code screenshot, terminal output, build/runtime error, UI mockup, flowchart, diagram), carefully read every visible token. Transcribe the relevant code, identify errors, explain the root cause step by step, then provide a corrected code block. For UI screenshots, describe the layout and suggest implementation. Never claim you cannot see the image.

File attachments: When the user attaches a code, text, PDF, or document file, treat its contents as authoritative context. Analyze, debug, explain, and improve it as requested. When they say "continue", "fix this", "optimize it", or "explain again", use the existing conversation and attached content — never restart.

Editing limitation: You can analyze uploaded files or an imported workspace project and explain exactly what changes are needed, including code snippets, but you cannot directly modify the user's workspace or uploaded project files from this chat turn. If they phrase a request as a short, direct instruction on an attached project ("Add Stripe", "Dark Mode", "Convert to Next.js"), Zeus AI's Smart Continue system handles it separately and this prompt won't even run. For anything that reaches you as a normal chat message, explain the needed changes clearly with code snippets, then point them to the Workspace or Feature Generator to actually apply changes. Never claim you edited or saved a file when you did not.

Identity: You are Zeus AI. Always refer to yourself as "Zeus AI". Never call yourself "your coding assistant" or reintroduce yourself. Greet the user only on the very first message of a brand-new conversation (when there are no prior assistant messages) with a short, warm greeting like "Hey, Zeus AI here." — then get straight to the answer. On every subsequent turn, skip greetings entirely and continue the conversation naturally.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
          if (!token)
            return new Response(
              JSON.stringify({ error: "unauthorized", message: "Unauthorized" }),
              { status: 401, headers: { "Content-Type": "application/json" } },
            );

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

          const body = (await request.json()) as { messages: UIMessage[]; threadId?: string };
          const messages = body.messages ?? [];
          const threadId = body.threadId;
          if (!threadId)
            return new Response(
              JSON.stringify({ error: "missing_thread_id", message: "Missing threadId" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );

          const { data: thread, error: threadErr } = await supabase
            .from("threads")
            .select("id, title, workspace_project_id")
            .eq("id", threadId)
            .maybeSingle();
          if (threadErr) throw threadErr;
          if (!thread)
            return new Response(
              JSON.stringify({ error: "not_found", message: "Thread not found" }),
              { status: 404, headers: { "Content-Type": "application/json" } },
            );

          // ===== Multi-model resolution (Phase 4: BYOK) =====
          // Determines which provider/model this user has active and whether
          // they've supplied their own API key for it. BYOK requests bypass
          // Zeus AI's own usage quota below since they aren't costing the
          // platform anything.
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

          // ===== Plan + usage gating =====
          // Skipped entirely for BYOK requests — see note above.
          const { data: profile, error: profileErr } = await supabase
            .from("profiles")
            .select(
              "plan, questions_used, usage_reset_at, learning_mode, coding_style, response_length, creativity_level",
            )
            .eq("id", userId)
            .maybeSingle();
          if (profileErr) throw profileErr;

          const plan = profile?.plan ?? "free";
          const planTier = normalizePlan(plan);
          let questions_used = Number(profile?.questions_used ?? 0);
          let usage_reset_at = normalizeTimestamp(profile?.usage_reset_at);
          let pro_requests_used = Number(
            (profile as { pro_requests_used?: number })?.pro_requests_used ?? 0,
          );
          let pro_usage_reset_at = normalizeTimestamp(
            (profile as { pro_usage_reset_at?: string })?.pro_usage_reset_at,
          );

          // Rolling reset for both the free 12h window and the Pro 30-day Fair
          // Usage window, done in one atomic call. `profiles.plan`,
          // `questions_used`, `pro_requests_used`, etc. are protected against
          // direct client/user-JWT writes (see
          // supabase/migrations/20260725120000_lock_down_profile_privileges.sql),
          // so this SECURITY DEFINER RPC is the only way to apply a reset.
          if (!modelResolution.isByok) {
            const { data: usageRow, error: usageErr } = await supabase
              .rpc("get_current_usage", { p_user_id: userId })
              .maybeSingle();
            if (usageErr) throw usageErr;
            if (usageRow) {
              const usage = usageRow as Record<string, number | string | null>;
              questions_used = Number(usage.questions_used ?? questions_used);
              usage_reset_at = normalizeTimestamp(usage.usage_reset_at ?? usage_reset_at);
              pro_requests_used = Number(usage.pro_requests_used ?? pro_requests_used);
              pro_usage_reset_at = normalizeTimestamp(
                usage.pro_usage_reset_at ?? pro_usage_reset_at,
              );
            }
          }

          if (
            !modelResolution.isByok &&
            planTier === "free" &&
            questions_used >= FREE_QUESTION_LIMIT
          ) {
            const resetAt = new Date(
              new Date(usage_reset_at).getTime() + FREE_RESET_HOURS * 3600 * 1000,
            );
            return new Response(
              JSON.stringify({
                error: "limit_reached",
                message: `You've used all ${FREE_QUESTION_LIMIT} free questions. They reset at ${resetAt.toISOString()}. Upgrade to Pro for unlimited questions.`,
                reset_at: resetAt.toISOString(),
              }),
              { status: 429, headers: { "Content-Type": "application/json" } },
            );
          }

          // ===== Pro Fair Usage Policy =====
          // Pro is "very high limits", not literally unlimited — this stops a
          // single account from hammering the Gemini API with tens of
          // thousands of scripted requests. Resets automatically every
          // PRO_RESET_DAYS days (applied above via get_current_usage); limits
          // live in src/lib/achievements.ts. Zeus Ultimate (Feature 7) is
          // deliberately exempt — "No Fair Usage Policy" is one of its
          // selling points — so this only runs for planTier === "pro".
          if (planTier === "pro" && !modelResolution.isByok) {
            if (pro_requests_used >= PRO_MONTHLY_REQUEST_LIMIT) {
              const resetAt = new Date(
                new Date(pro_usage_reset_at).getTime() + PRO_RESET_DAYS * 24 * 3600 * 1000,
              );
              return new Response(
                JSON.stringify({
                  error: "fair_usage_limit_reached",
                  message: `You've reached Zeus AI Pro's Fair Usage Policy limit of ${PRO_MONTHLY_REQUEST_LIMIT.toLocaleString()} requests for this billing cycle. Your limit resets on ${resetAt.toLocaleDateString()}. Need a higher limit? Reach out to Haidersiddique0909@gmail.com.`,
                  reset_at: resetAt.toISOString(),
                }),
                { status: 429, headers: { "Content-Type": "application/json" } },
              );
            }
          }

          const lastUser = [...messages].reverse().find((m) => m.role === "user");
          if (lastUser) {
            const { error: insertErr } = await supabase.from("messages").insert({
              thread_id: threadId,
              user_id: userId,
              role: "user",
              parts: lastUser.parts as unknown as object,
            });
            if (insertErr) throw insertErr;

            if (thread.title === "New conversation") {
              const text =
                lastUser.parts
                  .map((p) => ("text" in p ? (p as { text: string }).text : ""))
                  .join(" ")
                  .trim()
                  .slice(0, 60) || "New conversation";
              const { error: titleErr } = await supabase
                .from("threads")
                .update({ title: text })
                .eq("id", threadId);
              if (titleErr) throw titleErr;
            } else {
              const { error: updateErr } = await supabase
                .from("threads")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", threadId);
              if (updateErr) throw updateErr;
            }

            // Atomically increment usage (free-tier questions_used, or Pro's
            // pro_requests_used) via a single-statement Postgres UPDATE (see
            // supabase/migrations/20260706090000_atomic_usage_increment.sql).
            // If this fails, abort so the prompt cannot complete without a
            // reliable counter increment. Skipped for BYOK requests — those
            // don't draw against Zeus AI's own quota.
            if (!modelResolution.isByok) {
              const { data: incrementData, error: incrementError } = await supabase.rpc(
                "increment_usage",
                { p_user_id: userId },
              );
              if (incrementError) {
                // No direct-update fallback here on purpose: profiles.questions_used
                // / pro_requests_used are now protected against writes from the
                // authenticated role (see
                // supabase/migrations/20260725120000_lock_down_profile_privileges.sql),
                // so a direct .update() would silently no-op rather than actually
                // record usage. Fail loudly instead — a missing increment_usage
                // function means the migrations are out of date and need to be run.
                throw new Error(incrementError.message);
              } else if (
                !incrementData ||
                (Array.isArray(incrementData)
                  ? incrementData.length === 0
                  : Object.keys(incrementData).length === 0)
              ) {
                throw new Error("Usage counter update failed");
              }
            }

            const { error: activeDateErr } = await supabase
              .from("profiles")
              .update({ last_active_date: new Date().toISOString().slice(0, 10) })
              .eq("id", userId);
            if (activeDateErr) throw activeDateErr;

            // Zeus Credits (Feature 6) — informational usage ledger, logged
            // best-effort. Does not gate access; profiles.questions_used /
            // pro_requests_used above is still the real quota. BYOK requests
            // still get logged here since the user is still *using* Zeus
            // AI's Engineer tooling, even though it doesn't draw against the
            // platform's own model quota.
            try {
              const isDebugMode = (profile?.learning_mode ?? "beginner") === "debug";
              const creditCost = isDebugMode
                ? FLAT_CREDIT_COSTS.chat_debug
                : FLAT_CREDIT_COSTS.chat_message;
              await logCredits(
                supabase,
                userId,
                isDebugMode ? "chat_debug" : "chat_message",
                creditCost,
                { threadId },
              );
            } catch (error) {
              console.warn("Failed to log credits for chat message", error);
            }
          }

          const requestedModeValue = profile?.learning_mode ?? "beginner";
          const effectiveModeValue = isLearningModeLocked(requestedModeValue, plan)
            ? "beginner"
            : requestedModeValue;
          const mode =
            LEARNING_MODES.find((m) => m.value === effectiveModeValue) ??
            LEARNING_MODES.find((m) => m.value === "beginner")!;
          let systemPrompt = `${BASE_PROMPT}\n\nActive learning mode: ${mode.label}. ${mode.systemHint}`;
          const responseLength = profile?.response_length ?? "balanced";
          const codingStyle = profile?.coding_style ?? "idiomatic";
          const creativityLevel = profile?.creativity_level ?? "balanced";
          if (
            responseLength !== "balanced" ||
            codingStyle !== "idiomatic" ||
            creativityLevel !== "balanced"
          ) {
            systemPrompt += `\n\nUser preferences: response length "${responseLength}", coding style "${codingStyle}", creativity "${creativityLevel}". Adjust explanations and any code you write to match.`;
          }

          const queryText =
            lastUser?.parts
              .map((p) => ("text" in p ? (p as { text: string }).text : ""))
              .join(" ") ?? "";

          // Feature 11 — Hidden Power Features. Deliberately not advertised
          // anywhere in the UI beyond a small "detected" chip on the
          // composer (see ChatWindow.tsx) — discovery is meant to happen by
          // typing a natural phrase, not picking from a menu. See
          // src/lib/power-features.ts for the full rationale.
          const powerFeature = detectPowerFeature(queryText);
          if (powerFeature) {
            systemPrompt += `\n\n---\n${powerFeature.instructions}`;
          }

          if (thread.workspace_project_id) {
            try {
              const projectContext = await buildProjectContextBundle(
                supabase,
                thread.workspace_project_id,
                queryText,
              );
              if (projectContext) {
                systemPrompt += `\n\n---\nPROJECT-AWARE MODE\n\n${projectContext}`;
              }
            } catch (e) {
              // Fail open: a broken/deleted project's context should never
              // take down chat for the thread it's attached to.
              console.error("project context build failed", e);
            }
          }

          const providerInfo = getProvider(modelResolution.provider);
          let model;
          if (modelResolution.provider === "gemini") {
            const google = createGoogleGenerativeAI({ apiKey: modelResolution.apiKey });
            model = google(modelResolution.modelId);
          } else if (modelResolution.provider === "anthropic") {
            const anthropic = createAnthropic({ apiKey: modelResolution.apiKey });
            model = anthropic(modelResolution.modelId);
          } else if (providerInfo?.openAiCompatible) {
            const openaiCompatible = createOpenAI({
              apiKey: modelResolution.apiKey,
              baseURL: providerInfo.openAiCompatible.baseURL,
            });
            model = openaiCompatible(modelResolution.modelId);
          } else {
            const openai = createOpenAI({ apiKey: modelResolution.apiKey });
            model = openai(modelResolution.modelId);
          }

          const result = streamText({
            model,
            system: systemPrompt,
            messages: await convertToModelMessages(messages),
          });

          return result.toUIMessageStreamResponse({
            originalMessages: messages,
            onFinish: async ({ responseMessage }) => {
              try {
                await supabase.from("messages").insert({
                  thread_id: threadId,
                  user_id: userId,
                  role: "assistant",
                  parts: responseMessage.parts as unknown as object,
                });
                await supabase
                  .from("threads")
                  .update({ updated_at: new Date().toISOString() })
                  .eq("id", threadId);
              } catch (e) {
                console.error("persist assistant", e);
              }
            },
            onError: (error) => {
              console.error("Chat stream error", error);
              const message =
                error instanceof Error ? error.message : "An unexpected error occurred";
              if (message.includes("429"))
                return "Rate limit reached. Please slow down and try again shortly.";
              if (message.includes("402"))
                return "Gemini API credits exhausted. Please check your Google AI billing settings.";
              return message;
            },
          });
        } catch (error) {
          console.error("Chat API error", error);
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
