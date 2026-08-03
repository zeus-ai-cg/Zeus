import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Builds the text block that gets appended to the chat system prompt when a
// thread is attached to an indexed Workspace project (see
// workspace.functions.ts). Kept as a plain function (not a createServerFn)
// so it can be called directly from routes/api/chat.ts, which manages its
// own Supabase client for streaming responses.
//
// This is intentionally a cheap heuristic, not real embeddings-based
// retrieval — it's a starting point for Feature 7 (Smart Context Engine)
// later, not the final version of it.
// ---------------------------------------------------------------------------

const TREE_TEXT_CHAR_BUDGET = 4_000;
const FILE_CONTENT_CHAR_BUDGET = 60_000;
const MAX_RELEVANT_FILES = 24;

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
]);

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "to",
  "of",
  "in",
  "on",
  "for",
  "and",
  "or",
  "how",
  "what",
  "where",
  "when",
  "why",
  "does",
  "do",
  "this",
  "that",
  "with",
  "my",
  "our",
  "you",
  "your",
  "please",
  "can",
  "could",
  "explain",
  "find",
  "show",
  "me",
  "it",
  "project",
  "code",
]);

type TreeNode = { name: string; type: "file" | "folder"; size?: number; children?: TreeNode[] };

function renderTree(
  node: TreeNode,
  depth = 0,
  budget = { remaining: TREE_TEXT_CHAR_BUDGET },
): string {
  if (budget.remaining <= 0) return "";
  const lines: string[] = [];
  if (node.name !== "/") {
    const line = `${"  ".repeat(depth)}${node.type === "folder" ? "📁" : "📄"} ${node.name}\n`;
    if (line.length > budget.remaining) return "…(truncated)\n";
    lines.push(line);
    budget.remaining -= line.length;
  }
  const children = [...(node.children ?? [])].sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : 1,
  );
  for (const child of children) {
    if (budget.remaining <= 0) {
      lines.push("…(truncated)\n");
      break;
    }
    lines.push(renderTree(child, node.name === "/" ? depth : depth + 1, budget));
  }
  return lines.join("");
}

function extractKeywords(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9_]+/)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
    ),
  ].slice(0, 12);
}

function scorePath(path: string, keywords: string[]): number {
  const lower = path.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) score += 3;
  }
  // Mild bias toward likely entry points / route / auth files even without
  // a keyword hit, since those are disproportionately useful context.
  if (/\b(index|main|app|server|router|routes?)\b/.test(lower)) score += 1;
  if (/\bauth\b/.test(lower)) score += 1;
  return score;
}

export async function buildProjectContextBundle(
  supabase: SupabaseClient,
  projectId: string,
  queryText: string,
): Promise<string | null> {
  const { data: project, error: projectErr } = await supabase
    .from("workspace_projects")
    .select("name, framework, primary_language, folder_tree, dependencies, file_count")
    .eq("id", projectId)
    .maybeSingle();
  if (projectErr || !project) return null;

  const { data: fileList, error: listErr } = await supabase
    .from("workspace_project_files")
    .select("path, size")
    .eq("project_id", projectId);
  if (listErr || !fileList) return null;

  const keywords = extractKeywords(queryText);
  const priorityPaths = fileList
    .filter((f) => ALWAYS_INCLUDE_BASENAMES.has(f.path.split("/").pop()!.toLowerCase()))
    .map((f) => f.path);

  const scored = fileList
    .filter((f) => !priorityPaths.includes(f.path))
    .map((f) => ({ path: f.path, score: scorePath(f.path, keywords) }))
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RELEVANT_FILES)
    .map((f) => f.path);

  const chosenPaths = [...priorityPaths, ...scored].slice(
    0,
    MAX_RELEVANT_FILES + priorityPaths.length,
  );

  let filesSection = "";
  if (chosenPaths.length > 0) {
    const { data: files, error: filesErr } = await supabase
      .from("workspace_project_files")
      .select("path, content")
      .eq("project_id", projectId)
      .in("path", chosenPaths);
    if (!filesErr && files) {
      let remaining = FILE_CONTENT_CHAR_BUDGET;
      const parts: string[] = [];
      for (const f of files) {
        if (remaining <= 0) {
          parts.push(
            "\n\n[...additional files omitted — ask about a specific file or area for more detail...]",
          );
          break;
        }
        const chunk = `\n\n===== ${f.path} =====\n${f.content}`.slice(0, remaining);
        parts.push(chunk);
        remaining -= chunk.length;
      }
      filesSection = parts.join("");
    }
  }

  const treeText = renderTree(project.folder_tree as TreeNode);
  const deps = Array.isArray(project.dependencies)
    ? (project.dependencies as string[]).slice(0, 60).join(", ")
    : "";

  return [
    `You have access to an uploaded project called "${project.name}"`,
    project.framework
      ? `(framework: ${project.framework}${project.primary_language ? `, language: ${project.primary_language}` : ""})`
      : "",
    `with ${project.file_count} indexed files. Use this context to answer questions about the project's structure, architecture, and code — cite real file paths from below rather than guessing. If something isn't shown in the excerpt, say so instead of inventing it.`,
    `\n\nFOLDER STRUCTURE:\n${treeText}`,
    deps ? `\n\nDEPENDENCIES: ${deps}` : "",
    filesSection
      ? `\n\nRELEVANT FILE CONTENTS:${filesSection}`
      : "\n\n(No individual files matched this question closely enough to include — ask about a specific file, folder, or feature for detail.)",
  ].join("");
}
