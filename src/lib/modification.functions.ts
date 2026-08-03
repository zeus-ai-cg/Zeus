import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FREE_QUESTION_LIMIT, FREE_RESET_HOURS } from "./achievements";
import { buildFolderTree, type TreeNode } from "./workspace.functions";
import { diffStats } from "./diff";
import { resolveActiveModel } from "./model-resolution.server";
import { getProvider } from "./model-providers";
import { logCredits } from "./credits.functions";
import { FLAT_CREDIT_COSTS } from "./credits.schema";
import { isProOrAbove } from "./plans";

const CANDIDATE_FILE_CONTENT_BUDGET = 90_000;
const MAX_SCORED_CANDIDATES = 40;
const MIN_CANDIDATES_BEFORE_FALLBACK = 10;
const MAX_TOTAL_CANDIDATES = 30;

const ALWAYS_INCLUDE_BASENAMES = new Set([
  "readme.md",
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "go.mod",
  "cargo.toml",
  "composer.json",
  "pubspec.yaml",
  "tsconfig.json",
  "tailwind.config.js",
  "tailwind.config.ts",
]);

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "to",
  "of",
  "in",
  "on",
  "for",
  "and",
  "or",
  "with",
  "my",
  "this",
  "that",
  "please",
  "can",
  "you",
  "make",
  "add",
  "it",
]);

function extractKeywords(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9_]+/)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
    ),
  ].slice(0, 15);
}

function scorePath(path: string, keywords: string[]): number {
  const lower = path.toLowerCase();
  let score = 0;
  for (const kw of keywords) if (lower.includes(kw)) score += 3;
  return score;
}

function renderTreeText(node: TreeNode, depth = 0, budget = { remaining: 3000 }): string {
  if (budget.remaining <= 0) return "";
  const lines: string[] = [];
  if (node.name !== "/") {
    const line = `${"  ".repeat(depth)}${node.type === "folder" ? "d" : "-"} ${node.name}\n`;
    if (line.length > budget.remaining) return "…(truncated)\n";
    lines.push(line);
    budget.remaining -= line.length;
  }
  const children = [...(node.children ?? [])].sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : 1,
  );
  for (const c of children) {
    if (budget.remaining <= 0) {
      lines.push("…(truncated)\n");
      break;
    }
    lines.push(renderTreeText(c, node.name === "/" ? depth : depth + 1, budget));
  }
  return lines.join("");
}

const modificationSchema = z.object({
  summary: z.string().describe("2-4 sentence human-readable summary of what changed and why."),
  files: z
    .array(
      z.object({
        path: z.string(),
        action: z.enum(["create", "modify", "delete"]),
        reason: z.string().describe("One sentence: why this file needed to change."),
        content: z
          .string()
          .optional()
          .describe("Full new file contents. Required for create/modify, omitted for delete."),
      }),
    )
    .max(40),
});

const SYSTEM_PROMPT = `You are Zeus AI, an expert software engineer modifying a real, existing project on behalf of a user.

Rules:
- Only touch files that genuinely need to change for the requested feature/fix. Do not rewrite unrelated files.
- For "modify", always return the file's COMPLETE new content, not a snippet or diff.
- For "create", give complete new file contents for a new file.
- For "delete", omit "content".
- Preserve existing code style, formatting conventions, and architecture already visible in the provided files.
- If the request is ambiguous, make the most reasonable choice and note the assumption in "summary" rather than asking a clarifying question.
- Never invent files you were not shown unless you are creating a genuinely new file the feature requires.
- Never mention Claude, GPT, or any underlying model. You are Zeus AI.`;

