import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Limits for this first cut of the Project Workspace. Zeus AI's product
// vision (see internal spec) calls for 2GB uploads with incremental,
// background indexing â€” that needs a queue/worker and object storage for
// file bodies instead of Postgres rows. This phase stores indexed files as
// rows in workspace_project_files, which is fine for the vast majority of
// real-world repos but is intentionally capped so a single upload can't
// blow up the request or the table. Raising these later only requires
// changing this file and the matching client-side limits in workspace.tsx.
// ---------------------------------------------------------------------------
export const MAX_WORKSPACE_FILES = 1200;
export const MAX_WORKSPACE_FILE_BYTES = 400_000; // per-file skip threshold
export const MAX_WORKSPACE_TOTAL_BYTES = 15_000_000; // total content stored per project

const fileSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string().max(MAX_WORKSPACE_FILE_BYTES),
});

const DB_INSERT_CHUNK = 200;

// --- Folder tree -----------------------------------------------------------

export type TreeNode = {
  name: string;
  type: "file" | "folder";
  size?: number;
  children?: TreeNode[];
};

export function buildFolderTree(files: { path: string; size: number }[]): TreeNode {
  const root: TreeNode = { name: "/", type: "folder", children: [] };
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let node = root;
    parts.forEach((part, i) => {
      const isLeaf = i === parts.length - 1;
      node.children ??= [];
      let next = node.children.find((c) => c.name === part);
      if (!next) {
        next = isLeaf
          ? { name: part, type: "file", size: file.size }
          : { name: part, type: "folder", children: [] };
        node.children.push(next);
      }
      node = next;
    });
  }
  return root;
}

// --- Framework / language detection -----------------------------------------

function detectFramework(files: { path: string; content: string }[]): {
  framework: string | null;
  primaryLanguage: string | null;
  dependencies: string[];
} {
  const byPath = new Map(files.map((f) => [f.path.replace(/^\.\//, ""), f]));
  const find = (name: string) =>
    [...byPath.entries()].find(([p]) => p === name || p.endsWith(`/${name}`))?.[1];

  const pkgFile = find("package.json");
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.content);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
      const depNames = Object.keys(deps ?? {});
      const has = (name: string) => depNames.includes(name);
      let framework = "Node.js";
      if (has("next")) framework = "Next.js";
      else if (has("@tanstack/react-start")) framework = "TanStack Start (React)";
      else if (has("react") && has("react-native")) framework = "React Native";
      else if (has("react")) framework = "React";
      else if (has("vue") || has("nuxt")) framework = "Vue" + (has("nuxt") ? " / Nuxt" : "");
      else if (has("@angular/core")) framework = "Angular";
      else if (has("electron")) framework = "Electron";
      else if (has("express") || has("fastify")) framework = "Node.js (API)";
      return {
        framework,
        primaryLanguage: has("typescript") ? "TypeScript" : "JavaScript",
        dependencies: depNames.slice(0, 100),
      };
    } catch {
      return { framework: "Node.js", primaryLanguage: "JavaScript", dependencies: [] };
    }
  }

  if (find("pubspec.yaml"))
    return { framework: "Flutter", primaryLanguage: "Dart", dependencies: [] };
  if (find("composer.json")) {
    const isLaravel = find("artisan") !== undefined;
    return { framework: isLaravel ? "Laravel" : "PHP", primaryLanguage: "PHP", dependencies: [] };
  }
  if (find("manage.py"))
    return { framework: "Django", primaryLanguage: "Python", dependencies: [] };
  if ([...byPath.keys()].some((p) => /requirements\.txt$|pyproject\.toml$/.test(p))) {
    const fastapi = [...byPath.values()].some((f) => /fastapi/i.test(f.content));
    const flask = [...byPath.values()].some((f) => /from flask|import flask/i.test(f.content));
    return {
      framework: fastapi ? "FastAPI" : flask ? "Flask" : "Python",
      primaryLanguage: "Python",
      dependencies: [],
    };
  }
  if (find("go.mod")) return { framework: "Go", primaryLanguage: "Go", dependencies: [] };
  if (find("Cargo.toml")) return { framework: "Rust", primaryLanguage: "Rust", dependencies: [] };
  if ([...byPath.keys()].some((p) => p.endsWith(".csproj")))
    return { framework: "ASP.NET / .NET", primaryLanguage: "C#", dependencies: [] };
  if ([...byPath.keys()].some((p) => p.endsWith("pom.xml") || p.endsWith("build.gradle"))) {
    return { framework: "Java", primaryLanguage: "Java", dependencies: [] };
  }

  return { framework: null, primaryLanguage: null, dependencies: [] };
}

// --- Server functions --------------------------------------------------------

export const indexWorkspaceProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z
      .object({
        name: z.string().min(1).max(150).default("Untitled Project"),
        files: z.array(fileSchema).min(1).max(MAX_WORKSPACE_FILES),
        skippedCount: z.number().int().min(0).default(0),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // Enforce total stored-bytes budget server-side too, not just client-side.
    let usedBytes = 0;
    const kept: { path: string; content: string; size: number }[] = [];
    for (const f of data.files) {
      const size = new TextEncoder().encode(f.content).length;
      if (usedBytes + size > MAX_WORKSPACE_TOTAL_BYTES) break;
      usedBytes += size;
      kept.push({ path: f.path, content: f.content, size });
    }

    const { framework, primaryLanguage, dependencies } = detectFramework(kept);
    const folderTree = buildFolderTree(kept.map((f) => ({ path: f.path, size: f.size })));

    const { data: project, error: insertErr } = await supabase
      .from("workspace_projects")
      .insert({
        user_id: userId,
        name: data.name,
        framework,
        primary_language: primaryLanguage,
        file_count: kept.length,
        total_bytes: usedBytes,
        folder_tree: folderTree,
        dependencies,
        notes:
          data.skippedCount > 0
            ? `${data.skippedCount} file(s) skipped (binary or over the per-file size limit).`
            : null,
      })
      .select("*")
      .single();
    if (insertErr) throw new Error(insertErr.message);

    for (let i = 0; i < kept.length; i += DB_INSERT_CHUNK) {
      const chunk = kept.slice(i, i + DB_INSERT_CHUNK).map((f) => ({
        project_id: project.id,
        path: f.path,
        content: f.content,
        size: f.size,
      }));
      const { error } = await supabase.from("workspace_project_files").insert(chunk);
      if (error) throw new Error(error.message);
    }

    return project;
  });

export const listWorkspaceProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("workspace_projects")
      .select(
        "id, name, framework, primary_language, file_count, total_bytes, notes, pinned, created_at, updated_at",
      )
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const toggleProjectPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ id: z.string().uuid(), pinned: z.boolean() }).parse(i))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("workspace_projects")
      .update({ pinned: data.pinned })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getWorkspaceProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { data: project, error } = await context.supabase
      .from("workspace_projects")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return project;
  });

export const getWorkspaceProjectFile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({ projectId: z.string().uuid(), path: z.string().min(1) }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { data: file, error } = await context.supabase
      .from("workspace_project_files")
      .select("path, content, size")
      .eq("project_id", data.projectId)
      .eq("path", data.path)
      .single();
    if (error) throw new Error(error.message);
    return file;
  });

export const getWorkspaceProjectFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ projectId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { data: files, error } = await context.supabase
      .from("workspace_project_files")
      .select("path, content, size")
      .eq("project_id", data.projectId)
      .order("path", { ascending: true });
    if (error) throw new Error(error.message);
    return files ?? [];
  });

export const deleteWorkspaceProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("workspace_projects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
