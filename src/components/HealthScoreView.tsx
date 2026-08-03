import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, ShieldCheck, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { getProjectHealthScore } from "@/lib/health-score.functions";
import { cn } from "@/lib/utils";
import type { HealthCategory } from "@/lib/health-score";

const CATEGORY_LABELS: Record<HealthCategory, string> = {
  codeQuality: "Code Quality",
  security: "Security",
  performance: "Performance",
  accessibility: "Accessibility",
  maintainability: "Maintainability",
  dependencies: "Dependencies",
  typeSafety: "Type Safety",
  errorHandling: "Error Handling",
  testing: "Testing",
  documentation: "Documentation",
};

function scoreColor(score: number) {
  if (score >= 80) return "text-green-600 dark:text-green-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function barColor(score: number) {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

const SEVERITY_ICON = { critical: AlertCircle, warning: AlertTriangle, info: Info } as const;

export function HealthScoreView({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<HealthCategory | null>(null);

  const scoreFn = useServerFn(getProjectHealthScore);
  const { data: score, isFetching } = useQuery({
    queryKey: ["project-health", projectId],
    queryFn: () => scoreFn({ data: { projectId, regenerate: false } }),
  });

  const regenMut = useMutation({
    mutationFn: () => scoreFn({ data: { projectId, regenerate: true } }),
    onSuccess: (fresh) => {
      qc.setQueryData(["project-health", projectId], fresh);
      toast.success("Health score refreshed");
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't refresh the score."),
  });

  if (isFetching && !score) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!score) return null;

  const findings = filter ? score.findings.filter((f) => f.category === filter) : score.findings;

  return (
    <div>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "size-16 rounded-full border-4 grid place-items-center text-xl font-bold",
              scoreColor(score.overall),
              score.overall >= 80
                ? "border-green-500/40"
                : score.overall >= 60
                  ? "border-amber-500/40"
                  : "border-red-500/40",
            )}
          >
            {score.overall}
          </div>
          <div>
            <p className="font-semibold flex items-center gap-1.5">
              <ShieldCheck className="size-4" /> Overall health score
            </p>
            <p className="text-xs text-muted-foreground">
              Heuristic signal, not a certified audit — treat findings as a starting point.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={regenMut.isPending}
          onClick={() => regenMut.mutate()}
        >
          {regenMut.isPending ? (
            <Loader2 className="size-3.5 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5 mr-1.5" />
          )}
          Rescan
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 md:grid-cols-5 gap-2 mb-5">
        {(Object.keys(CATEGORY_LABELS) as HealthCategory[]).map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(filter === cat ? null : cat)}
            className={cn(
              "rounded-lg border p-2.5 text-left transition-colors",
              filter === cat
                ? "border-primary bg-primary/5"
                : "border-border bg-card/30 hover:bg-card/60",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[cat]}</span>
              <span className={cn("text-xs font-semibold", scoreColor(score.categories[cat]))}>
                {score.categories[cat]}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary mt-1.5 overflow-hidden">
              <div
                className={cn("h-full", barColor(score.categories[cat]))}
                style={{ width: `${score.categories[cat]}%` }}
              />
            </div>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {findings.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No findings{filter ? ` for ${CATEGORY_LABELS[filter]}` : ""} — nice.
          </p>
        )}
        {findings.map((f, i) => {
          const Icon = SEVERITY_ICON[f.severity];
          return (
            <div key={i} className="rounded-lg border border-border bg-card/30 p-3 flex gap-2.5">
              <Icon
                className={cn(
                  "size-4 shrink-0 mt-0.5",
                  f.severity === "critical"
                    ? "text-red-500"
                    : f.severity === "warning"
                      ? "text-amber-500"
                      : "text-muted-foreground",
                )}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{f.message}</p>
                  <Badge variant="outline" className="text-[10px]">
                    {CATEGORY_LABELS[f.category]}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {f.estimatedDifficulty} fix
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{f.recommendation}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
