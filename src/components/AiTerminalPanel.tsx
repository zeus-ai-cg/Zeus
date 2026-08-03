import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, TerminalSquare, Copy, ShieldAlert } from "lucide-react";
import { generateTerminalCommand } from "@/lib/terminal.functions";
import { cn } from "@/lib/utils";

const RISK_CLASS: Record<string, string> = {
  low: "border-green-500/40 text-green-600 dark:text-green-400",
  medium: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  high: "border-red-500/40 text-red-600 dark:text-red-400",
};

export function AiTerminalPanel({ projectId }: { projectId: string }) {
  const [request, setRequest] = useState("");
  const [history, setHistory] = useState<
    { request: string; command: string; explanation: string; risks: string[]; riskLevel: string }[]
  >([]);

  const genFn = useServerFn(generateTerminalCommand);
  const genMut = useMutation({
    mutationFn: () => genFn({ data: { projectId, request } }),
    onSuccess: (result) => {
      setHistory((h) => [{ request, ...result }, ...h]);
      setRequest("");
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't generate a command for that."),
  });

  return (
    <div>
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 mb-4 flex gap-2 items-start">
        <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Zeus AI never runs commands on your behalf — this generates the exact command, an
          explanation, and a risk assessment for you to review and run yourself in your own
          terminal.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="e.g. install Tailwind, run tests, create a migration…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && request.trim() && !genMut.isPending) genMut.mutate();
          }}
        />
        <Button disabled={!request.trim() || genMut.isPending} onClick={() => genMut.mutate()}>
          {genMut.isPending ? (
            <Loader2 className="size-4 mr-1.5 animate-spin" />
          ) : (
            <TerminalSquare className="size-4 mr-1.5" />
          )}
          Generate
        </Button>
      </div>

      <div className="space-y-3 mt-4">
        {history.map((h, i) => (
          <div key={i} className="rounded-lg border border-border bg-card/40 p-3">
            <p className="text-xs text-muted-foreground">{h.request}</p>
            <div className="flex items-center gap-2 mt-2">
              <code className="flex-1 text-sm font-mono bg-background/80 border border-border rounded px-2 py-1 overflow-x-auto whitespace-nowrap">
                {h.command}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(h.command);
                  toast.success("Copied");
                }}
              >
                <Copy className="size-3.5" />
              </Button>
              <Badge
                variant="outline"
                className={cn("text-[10px] shrink-0", RISK_CLASS[h.riskLevel])}
              >
                {h.riskLevel} risk
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{h.explanation}</p>
            {h.risks.length > 0 && (
              <ul className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 list-disc list-inside space-y-0.5">
                {h.risks.map((r, ri) => (
                  <li key={ri}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