async function selectCandidateFiles(
  supabase: SupabaseClient,
  projectId: string,
  instructions: string,
): Promise<{ path: string; size: number }[]> {
  const { data: fileList } = await supabase
    .from("workspace_project_files")
    .select("path, size")
    .eq("project_id", projectId);
  const files = (fileList ?? []) as { path: string; size: number }[];

  const keywords = extractKeywords(instructions);
  const priority = files.filter((f) =>
    ALWAYS_INCLUDE_BASENAMES.has(f.path.split("/").pop()!.toLowerCase()),
  );
  const priorityPaths = new Set(priority.map((f) => f.path));

  const scored = files
    .filter((f) => !priorityPaths.has(f.path))
    .map((f) => ({ ...f, score: scorePath(f.path, keywords) }))
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SCORED_CANDIDATES);

  let candidates = [...priority, ...scored];

  if (candidates.length < MIN_CANDIDATES_BEFORE_FALLBACK) {
    const chosenPaths = new Set(candidates.map((f) => f.path));
    const fallback = files
      .filter((f) => !chosenPaths.has(f.path))
      .sort(
        (a, b) =>
          a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path),
      )
      .slice(0, MAX_TOTAL_CANDIDATES - candidates.length);
    candidates = [...candidates, ...fallback];
  }

  return candidates.slice(0, MAX_TOTAL_CANDIDATES);
}

