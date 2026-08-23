import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_RESULTS = 60;
const MAX_MATCHES_PER_FILE = 4;

export const searchProjectFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({ projectId: z.string().uuid(), query: z.string().min(2).max(200) }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { data: files, error } = await context.supabase
      .from("workspace_project_files")
      .select("path, content")
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);

    const q = data.query.toLowerCase();
    const results: { path: string; line: number; snippet: string }[] = [];

    for (const file of files ?? []) {
      if (results.length >= MAX_RESULTS) break;
      const lines = file.content.split("\n");
      let matchesInFile = 0;
      for (let i = 0; i < lines.length; i++) {
        if (matchesInFile >= MAX_MATCHES_PER_FILE || results.length >= MAX_RESULTS) break;
        if (lines[i].toLowerCase().includes(q)) {
          results.push({ path: file.path, line: i + 1, snippet: lines[i].trim().slice(0, 200) });
          matchesInFile++;
        }
      }
    }

    return results;
  });
