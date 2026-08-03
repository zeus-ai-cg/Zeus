import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ScanSearch } from "lucide-react";
import { listProjectModifications } from "@/lib/modification.functions";
import { reviewProjectModification } from "@/lib/code-review.functions";
import { cn } from "@/lib/utils";

const SEVERITY_CLASS: Record<string, string> = {
  critical: "border-red-500/40 text-red-600 dark:text-red-400",
  warning: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  suggestion: "border-blue-500/40 text-blue-600 dark:text-blue-400",
  info: "border-border text-muted-foreground",
};

export function CodeReviewPanel({ projectId }: { projectId: string }) {
  const [modificationId, setModificationId] = useState<string | null>(null);

  const historyFn = useServerFn(listProjectModifications);
  const { data: history = [] } = useQuery({
    queryKey: ["project-modifications", projectId],
    queryFn: () => historyFn({ data: { projectId } }),
  });

  const reviewFn = useServerFn(reviewProjectModification);
  const reviewMut = useMutation({
    mutationFn: (id: string) => reviewFn({ data: { modificationId: id } }),
    onError: (e: Error) => toast.error(e.message || "Couldn't review that change."),
  });

  if (history.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No modifications yet — propose a change first (Modify tab or Feature Generator), then run a
        code review on it here.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={modificationId ?? undefined} onValueChange={setModificationId}>
          <SelectTrigger className="w-full max-w-md">
            <SelectValue placeholder="Choose a modification to review…" />
          </SelectTrigger>
          <SelectContent>
            {history.map((h) => (
              <SelectItem key={h.id} value={h.id}>
                {h.instructions.slice(0, 60)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={!modificationId || reviewMut.isPending}
          onClick={() => modificationId && reviewMut.mutate(modificationId)}
        >
          {reviewMut.isPending ? (
            <Loader2 className="size-3.5 mr-1.5 animate-spin" />
          ) : (
            <ScanSearch className="size-3.5 mr-1.5" />
          )}
          Review
        </Button>
      </div>

      {reviewMut.data && (
        <div className="mt-4">
          <p className="text-sm">{reviewMut.data.overallAssessment}</p>
          <div className="space-y-2 mt-3">
            {reviewMut.data.findings.length === 0 && (
              <p className="text-sm text-muted-foreground">No notable issues found.</p>
            )}
            {reviewMut.data.findings.map((f, i) => (
              <div key={i} className="rounded-lg border border-border bg-card/30 p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="outline"
                    className={cn("text-[10px]", SEVERITY_CLASS[f.severity])}
                  >
                    {f.severity}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {f.category}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">{f.file}</span>
                </div>
                <p className="text-sm mt-1.5">{f.issue}</p>
                <p className="text-xs text-muted-foreground mt-1">→ {f.suggestion}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
