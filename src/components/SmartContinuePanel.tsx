import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, X, RotateCcw } from "lucide-react";
import { proposeProjectModification } from "@/lib/modification.functions";
import { ModificationResultPanel, type Modification } from "@/components/ModificationResultPanel";

type Props = {
  projectId: string;
  projectName: string;
  instructions: string;
  onClose: () => void;
};

// ⚡ Zeus Smart Continue (Feature 5).
//
// Deliberately thin: all the real work — "figure out which files actually
// need to change, diff them, let the user apply or roll back" — already
// exists in modification.functions.ts / ModificationResultPanel from the
// Feature Generator. This just gives that same flow a natural home inside
// chat, so "Add Stripe" on a project you just built with Zeus Project
// Engineer doesn't require a trip to the Workspace page, and — the actual
// point of Feature 5 — never regenerates the whole project from scratch.
export function SmartContinuePanel({ projectId, projectName, instructions, onClose }: Props) {
  const [modification, setModification] = useState<Modification | null>(null);
  const startedRef = useRef(false);

  const proposeFn = useServerFn(proposeProjectModification);
  const proposeMut = useMutation({
    mutationFn: () => proposeFn({ data: { projectId, instructions } }),
    onSuccess: (mod) => setModification(mod as unknown as Modification),
    onError: (e: Error) => toast.error(e.message || "Couldn't modify this project."),
  });

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    proposeMut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-gradient-to-b from-primary/5 via-background to-background">
      <div className="flex items-center justify-between border-b border-primary/20 bg-card/80 backdrop-blur px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">Zeus Smart Continue</p>
            <p className="text-xs text-muted-foreground leading-tight truncate max-w-[50vw]">
              {proposeMut.isPending
                ? `Updating ${projectName}…`
                : modification
                  ? projectName
                  : "Couldn't update this project"}
            </p>
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          <div className="rounded-xl border border-border bg-card/40 p-3 text-sm">
            <span className="text-muted-foreground">Instructions: </span>"{instructions}"
          </div>

          {proposeMut.isPending && (
            <div className="rounded-xl border border-border bg-card/60 p-6 flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Only touching the files this needs — not regenerating {projectName}.
            </div>
          )}

          {proposeMut.isError && !proposeMut.isPending && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive flex items-center justify-between gap-3">
              <span>{(proposeMut.error as Error)?.message ?? "Something went wrong."}</span>
              <Button size="sm" variant="outline" onClick={() => proposeMut.mutate()}>
                <RotateCcw className="size-3.5 mr-1.5" /> Retry
              </Button>
            </div>
          )}

          {modification && (
            <ModificationResultPanel
              projectId={projectId}
              projectName={projectName}
              modification={modification}
              onChange={setModification}
            />
          )}
        </div>
      </div>
    </div>
  );
}
