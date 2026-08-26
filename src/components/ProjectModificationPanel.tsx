import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Wand2, History, Bot } from "lucide-react";
import { proposeProjectModification, listProjectModifications } from "@/lib/modification.functions";
import { ModificationResultPanel, type Modification } from "@/components/ModificationResultPanel";
import { Link } from "@tanstack/react-router";
import { AI_AGENTS, getAgent } from "@/lib/agents";

export function ProjectModificationPanel({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const qc = useQueryClient();
  const [instructions, setInstructions] = useState("");
  const [agentId, setAgentId] = useState<string>("code-engineer");
  const [modification, setModification] = useState<Modification | null>(null);

  const proposeFn = useServerFn(proposeProjectModification);
  const proposeMut = useMutation({
    mutationFn: () => {
      const agent = getAgent(agentId);
      const finalInstructions =
        agent && agent.id !== "code-engineer"
          ? `${agent.framing}\n\nRequest: ${instructions}`
          : instructions;
      return proposeFn({ data: { projectId, instructions: finalInstructions } });
    },
    onSuccess: (mod) => {
      setModification(mod as unknown as Modification);
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't generate that change."),
  });

  const historyFn = useServerFn(listProjectModifications);
  const { data: history = [] } = useQuery({
    queryKey: ["project-modifications", projectId],
    queryFn: () => historyFn({ data: { projectId } }),
  });

  return (
    <div>
      <h3 className="text-sm font-semibold flex items-center gap-1.5">
        <Wand2 className="size-4" /> Modify this project
      </h3>
      <p className="text-xs text-muted-foreground mt-1">
        Describe a change — "add dark mode", "fix the login bug", "convert to TypeScript". Zeus AI
        proposes a diff you review before anything is applied. Prefer clicking instead? Try the{" "}
        <Link to="/feature-generator" className="underline hover:text-foreground">
          Feature Generator
        </Link>
        .
      </p>
      <div className="flex items-center gap-2 mt-3">
        <Bot className="size-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Agent:</span>
        <Select value={agentId} onValueChange={setAgentId}>
          <SelectTrigger className="h-8 w-[220px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AI_AGENTS.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="mt-2 flex gap-2 flex-wrap items-start">
        <Textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="What should Zeus AI change?"
          className="min-h-[70px] flex-1 min-w-[240px]"
        />
        <Button
          disabled={proposeMut.isPending || !instructions.trim()}
          onClick={() => proposeMut.mutate()}
        >
          {proposeMut.isPending ? (
            <Loader2 className="size-4 mr-1.5 animate-spin" />
          ) : (
            <Wand2 className="size-4 mr-1.5" />
          )}
          Propose changes
        </Button>
      </div>

      {modification && (
        <div className="mt-5">
          <ModificationResultPanel
            projectId={projectId}
            projectName={projectName}
            modification={modification}
            onChange={setModification}
          />
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <History className="size-3.5" /> Modification history
          </p>
          <div className="space-y-1.5">
            {history.map((h) => (
              <div key={h.id} className="text-xs flex items-center gap-2 text-muted-foreground">
                <Badge
                  variant={h.status === "applied" ? "secondary" : "outline"}
                  className="text-[10px] shrink-0"
                >
                  {h.status === "applied" ? "Applied" : "Proposed"}
                </Badge>
                <span className="truncate">{h.instructions}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
