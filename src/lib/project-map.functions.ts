import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildProjectMap, type ProjectMap } from "./project-map";

export const getProjectMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ projectId: z.string().uuid(), regenerate: z.boolean().default(false) }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;

    if (!data.regenerate) {
      const { data: cached } = await supabase
        .from("workspace_projects")
        .select("project_map")
        .eq("id", data.projectId)
        .maybeSingle();
      if (cached?.project_map) return cached.project_map as ProjectMap;
    }

    const { data: files, error } = await supabase
      .from("workspace_project_files")
      .select("path, content, size")
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);

    const map = buildProjectMap(files ?? []);

    const { error: cacheErr } = await supabase
      .from("workspace_projects")
      .update({ project_map: map })
      .eq("id", data.projectId);
    if (cacheErr) throw new Error(cacheErr.message);

    return map;
  });