export const proposeProjectModification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ projectId: z.string().uuid(), instructions: z.string().min(1).max(4000) }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // Multi-model resolution (Phase 4/7): use the user's active
    // provider/model and their own key if they've set one, matching chat.
    const modelResolution = await resolveActiveModel(supabase, userId);
    if (!modelResolution.apiKey) {
      const providerLabel =
        getProvider(modelResolution.provider)?.label ?? modelResolution.provider;
      throw new Error(
        `No API key configured for ${providerLabel}. Add one in Settings → AI Models, or switch your active model back to Gemini.`,
      );
    }

    // Same free/pro question quota as chat and Connectors — modification
    // proposals are a model call like any other and must count against it,
    // never a way to bypass usage limits. Skipped for BYOK requests, same
    // as chat.
    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "plan, questions_used, usage_reset_at, coding_style, response_length, creativity_level",
      )
      .eq("id", userId)
      .maybeSingle();
    const plan = profile?.plan ?? "free";
    const questionsUsed = Number(profile?.questions_used ?? 0);
    const usageResetAt = profile?.usage_reset_at ?? new Date().toISOString();
    if (!modelResolution.isByok && !isProOrAbove(plan)) {
      const resetMs = new Date(usageResetAt).getTime() + FREE_RESET_HOURS * 3600 * 1000;
      if (Date.now() < resetMs && questionsUsed >= FREE_QUESTION_LIMIT) {
        throw new Error(
          `You've used all ${FREE_QUESTION_LIMIT} free questions. They reset every ${FREE_RESET_HOURS} hours. Upgrade to Pro for unlimited questions.`,
        );
      }
    }
    if (!modelResolution.isByok) {
      const { error: usageErr } = await supabase.rpc("increment_usage", { p_user_id: userId });
      if (usageErr && usageErr.code !== "42883" && usageErr.code !== "42703")
        throw new Error(usageErr.message);
    }

    const { data: project, error: projectErr } = await supabase
      .from("workspace_projects")
      .select("id, name, framework, primary_language, folder_tree")
      .eq("id", data.projectId)
      .single();
    if (projectErr || !project) throw new Error("Project not found");

    const candidates = await selectCandidateFiles(supabase, data.projectId, data.instructions);
    let contentsBundle = "";
    if (candidates.length > 0) {
      const { data: files, error: filesErr } = await supabase
        .from("workspace_project_files")
        .select("path, content")
        .eq("project_id", data.projectId)
        .in(
          "path",
          candidates.map((c) => c.path),
        );
      if (filesErr) throw new Error(filesErr.message);
      let remaining = CANDIDATE_FILE_CONTENT_BUDGET;
      const parts: string[] = [];
      for (const f of files ?? []) {
        if (remaining <= 0) break;
        const chunk = `\n\n===== ${f.path} =====\n${f.content}`.slice(0, remaining);
        parts.push(chunk);
        remaining -= chunk.length;
      }
      contentsBundle = parts.join("");
    }

    let model;
    const providerInfo = getProvider(modelResolution.provider);
    if (modelResolution.provider === "gemini")
      model = createGoogleGenerativeAI({ apiKey: modelResolution.apiKey })(modelResolution.modelId);
    else if (modelResolution.provider === "anthropic")
      model = createAnthropic({ apiKey: modelResolution.apiKey })(modelResolution.modelId);
    else if (providerInfo?.openAiCompatible)
      model = createOpenAI({
        apiKey: modelResolution.apiKey,
        baseURL: providerInfo.openAiCompatible.baseURL,
      })(modelResolution.modelId);
    else model = createOpenAI({ apiKey: modelResolution.apiKey })(modelResolution.modelId);

    let system = SYSTEM_PROMPT;
    const responseLength = profile?.response_length ?? "balanced";
    const codingStyle = profile?.coding_style ?? "idiomatic";
    const creativityLevel = profile?.creativity_level ?? "balanced";
    if (
      responseLength !== "balanced" ||
      codingStyle !== "idiomatic" ||
      creativityLevel !== "balanced"
    ) {
      system += `\n\nUser preferences: response length "${responseLength}", coding style "${codingStyle}", creativity "${creativityLevel}". Reflect these in the code you write and in "summary"/"reason" text.`;
    }

    const { object } = await generateObject({
      model,
      schema: modificationSchema,
      system,
      prompt: `Project: "${project.name}" (${project.framework ?? "unknown framework"}${project.primary_language ? `, ${project.primary_language}` : ""})\n\nFOLDER STRUCTURE:\n${renderTreeText(project.folder_tree as TreeNode)}\n\nFILE CONTENTS:${contentsBundle}\n\n---\n\nChange request: ${data.instructions}`,
    });

    // Authoritative "before" content for every path the model touched,
    // regardless of whether it happened to be in the candidate set sent
    // to the model (guards against the model referencing a path we didn't
    // show it).
    const touchedPaths = object.files.map((f) => f.path);
    const beforeMap = new Map<string, string>();
    if (touchedPaths.length > 0) {
      const { data: existing } = await supabase
        .from("workspace_project_files")
        .select("path, content")
        .eq("project_id", data.projectId)
        .in("path", touchedPaths);
      for (const f of existing ?? []) beforeMap.set(f.path, f.content);
    }

    const filesWithDiff = object.files.map((f) => {
      const before = beforeMap.get(f.path) ?? "";
      const after = f.action === "delete" ? "" : (f.content ?? "");
      const stats =
        f.action === "delete" || !before
          ? {
              added: after ? after.split("\n").length : 0,
              removed: before ? before.split("\n").length : 0,
              truncated: false,
            }
          : diffStats(before, after);
      return {
        path: f.path,
        action: f.action,
        reason: f.reason,
        before,
        after,
        added: stats.added,
        removed: stats.removed,
        diffTruncated: "truncated" in stats ? stats.truncated : false,
      };
    });

    const { data: modification, error: insertErr } = await supabase
      .from("workspace_modifications")
      .insert({
        project_id: data.projectId,
        user_id: userId,
        instructions: data.instructions,
        summary: object.summary,
        status: "proposed",
        files: filesWithDiff,
      })
      .select("*")
      .single();
    if (insertErr) throw new Error(insertErr.message);

    // Zeus Credits (Feature 6) — informational only, see credit_ledger migration.
    await logCredits(supabase, userId, "feature_generate", FLAT_CREDIT_COSTS.feature_generate, {
      projectId: data.projectId,
    });

    return modification;
  });

