import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, Download, Undo2 } from "lucide-react";
import { DiffViewer, type ModificationFile } from "@/components/DiffViewer";
import {
  applyProjectModification,
  rollbackProjectModification,
} from "@/lib/modification.functions";
import { getWorkspaceProjectFiles } from "@/lib/workspace.functions";

export type Modification = {
  id: string;
  project_id: string;
  instructions: string;
  summary: string;
  status: "proposed" | "applied";
  files: ModificationFile[];
};

export async function downloadProjectZip(
  projectId: string,
  projectName: string,
  fetchFiles: () => Promise<{ path: string; content: string }[]>,
) {
  const JSZip = (await import("jszip")).default;
  const files = await fetchFiles();
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, f.content);
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectName || "project"}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ModificationResultPanel({
  projectId,
  projectName,
  modification,
  onChange,
}: {
  projectId: string;
  projectName: string;
  modification: Modification;
  onChange: (mod: Modification) => void;
}) {
  const qc = useQueryClient();

  const applyFn = useServerFn(applyProjectModification);
  const applyMut = useMutation({
    mutationFn: (id: string) => applyFn({ data: { id } }),
    onSuccess: (mod) => {
      onChange(mod as unknown as Modification);
      toast.success("Changes applied to the project.");
      qc.invalidateQueries({ queryKey: ["workspace-project", projectId] });
      qc.invalidateQueries({ queryKey: ["project-modifications", projectId] });
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't apply those changes."),
  });

  const rollbackFn = useServerFn(rollbackProjectModification);
  const rollbackMut = useMutation({
    mutationFn: (id: string) => rollbackFn({ data: { id } }),
    onSuccess: (mod) => {
      onChange(mod as unknown as Modification);
      toast.success("Rolled back — the applied changes were reverted.");
      qc.invalidateQueries({ queryKey: ["workspace-project", projectId] });
      qc.invalidateQueries({ queryKey: ["project-modifications", projectId] });
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't roll back those changes."),
  });

  const filesFn = useServerFn(getWorkspaceProjectFiles);
  const [downloading, setDownloading] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium">{modification.summary}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {modification.files.length} file{modification.files.length === 1 ? "" : "s"} affected
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {modification.status === "proposed" ? (
            <Button
              size="sm"
              disabled={applyMut.isPending}
              onClick={() => applyMut.mutate(modification.id)}
            >
              {applyMut.isPending ? (
                <Loader2 className="size-4 mr-1.5 animate-spin" />
              ) : (
                <Check className="size-4 mr-1.5" />
              )}
              Apply changes
            </Button>
          ) : (
            <>
              <Badge variant="secondary">Applied</Badge>
              <Button
                size="sm"
                variant="outline"
                disabled={rollbackMut.isPending}
                onClick={() => rollbackMut.mutate(modification.id)}
              >
                {rollbackMut.isPending ? (
                  <Loader2 className="size-4 mr-1.5 animate-spin" />
                ) : (
                  <Undo2 className="size-4 mr-1.5" />
                )}
                Rollback
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={downloading}
                onClick={async () => {
                  setDownloading(true);
                  try {
                    await downloadProjectZip(projectId, projectName, () =>
                      filesFn({ data: { projectId } }),
                    );
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Couldn't build the ZIP.");
                  } finally {
                    setDownloading(false);
                  }
                }}
              >
                {downloading ? (
                  <Loader2 className="size-4 mr-1.5 animate-spin" />
                ) : (
                  <Download className="size-4 mr-1.5" />
                )}
                Download ZIP
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="mt-4">
        <DiffViewer files={modification.files} />
      </div>
    </div>
  );
}
