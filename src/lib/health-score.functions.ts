import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildHealthScore, type ProjectHealthScore } from "./health-score";

export const getProjectHealthScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ projectId: z.string().uuid(), regenerate: z.boolean().default(false) }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;

    if (!data.regenerate) {
      const { data: cached } = await supabase
        .from("workspace_projects")
        .select("health_score")
        .eq("id", data.projectId)
        .maybeSingle();
      if (cached?.health_score) return cached.health_score as ProjectHealthScore;
    }

    const { data: project } = await supabase
      .from("workspace_projects")
      .select("dependencies")
      .eq("id", data.projectId)
      .maybeSingle();

    const { data: files, error } = await supabase
      .from("workspace_project_files")
      .select("path, content, size")
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);

    const score = buildHealthScore(files ?? [], (project?.dependencies as string[]) ?? []);

    const { error: cacheErr } = await supabase
      .from("workspace_projects")
      .update({ health_score: score })
      .eq("id", data.projectId);
    if (cacheErr) throw new Error(cacheErr.message);

    return score;
  });
