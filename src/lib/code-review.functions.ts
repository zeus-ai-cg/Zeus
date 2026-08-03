import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveModel } from "./model-resolution.server";
import { getProvider } from "./model-providers";

const reviewSchema = z.object({
  overallAssessment: z.string().describe("2-3 sentence overall assessment of this change."),
  findings: z
    .array(
      z.object({
        file: z.string(),
        severity: z.enum(["info", "suggestion", "warning", "critical"]),
        category: z.enum([
          "security",
          "performance",
          "readability",
          "maintainability",
          "bestPractices",
          "bug",
        ]),
        issue: z.string().describe("What the issue is, one or two sentences."),
        suggestion: z.string().describe("A concrete suggested improvement."),
      }),
    )
    .max(25),
});

export const reviewProjectModification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ modificationId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: mod, error } = await supabase
      .from("workspace_modifications")
      .select("summary, instructions, files")
      .eq("id", data.modificationId)
      .single();
    if (error || !mod) throw new Error("Modification not found");

    const files = mod.files as { path: string; action: string; after: string }[];
    let remaining = 50_000;
    const parts: string[] = [];
    for (const f of files) {
      if (f.action === "delete" || remaining <= 0) continue;
      const chunk = `\n\n===== ${f.path} =====\n${f.after}`.slice(0, remaining);
      parts.push(chunk);
      remaining -= chunk.length;
    }

    const resolution = await resolveActiveModel(supabase, userId);
    if (!resolution.apiKey) {
      const label = getProvider(resolution.provider)?.label ?? resolution.provider;
      throw new Error(`No API key configured for ${label}. Add one in Settings → AI Models.`);
    }

    let model;
    const providerInfo = getProvider(resolution.provider);
    if (resolution.provider === "gemini")
      model = createGoogleGenerativeAI({ apiKey: resolution.apiKey })(resolution.modelId);
    else if (resolution.provider === "anthropic")
      model = createAnthropic({ apiKey: resolution.apiKey })(resolution.modelId);
    else if (providerInfo?.openAiCompatible)
      model = createOpenAI({
        apiKey: resolution.apiKey,
        baseURL: providerInfo.openAiCompatible.baseURL,
      })(resolution.modelId);
    else model = createOpenAI({ apiKey: resolution.apiKey })(resolution.modelId);

    const { object } = await generateObject({
      model,
      schema: reviewSchema,
      system:
        "You are a meticulous senior code reviewer. Review the following changed files for security, performance, readability, maintainability, best practices, and potential bugs. Be specific and only flag genuine issues — don't pad the list with nitpicks to seem thorough.",
      prompt: `Change: ${mod.summary}\nOriginal request: ${mod.instructions}\n\nCHANGED FILES (final content):${parts.join("")}`,
    });

    return object;
  });
