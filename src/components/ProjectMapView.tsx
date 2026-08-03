import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Map as MapIcon,
  Loader2,
  RefreshCw,
  Search,
  FileCode2,
  ArrowRight,
  ArrowLeft,
  Plug,
  KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getProjectMap } from "@/lib/project-map.functions";
import { getWorkspaceProjectFile } from "@/lib/workspace.functions";
import type { MapCategory, ProjectMapNode } from "@/lib/project-map";

const CATEGORY_META: Record<MapCategory, { label: string; className: string }> = {
  frontend: { label: "Frontend", className: "border-blue-500/40 text-blue-600 dark:text-blue-400" },
  backend: {
    label: "Backend",
    className: "border-purple-500/40 text-purple-600 dark:text-purple-400",
  },
  database: {
    label: "Database",
    className: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  },
  api: { label: "API", className: "border-amber-500/40 text-amber-600 dark:text-amber-400" },
  auth: { label: "Authentication", className: "border-red-500/40 text-red-600 dark:text-red-400" },
  config: {
    label: "Configuration",
    className: "border-slate-500/40 text-slate-600 dark:text-slate-400",
  },
  other: { label: "Other", className: "border-border text-muted-foreground" },
};

const ALL_CATEGORIES = Object.keys(CATEGORY_META) as MapCategory[];

export function ProjectMapView({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<MapCategory>>(
    new Set(ALL_CATEGORIES),
  );
  const [selected, setSelected] = useState<string | null>(null);

  const mapFn = useServerFn(getProjectMap);
  const { data: map, isFetching } = useQuery({
    queryKey: ["project-map", projectId],
    queryFn: () => mapFn({ data: { projectId, regenerate: false } }),
  });

  const regenMut = useMutation({
    mutationFn: () => mapFn({ data: { projectId, regenerate: true } }),
    onSuccess: (fresh) => {
      qc.setQueryData(["project-map", projectId], fresh);
      toast.success("Project map refreshed");
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't refresh the map."),
  });

  const fileFn = useServerFn(getWorkspaceProjectFile);
  const { data: fileDetail, isFetching: loadingFile } = useQuery({
    queryKey: ["workspace-project-file", projectId, selected],
    queryFn: () => fileFn({ data: { projectId, path: selected! } }),
    enabled: !!selected,
  });

  const filteredNodes = useMemo(() => {
    if (!map) return [];
    const q = query.trim().toLowerCase();
    return map.nodes.filter(
      (n) => activeCategories.has(n.category) && (!q || n.id.toLowerCase().includes(q)),
    );
  }, [map, query, activeCategories]);

  const grouped = useMemo(() => {
    const byCategory = new Map<MapCategory, ProjectMapNode[]>();
    for (const n of filteredNodes) {
      const list = byCategory.get(n.category) ?? [];
      list.push(n);
      byCategory.set(n.category, list);
    }
    return byCategory;
  }, [filteredNodes]);

  const selectedNode = map?.nodes.find((n) => n.id === selected);
  const importsOf = selectedNode
    ? (map?.edges.filter((e) => e.from === selected).map((e) => e.to) ?? [])
    : [];
  const importedBy = selectedNode
    ? (map?.edges.filter((e) => e.to === selected).map((e) => e.from) ?? [])
    : [];

  function toggleCategory(cat: MapCategory) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  if (isFetching && !map) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!map) return null;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <Input
            placeholder="Search files in the map…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-sm"
          />
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
          Regenerate
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {ALL_CATEGORIES.map((cat) => (
          <button key={cat} onClick={() => toggleCategory(cat)}>
            <Badge
              variant="outline"
              className={cn(
                "text-xs cursor-pointer",
                CATEGORY_META[cat].className,
                !activeCategories.has(cat) && "opacity-30",
              )}
            >
              {CATEGORY_META[cat].label} · {map.nodes.filter((n) => n.category === cat).length}
            </Badge>
          </button>
        ))}
      </div>

      {(map.externalServices.length > 0 || map.envVars.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          {map.externalServices.length > 0 && (
            <div className="rounded-lg border border-border bg-background/60 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <Plug className="size-3.5" /> External services detected
              </p>
              <div className="flex flex-wrap gap-1">
                {map.externalServices.map((s) => (
                  <Badge key={s} variant="secondary" className="text-xs">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {map.envVars.length > 0 && (
            <div className="rounded-lg border border-border bg-background/60 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <KeyRound className="size-3.5" /> Environment variables (names only)
              </p>
              <div className="flex flex-wrap gap-1">
                {map.envVars.map((v) => (
                  <Badge key={v} variant="outline" className="text-xs font-mono">
                    {v}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid md:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
          {[...grouped.entries()].map(([cat, nodes]) => (
            <div key={cat}>
              <p className={cn("text-xs font-semibold mb-1.5", CATEGORY_META[cat].className)}>
                {CATEGORY_META[cat].label}
              </p>
              <div className="grid sm:grid-cols-2 gap-1.5">
                {nodes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => setSelected(n.id)}
                    className={cn(
                      "text-left rounded-md border px-2.5 py-1.5 text-xs flex items-center gap-1.5 hover:bg-card/70",
                      selected === n.id
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card/30",
                    )}
                  >
                    <FileCode2 className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate font-mono">{n.id}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {filteredNodes.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No files match this search/filter.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-background/60 p-3 min-h-[200px]">
          {!selectedNode && (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground py-10 gap-2">
              <MapIcon className="size-6" />
              <p className="text-xs">Click a file to inspect it.</p>
            </div>
          )}
          {selectedNode && (
            <div>
              <p className="font-mono text-xs break-all">{selectedNode.id}</p>
              <Badge
                variant="outline"
                className={cn("text-xs mt-1.5", CATEGORY_META[selectedNode.category].className)}
              >
                {CATEGORY_META[selectedNode.category].label}
              </Badge>
              <p className="text-xs text-muted-foreground mt-2">{selectedNode.description}</p>

              {importsOf.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium flex items-center gap-1">
                    <ArrowRight className="size-3" /> Imports
                  </p>
                  <div className="mt-1 space-y-0.5">
                    {importsOf.map((p) => (
                      <button
                        key={p}
                        onClick={() => setSelected(p)}
                        className="block text-xs font-mono text-muted-foreground hover:text-primary truncate w-full text-left"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {importedBy.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium flex items-center gap-1">
                    <ArrowLeft className="size-3" /> Imported by
                  </p>
                  <div className="mt-1 space-y-0.5">
                    {importedBy.map((p) => (
                      <button
                        key={p}
                        onClick={() => setSelected(p)}
                        className="block text-xs font-mono text-muted-foreground hover:text-primary truncate w-full text-left"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3">
                <p className="text-xs font-medium mb-1">Preview</p>
                {loadingFile && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                {fileDetail && (
                  <pre className="text-[10px] font-mono bg-card/60 border border-border rounded p-2 max-h-[160px] overflow-auto whitespace-pre-wrap">
                    {fileDetail.content.slice(0, 1500)}
                    {fileDetail.content.length > 1500 && "\n…"}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
