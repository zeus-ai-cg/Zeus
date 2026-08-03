import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveModel } from "./model-resolution.server";
import { getProvider } from "./model-providers";
import { computeLineDiff } from "./diff";

const KIND_PROMPTS: Record<string, string> = {
  commit_message:
    "Write a single, well-formed git commit message for this diff (a concise summary line under 72 characters, optionally followed by a blank line and a short body explaining why). Return only the commit message text.",
  pr_description:
    "Write a pull request description for this diff: a short summary, a bulleted list of changes, and a 'Testing' section describing how this could be verified. Use Markdown.",
  changelog:
    "Write a single Keep a Changelog-style entry (Added/Changed/Fixed/Removed as applicable) summarizing this diff for a CHANGELOG.md.",
  release_notes:
    "Write user-facing release notes for this diff — plain language, no implementation detail, focused on what changed for the end user.",
  explain_diff:
    "Explain this diff in plain language: what changed, why it likely changed, and anything a reviewer should pay close attention to.",
};

const MAX_DIFF_CHARS = 40_000;

function buildUnifiedDiffText(
  files: { path: string; action: string; before: string; after: string }[],
): string {
  let remaining = MAX_DIFF_CHARS;
  const parts: string[] = [];
  for (const f of files) {
    if (remaining <= 0) {
      parts.push("\n[...additional file diffs omitted for length...]");
      break;
    }
    let body = "";
    if (f.action === "create") {
      body = f.after
        .split("\n")
        .map((l) => `+${l}`)
        .join("\n");
    } else if (f.action === "delete") {
      body = f.before
        .split("\n")
        .map((l) => `-${l}`)
        .join("\n");
    } else {
      const { ops, truncated } = computeLineDiff(f.before, f.after);
      body = truncated
        ? "(large file — line diff omitted)"
        : ops
            .filter((op) => op.type !== "same")
            .map((op) => `${op.type === "add" ? "+" : "-"}${op.line}`)
            .join("\n");
    }
    const chunk = `\n--- ${f.path} (${f.action}) ---\n${body}`.slice(0, remaining);
    parts.push(chunk);
    remaining -= chunk.length;
  }
  return parts.join("\n");
}

export const generateGitArtifact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        modificationId: z.string().uuid(),
        kind: z.enum([
          "commit_message",
          "pr_description",
          "changelog",
          "release_notes",
          "explain_diff",
        ]),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: mod, error } = await supabase
      .from("workspace_modifications")
      .select("summary, instructions, files")
      .eq("id", data.modificationId)
      .single();
    if (error || !mod) throw new Error("Modification not found");

    const diffText = buildUnifiedDiffText(
      mod.files as { path: string; action: string; before: string; after: string }[],
    );

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

    const { text } = await generateText({
      model,
      system:
        "You are a precise technical writer producing git/version-control artifacts from a real code diff. Be concise and accurate — never invent changes not present in the diff.",
      prompt: `Change summary: ${mod.summary}\nOriginal request: ${mod.instructions}\n\nDIFF:\n${diffText}\n\n---\n\n${KIND_PROMPTS[data.kind]}`,
    });

    return { kind: data.kind, text };
  });
