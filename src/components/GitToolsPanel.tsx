import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, GitCommit, Copy } from "lucide-react";
import { listProjectModifications } from "@/lib/modification.functions";
import { generateGitArtifact } from "@/lib/git-tools.functions";

const KINDS: {
  id: "commit_message" | "pr_description" | "changelog" | "release_notes" | "explain_diff";
  label: string;
}[] = [
  { id: "commit_message", label: "Commit message" },
  { id: "pr_description", label: "PR description" },
  { id: "changelog", label: "Changelog entry" },
  { id: "release_notes", label: "Release notes" },
  { id: "explain_diff", label: "Explain this diff" },
];

export function GitToolsPanel({ projectId }: { projectId: string }) {
  const [modificationId, setModificationId] = useState<string | null>(null);
  const [result, setResult] = useState<{ kind: string; text: string } | null>(null);

  const historyFn = useServerFn(listProjectModifications);
  const { data: history = [] } = useQuery({
    queryKey: ["project-modifications", projectId],
    queryFn: () => historyFn({ data: { projectId } }),
  });

  const genFn = useServerFn(generateGitArtifact);
  const genMut = useMutation({
    mutationFn: (kind: (typeof KINDS)[number]["id"]) =>
      genFn({ data: { modificationId: modificationId!, kind } }),
    onSuccess: (r) => setResult(r),
    onError: (e: Error) => toast.error(e.message || "Couldn't generate that."),
  });

  if (history.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No modifications yet — propose a change first (Modify tab or Feature Generator), then
        generate commit messages, PR descriptions, and changelogs from its diff here.
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm font-medium mb-2">Pick a modification</p>
      <Select
        value={modificationId ?? undefined}
        onValueChange={(v) => {
          setModificationId(v);
          setResult(null);
        }}
      >
        <SelectTrigger className="w-full max-w-md">
          <SelectValue placeholder="Choose a modification…" />
        </SelectTrigger>
        <SelectContent>
          {history.map((h) => (
            <SelectItem key={h.id} value={h.id}>
              {h.instructions.slice(0, 60)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {modificationId && (
        <div className="flex flex-wrap gap-2 mt-4">
          {KINDS.map((k) => (
            <Button
              key={k.id}
              size="sm"
              variant="outline"
              disabled={genMut.isPending}
              onClick={() => genMut.mutate(k.id)}
            >
              {genMut.isPending && genMut.variables === k.id ? (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <GitCommit className="size-3.5 mr-1.5" />
              )}
              {k.label}
            </Button>
          ))}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-lg border border-border bg-card/40 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground">
              {KINDS.find((k) => k.id === result.kind)?.label}
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                navigator.clipboard.writeText(result.text);
                toast.success("Copied");
              }}
            >
              <Copy className="size-3.5 mr-1.5" /> Copy
            </Button>
          </div>
          <pre className="text-xs whitespace-pre-wrap font-mono">{result.text}</pre>
        </div>
      )}
    </div>
  );
}
