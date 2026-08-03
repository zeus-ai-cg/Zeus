import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageShell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles } from "lucide-react";
import { listWorkspaceProjects } from "@/lib/workspace.functions";
import { proposeProjectModification } from "@/lib/modification.functions";
import { ModificationResultPanel, type Modification } from "@/components/ModificationResultPanel";
import { FEATURE_CATALOG, FEATURE_CATEGORIES, type FeatureDefinition } from "@/lib/feature-catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/feature-generator")({
  head: () => ({
    meta: [
      { title: "Feature Generator — Zeus AI" },
      {
        name: "description",
        content: "Click a feature to have Zeus AI generate it for your uploaded project.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FeatureGeneratorPage,
});

function FeatureGeneratorPage() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [activeFeature, setActiveFeature] = useState<FeatureDefinition | null>(null);
  const [modification, setModification] = useState<Modification | null>(null);

  const projectsFn = useServerFn(listWorkspaceProjects);
  const { data: projects = [] } = useQuery({
    queryKey: ["workspace-projects"],
    queryFn: () => projectsFn(),
  });
  const project = projects.find((p) => p.id === projectId);

  const proposeFn = useServerFn(proposeProjectModification);
  const proposeMut = useMutation({
    mutationFn: (feature: FeatureDefinition) =>
      proposeFn({ data: { projectId: projectId!, instructions: feature.instructions } }),
    onMutate: (feature) => {
      setActiveFeature(feature);
      setModification(null);
    },
    onSuccess: (mod) => setModification(mod as unknown as Modification),
    onError: (e: Error) => toast.error(e.message || "Couldn't generate that feature."),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <PageHeader
          title="Feature Generator"
          subtitle="Pick a project, click a feature. Zeus AI figures out the right architecture, generates only the files it needs, and shows you a diff before anything is applied."
        />

        <div className="rounded-xl border border-border bg-card/60 p-4">
          <p className="text-sm font-medium mb-2">Project</p>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No indexed projects yet — upload one in{" "}
              <Link to="/workspace" className="underline hover:text-foreground">
                Workspace
              </Link>{" "}
              first.
            </p>
          ) : (
            <Select value={projectId ?? undefined} onValueChange={setProjectId}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Choose a project…" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {projectId && (
          <div className="space-y-6">
            {FEATURE_CATEGORIES.map((category) => {
              const features = FEATURE_CATALOG.filter((f) => f.category === category);
              if (features.length === 0) return null;
              return (
                <div key={category}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {category}
                  </p>
                  <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {features.map((feature) => {
                      const isActive = activeFeature?.id === feature.id;
                      const isPending = proposeMut.isPending && isActive;
                      return (
                        <button
                          key={feature.id}
                          disabled={proposeMut.isPending}
                          onClick={() => proposeMut.mutate(feature)}
                          className={cn(
                            "text-left rounded-lg border p-3 transition-colors disabled:opacity-50",
                            isActive
                              ? "border-primary bg-primary/5"
                              : "border-border bg-card/40 hover:bg-card/70",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            {isPending ? (
                              <Loader2 className="size-4 animate-spin text-primary shrink-0" />
                            ) : (
                              <Sparkles className="size-4 text-muted-foreground shrink-0" />
                            )}
                            <span className="font-medium text-sm">{feature.label}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {feature.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {modification && project && (
          <div>
            <p className="text-sm font-medium mb-2">{activeFeature?.label} — proposed changes</p>
            <ModificationResultPanel
              projectId={project.id}
              projectName={project.name}
              modification={modification}
              onChange={setModification}
            />
          </div>
        )}
      </div>
    </div>
  );
}