export const applyProjectModification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;

    const { data: mod, error: modErr } = await supabase
      .from("workspace_modifications")
      .select("*")
      .eq("id", data.id)
      .single();
    if (modErr || !mod) throw new Error("Modification not found");
    if (mod.status === "applied") throw new Error("This modification was already applied.");

    const files = mod.files as {
      path: string;
      action: "create" | "modify" | "delete";
      after: string;
    }[];

    for (const f of files) {
      if (f.action === "delete") {
        const { error } = await supabase
          .from("workspace_project_files")
          .delete()
          .eq("project_id", mod.project_id)
          .eq("path", f.path);
        if (error) throw new Error(error.message);
      } else {
        const size = new TextEncoder().encode(f.after).length;
        const { error } = await supabase
          .from("workspace_project_files")
          .upsert(
            { project_id: mod.project_id, path: f.path, content: f.after, size },
            { onConflict: "project_id,path" },
          );
        if (error) throw new Error(error.message);
      }
    }

    // Recompute project metadata (file count, size, folder tree) from the
    // authoritative file list now that changes have landed.
    const { data: allFiles, error: allErr } = await supabase
      .from("workspace_project_files")
      .select("path, size")
      .eq("project_id", mod.project_id);
    if (allErr) throw new Error(allErr.message);

    const totalBytes = (allFiles ?? []).reduce(
      (sum: number, f: { size: number }) => sum + f.size,
      0,
    );
    const folderTree = buildFolderTree(allFiles ?? []);

    const { error: projErr } = await supabase
      .from("workspace_projects")
      .update({
        file_count: (allFiles ?? []).length,
        total_bytes: totalBytes,
        folder_tree: folderTree,
        project_map: null,
        health_score: null,
      })
      .eq("id", mod.project_id);
    if (projErr) throw new Error(projErr.message);

    const { data: updatedMod, error: updateErr } = await supabase
      .from("workspace_modifications")
      .update({ status: "applied", applied_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("*")
      .single();
    if (updateErr) throw new Error(updateErr.message);

    return updatedMod;
  });

export const rollbackProjectModification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;

    const { data: mod, error: modErr } = await supabase
      .from("workspace_modifications")
      .select("*")
      .eq("id", data.id)
      .single();
    if (modErr || !mod) throw new Error("Modification not found");
    if (mod.status !== "applied")
      throw new Error("Only an applied modification can be rolled back.");

    const files = mod.files as {
      path: string;
      action: "create" | "modify" | "delete";
      before: string;
    }[];

    for (const f of files) {
      if (f.action === "create") {
        // Undo a create by deleting the file it added.
        const { error } = await supabase
          .from("workspace_project_files")
          .delete()
          .eq("project_id", mod.project_id)
          .eq("path", f.path);
        if (error) throw new Error(error.message);
      } else {
        // Undo a modify/delete by restoring its prior content.
        const size = new TextEncoder().encode(f.before).length;
        const { error } = await supabase
          .from("workspace_project_files")
          .upsert(
            { project_id: mod.project_id, path: f.path, content: f.before, size },
            { onConflict: "project_id,path" },
          );
        if (error) throw new Error(error.message);
      }
    }

    const { data: allFiles, error: allErr } = await supabase
      .from("workspace_project_files")
      .select("path, size")
      .eq("project_id", mod.project_id);
    if (allErr) throw new Error(allErr.message);

    const totalBytes = (allFiles ?? []).reduce(
      (sum: number, f: { size: number }) => sum + f.size,
      0,
    );
    const folderTree = buildFolderTree(allFiles ?? []);

    const { error: projErr } = await supabase
      .from("workspace_projects")
      .update({
        file_count: (allFiles ?? []).length,
        total_bytes: totalBytes,
        folder_tree: folderTree,
        project_map: null,
        health_score: null,
      })
      .eq("id", mod.project_id);
    if (projErr) throw new Error(projErr.message);

    const { data: updatedMod, error: updateErr } = await supabase
      .from("workspace_modifications")
      .update({ status: "proposed", applied_at: null })
      .eq("id", data.id)
      .select("*")
      .single();
    if (updateErr) throw new Error(updateErr.message);

    return updatedMod;
  });

export const listProjectModifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ projectId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("workspace_modifications")
      .select("id, instructions, summary, status, created_at, applied_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getProjectModification = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("workspace_modifications")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
