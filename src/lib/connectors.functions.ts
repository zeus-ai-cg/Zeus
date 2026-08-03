import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FREE_QUESTION_LIMIT, FREE_RESET_HOURS } from "./achievements";
import { isProOrAbove } from "./plans";

const MAX_TOTAL_CONTENT_CHARS = 150_000; // keeps context links + AI prompts small/fast
const MAX_FILES = 40;

const fileSchema = z.object({
  name: z.string().min(1).max(300),
  content: z.string().max(60_000),
});

function buildProjectBundle(files: { name: string; content: string }[]): string {
  let remaining = MAX_TOTAL_CONTENT_CHARS;
  const parts: string[] = [];
  for (const file of files.slice(0, MAX_FILES)) {
    if (remaining <= 0) {
      parts.push(`\n\n[...truncated — project too large to include every file...]`);
      break;
    }
    const chunk = `\n\n// ===== ${file.name} =====\n${file.content}`.slice(0, remaining);
    parts.push(chunk);
    remaining -= chunk.length;
  }
  return parts.join("").trim();
}

function generateToken(): string {
  // Base64url random token — unguessable, URL-safe, no external deps.
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Creates a public, read-only "project context" snapshot. The returned URL
 * (/context/$token) can be pasted into Claude, ChatGPT, or any tool that
 * can fetch a URL, so it can read the same project context Zeus AI has.
 */
export const createProjectContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        projectName: z.string().min(1).max(120).default("My Project"),
        files: z.array(fileSchema).min(1).max(MAX_FILES),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const content = buildProjectBundle(data.files);
    const token = generateToken();

    const { data: row, error } = await context.supabase
      .from("project_contexts")
      .insert({ user_id: context.userId, token, project_name: data.projectName, content })
      .select("id, token, project_name, created_at")
      .single();
    if (error) throw new Error(error.message);

    return row;
  });

export const listProjectContexts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("project_contexts")
      .select("id, token, project_name, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deleteProjectContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("project_contexts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ZEUS_EDIT_SYSTEM_PROMPT = `You are Zeus AI, an intelligent coding assistant built into the Zeus AI platform.

You are reviewing an uploaded project and a change request from the user. Respond as Zeus AI: direct, practical, and encouraging — like a sharp senior engineer pairing with the user. Do not mention or imitate any other AI assistant, product, or company; do not adopt any other assistant's tone, phrasing, or self-description. You are your own product.

For every file that needs to change:
1. State the file name as a heading.
2. Explain briefly what you changed and why.
3. Give the complete updated file contents in a fenced code block with the correct language tag (the user will copy this directly back into their project).

If a change is ambiguous, make the most reasonable choice and note the assumption in one line rather than asking a clarifying question.`;

/**
 * "Upload your project and tell Zeus AI what to change." Runs against the
 * same Gemini backend as chat (GEMINI_API_KEY, server-side only) and
 * counts against the same free/pro question quota as regular chat, so it
 * can't be used to bypass usage limits.
 */
export const editProjectWithZeusAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        files: z.array(fileSchema).min(1).max(MAX_FILES),
        instructions: z.string().min(1).max(4000),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("plan, questions_used, usage_reset_at")
      .eq("id", userId)
      .maybeSingle();

    const plan = profile?.plan ?? "free";
    const questionsUsed = Number(profile?.questions_used ?? 0);
    const usageResetAt = profile?.usage_reset_at ?? new Date().toISOString();

    if (!isProOrAbove(plan)) {
      const resetMs = new Date(usageResetAt).getTime() + FREE_RESET_HOURS * 3600 * 1000;
      const stillWithinWindow = Date.now() < resetMs;
      if (stillWithinWindow && questionsUsed >= FREE_QUESTION_LIMIT) {
        throw new Error(
          `You've used all ${FREE_QUESTION_LIMIT} free questions. They reset every ${FREE_RESET_HOURS} hours. Upgrade to Pro for unlimited questions.`,
        );
      }
    }

    const { error: usageErr } = await supabase.rpc("increment_usage", { p_user_id: userId });
    if (usageErr && usageErr.code !== "42883" && usageErr.code !== "42703") {
      throw new Error(usageErr.message);
    }

    const bundle = buildProjectBundle(data.files);
    const google = createGoogleGenerativeAI({ apiKey });
    const model = google("gemini-2.5-flash");

    const { text } = await generateText({
      model,
      system: ZEUS_EDIT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Here is my project:\n\n${bundle}\n\n---\n\nWhat I want changed: ${data.instructions}`,
        },
      ],
    });

    return { response: text };
  });
