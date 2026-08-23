import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveModel } from "./model-resolution.server";
import { getProvider } from "./model-providers";

// ---------------------------------------------------------------------------
// IMPORTANT: this generates a command suggestion only. It never executes
// anything server-side. Running arbitrary shell commands against arbitrary
// uploaded user projects in a shared, multi-tenant backend would be a
// remote-code-execution hole â€” there's no sandboxing infrastructure in this
// app to do that safely, so the honest and safe scope for "AI Terminal" here
// is: explain the exact command, why it's the right one, and what could go
// wrong, and let the user run it themselves.
// ---------------------------------------------------------------------------

const commandSchema = z.object({
  command: z.string().describe("The exact shell command to run."),
  explanation: z
    .string()
    .describe("What this command does and why it's the right one for the request."),
  risks: z
    .array(z.string())
    .describe(
      "Concrete things that could go wrong (data loss, breaking changes, irreversible actions). Empty array if genuinely low-risk.",
    ),
  riskLevel: z.enum(["low", "medium", "high"]),
});

export const generateTerminalCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z
      .object({ projectId: z.string().uuid().optional(), request: z.string().min(1).max(500) })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    let projectContext = "";
    if (data.projectId) {
      const { data: project } = await supabase
        .from("workspace_projects")
        .select("name, framework, primary_language")
        .eq("id", data.projectId)
        .maybeSingle();
      if (project) {
        projectContext = `Project: "${project.name}" (${project.framework ?? "unknown framework"}${project.primary_language ? `, ${project.primary_language}` : ""}).`;
      }
    }

    const resolution = await resolveActiveModel(supabase, userId);
    if (!resolution.apiKey) {
      const label = getProvider(resolution.provider)?.label ?? resolution.provider;
      throw new Error(`No API key configured for ${label}. Add one in Settings â†’ AI Models.`);
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
      schema: commandSchema,
      system:
        "You translate a developer's natural-language request into the single most appropriate shell command for their project. Prefer safe, standard, well-known commands. Flag anything destructive or irreversible clearly in risks.",
      prompt: `${projectContext}\n\nRequest: ${data.request}`,
    });

    return object;
  });
