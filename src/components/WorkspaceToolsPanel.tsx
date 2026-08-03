import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, FileText, BookOpen, TestTube2 } from "lucide-react";
import { searchProjectFiles } from "@/lib/workspace-tools.functions";
import { proposeProjectModification } from "@/lib/modification.functions";
import { ModificationResultPanel, type Modification } from "@/components/ModificationResultPanel";

const GENERATORS = [
  {
    id: "readme",
    label: "Generate README",
    icon: FileText,
    instructions:
      "Generate or update a comprehensive README.md for this project: what it does, setup instructions, environment variables needed (names only), and how to run it. If a README already exists, improve it rather than replacing sections that are already accurate.",
  },
  {
    id: "docs",
    label: "Generate documentation",
    icon: BookOpen,
    instructions:
      "Add or improve inline documentation (docstrings/comments) for the most important, currently under-documented modules in this project — focus on exported functions, complex logic, and any public API surface.",
  },
  {
    id: "tests",
    label: "Generate tests",
    icon: TestTube2,
    instructions:
      "Add tests for the most critical, currently untested logic in this project (following whatever test framework/conventions it already uses, or the most idiomatic choice for its stack if none exists yet).",
  },
];

export function WorkspaceToolsPanel({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const [query, setQuery] = useState("");
  const [modification, setModification] = useState<Modification | null>(null);
  const [activeGenerator, setActiveGenerator] = useState<string | null>(null);

  const searchFn = useServerFn(searchProjectFiles);
  const searchMut = useMutation({
    mutationFn: () => searchFn({ data: { projectId, query } }),
    onError: (e: Error) => toast.error(e.message || "Search failed."),
  });

  const proposeFn = useServerFn(proposeProjectModification);
  const proposeMut = useMutation({
    mutationFn: (instructions: string) => proposeFn({ data: { projectId, instructions } }),
    onSuccess: (mod) => setModification(mod as unknown as Modification),
    onError: (e: Error) => toast.error(e.message || "Couldn't generate that."),
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
          <Search className="size-4" /> Search across project
        </p>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search file contents…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim().length >= 2) searchMut.mutate();
            }}
          />
          <Button
            disabled={query.trim().length < 2 || searchMut.isPending}
            onClick={() => searchMut.mutate()}
          >
            {searchMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Search"}
          </Button>
        </div>
        {searchMut.data && (
          <div className="mt-3 space-y-1 max-h-[300px] overflow-y-auto">
            {searchMut.data.length === 0 && (
              <p className="text-sm text-muted-foreground">No matches.</p>
            )}
            {searchMut.data.map((r, i) => (
              <div
                key={i}
                className="text-xs font-mono border border-border rounded px-2 py-1.5 bg-card/30"
              >
                <span className="text-muted-foreground">
                  {r.path}:{r.line}
                </span>
                <div className="truncate">{r.snippet}</div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          Looking for who imports/references a specific file? See the Map tab's file detail panel.
        </p>
      </div>

      <div>
        <p className="text-sm font-medium mb-2">Generate</p>
        <div className="flex flex-wrap gap-2">
          {GENERATORS.map((g) => (
            <Button
              key={g.id}
              size="sm"
              variant="outline"
              disabled={proposeMut.isPending}
              onClick={() => {
                setActiveGenerator(g.id);
                proposeMut.mutate(g.instructions);
              }}
            >
              {proposeMut.isPending && activeGenerator === g.id ? (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <g.icon className="size-3.5 mr-1.5" />
              )}
              {g.label}
            </Button>
          ))}
        </div>
      </div>

      {modification && (
        <ModificationResultPanel
          projectId={projectId}
          projectName={projectName}
          modification={modification}
          onChange={setModification}
        />
      )}
    </div>
  );
}
