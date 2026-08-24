import { useEffect, useMemo, useRef, useState } from "react";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Zap,
  X,
  ChevronDown,
  FileCode2,
  Download,
  FolderPlus,
  Loader2,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Clock,
  Boxes,
  FolderTree,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { indexWorkspaceProject } from "@/lib/workspace.functions";
import {
  ENGINEER_STEPS,
  computeEngineerProgress,
  engineerProjectSchema,
  type PartialEngineerProject,
} from "@/lib/engineer.schema";
import {
  estimateEngineerCredits,
  estimatedGenerationMinutes,
  engineerCreditPolicyLabel,
} from "@/lib/credits.schema";
import { getMe } from "@/lib/profile.functions";
import { normalizePlan } from "@/lib/plans";

type Props = {
  prompt: string;
  onClose: () => void;
  // Feature 5 — lets the caller (ChatWindow) attach the freshly-saved
  // project to this thread so a follow-up like "Add Stripe" can be routed
  // through Smart Continue instead of a normal chat reply.
  onSaved?: (projectId: string) => void;
};

// The server appends "[zeus-engineer-error] <raw provider message>" to the
// stream when generation fails (see /api/engineer). Translate the common
// cases into something clear and actionable. English only, per owner policy.
function friendlyEngineerError(raw: string | undefined): string {
  const msg = (raw ?? "").replace(/^\s*\[zeus-engineer-error\]\s*/, "");
  if (/invalid authentication credentials|API key|API_KEY/i.test(msg))
    return "The AI model key on Zeus servers isn't working right now. Please try again later — the team has been notified.";
  if (/could not parse|No object generated/i.test(msg))
    return "Something went wrong while generating your project. Please try again.";
  if (/timeout|aborted|AbortError/i.test(msg))
    return "Generation took too long. Try a shorter prompt or start again.";
  if (/quota|rate.?limit|429/i.test(msg))
    return "The model hit its usage limit. Please try again in a little while.";
  if (/engineer_unavailable|temporarily unavailable|providers/i.test(msg))
    return "Zeus AI's engineering engine is temporarily unavailable. Please try again in a few minutes.";
  return msg ? `Generation failed: ${msg.slice(0, 160)}` : "Something went wrong generating this project.";
}

// ⚡ Zeus Project Engineer — Feature 1 UI.
//
// Deliberately NOT styled like the normal chat bubble list — this is the
// "completely different interface" the spec calls for, so the user
// instantly knows they left plain chat and entered Engineer Mode.
export function EngineerModePanel({ prompt, onClose, onSaved }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [thinkingOpen, setThinkingOpen] = useState(true);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const startedAt = useRef<number>(Date.now());
  const startedRef = useRef(false);

  const estimatedCredits = useMemo(() => estimateEngineerCredits(prompt), [prompt]);

  const meFn = useServerFn(getMe);
  const { data: profile } = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const planTier = normalizePlan(profile?.plan);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
  }, []);

  const { object, submit, isLoading, error, stop } = useObject({
    api: "/api/engineer",
    schema: engineerProjectSchema,
    fetch: async (input, init) => {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      return fetch(input, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
    },
  });

  // Feature 9 — Smart Warning: generation only starts once the user has
  // seen the estimated cost/time and explicitly confirmed, rather than
  // auto-firing the moment the panel mounts.
  const start = () => {
    setConfirmed(true);
    if (!token || startedRef.current) return;
    startedRef.current = true;
    startedAt.current = Date.now();
    submit({ prompt });
  };

  useEffect(() => {
    if (!confirmed || !token || startedRef.current) return;
    startedRef.current = true;
    startedAt.current = Date.now();
    submit({ prompt });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed, token]);

  const partial = object as PartialEngineerProject | undefined;
  const progress = computeEngineerProgress(partial);
  const files = (partial?.files ?? []).filter(Boolean) as { path?: string; content?: string }[];
  const currentFile = files.length > 0 ? files[files.length - 1]?.path : undefined;
  const done = !isLoading && !!partial?.devNotes && progress.percent >= 100;
  const failed = !!error;

  const elapsedSec = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
  const estimateTotalSec =
    progress.percent > 0 ? Math.round((elapsedSec / progress.percent) * 100) : 90;
  const remainingSec = Math.max(0, estimateTotalSec - elapsedSec);

  const warnings = useMemo(() => {
    const w: string[] = [];
    if (files.some((f) => (f.content ?? "").includes("TODO")))
      w.push("One or more files contain a TODO — review before shipping.");
    if (files.length > 0 && files.length < 3 && done)
      w.push("Fewer files than expected for a complete project — review the output.");
    return w;
  }, [files, done]);

  const saveFn = useServerFn(indexWorkspaceProject);
  const saveMut = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          name: partial?.projectName || "Zeus Generated Project",
          files: files
            .filter((f): f is { path: string; content: string } => !!f.path && f.content != null)
            .map((f) => ({ path: f.path, content: f.content })),
          skippedCount: 0,
        },
      }),
    onSuccess: (project: { id: string }) => {
      setSavedProjectId(project.id);
      onSaved?.(project.id);
      toast.success("Saved to Workspace — continue building it anytime.");
    },
    onError: (e: Error) =>
      toast.error(e.message || "Couldn't save this project to your Workspace."),
  });

  const handleExportZip = async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    for (const f of files) {
      if (f.path && f.content != null) zip.file(f.path, f.content);
    }
    if (partial?.readme) zip.file("README.md", partial.readme);
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(partial?.projectName || "zeus-project").replace(/[^a-z0-9-_]+/gi, "-")}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-gradient-to-b from-primary/5 via-background to-background">
      {/* Header — unmistakably not normal chat */}
      <div className="flex items-center justify-between border-b border-primary/20 bg-card/80 backdrop-blur px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Zap className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">Zeus Project Engineer</p>
            <p className="text-xs text-muted-foreground leading-tight">
              {!confirmed
                ? "Awaiting confirmation"
                : failed
                  ? "Generation failed"
                  : done
                    ? "Project ready"
                    : progress.currentStepLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && (
            <Button size="sm" variant="outline" onClick={() => stop()}>
              Stop
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {!confirmed && planTier === "free" && profile?.engineer_free_project_used ? (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
              <div>
                <p className="text-sm font-semibold mb-1">Free project already used</p>
                <p className="text-sm text-muted-foreground">
                  You've used your free project. Upgrade to Pro to continue.
                </p>
              </div>
              <div className="flex gap-2">
                <Button asChild>
                  <Link to="/upgrade">
                    <Zap className="size-4 mr-1.5" /> Upgrade to Pro
                  </Link>
                </Button>
                <Button variant="ghost" onClick={onClose}>
                  Back to Chat
                </Button>
              </div>
            </div>
          ) : !confirmed ? (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
              <div>
                <p className="text-sm font-semibold mb-1">Ready to build:</p>
                <p className="text-sm text-muted-foreground italic">"{prompt}"</p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5">
                  <Zap className="size-4 text-primary" />{" "}
                  {planTier === "ultimate" ? "Unlimited" : `~${estimatedCredits} Zeus Credits`}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="size-4 text-muted-foreground" />{" "}
                  {estimatedGenerationMinutes(estimatedCredits)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{engineerCreditPolicyLabel(planTier)}</p>
              <div className="flex gap-2">
                <Button onClick={start} disabled={!token}>
                  <Zap className="size-4 mr-1.5" /> Start Building
                </Button>
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Feature 2 — live engineering progress */}
              <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {progress.completedSteps}/{progress.totalSteps} steps
                  </span>
                  <span>{done ? "Ready" : failed ? "Stopped" : `~${remainingSec}s remaining`}</span>
                </div>
                <Progress value={done ? 100 : progress.percent} />
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 pt-1">
                  {ENGINEER_STEPS.map((step, i) => {
                    const complete = step.check(partial) || done;
                    const isCurrent = !complete && i === progress.completedSteps;
                    return (
                      <div
                        key={step.key}
                        className={cn(
                          "flex items-center gap-2 text-sm",
                          complete ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {complete ? (
                          <CheckCircle2 className="size-3.5 text-primary shrink-0" />
                        ) : isCurrent && isLoading ? (
                          <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
                        ) : (
                          <Circle className="size-3.5 shrink-0" />
                        )}
                        <span>{step.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Feature 3 — Engineer Thinking Panel (collapsible) */}
              <Collapsible open={thinkingOpen} onOpenChange={setThinkingOpen}>
                <div className="rounded-xl border border-border bg-card/40">
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium">
                      <span className="flex items-center gap-2">
                        <Boxes className="size-4 text-muted-foreground" /> Engineer Thinking Panel
                      </span>
                      <ChevronDown
                        className={cn(
                          "size-4 text-muted-foreground transition-transform",
                          thinkingOpen && "rotate-180",
                        )}
                      />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4 grid sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Current Goal</p>
                        <p className="font-medium">
                          {partial?.projectName || "Understanding your request…"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Current File</p>
                        <p className="font-mono text-xs truncate">{currentFile ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Current Module</p>
                        <p>{progress.currentStepLabel}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <Clock className="size-3" /> Estimated Remaining Time
                        </p>
                        <p>{done ? "Done" : `~${remainingSec}s`}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-xs text-muted-foreground mb-1">
                          Files Generated ({files.length})
                        </p>
                        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                          {files.length === 0 && (
                            <span className="text-xs text-muted-foreground">None yet</span>
                          )}
                          {files.map((f, i) => (
                            <Badge
                              key={`${f.path}-${i}`}
                              variant="secondary"
                              className="font-mono text-[10px] font-normal"
                            >
                              {f.path}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      {warnings.length > 0 && (
                        <div className="sm:col-span-2">
                          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                            <AlertTriangle className="size-3 text-amber-500" /> Warnings
                          </p>
                          <ul className="text-xs text-amber-600 dark:text-amber-400 space-y-0.5">
                            {warnings.map((w) => (
                              <li key={w}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {done &&
                        partial?.productionChecklist &&
                        partial.productionChecklist.length > 0 && (
                          <div className="sm:col-span-2">
                            <p className="text-xs text-muted-foreground mb-1">
                              Performance / Production Suggestions
                            </p>
                            <ul className="text-xs space-y-0.5 list-disc list-inside text-muted-foreground">
                              {partial.productionChecklist
                                .filter(Boolean)
                                .slice(0, 8)
                                .map((c, i) => (
                                  <li key={i}>{c as string}</li>
                                ))}
                            </ul>
                          </div>
                        )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>

              {failed && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                  <span className="font-medium">{friendlyEngineerError(error?.message)}</span>
                  <div className="mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        startedRef.current = false;
                        startedAt.current = Date.now();
                        submit({ prompt });
                        startedRef.current = true;
                      }}
                    >
                      Resume Generation
                    </Button>
                  </div>
                </div>
              )}

              {/* Feature 4 — professional project output, once ready */}
              {(done || files.length > 0) && (
                <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{partial?.projectName ?? "Generating…"}</p>
                      <p className="text-sm text-muted-foreground">{partial?.description}</p>
                    </div>
                    {partial?.framework && <Badge variant="outline">{partial.framework}</Badge>}
                  </div>
                  {partial?.stack && partial.stack.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {partial.stack.filter(Boolean).map((s, i) => (
                        <Badge key={i} variant="secondary" className="font-normal">
                          {s as string}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FolderTree className="size-4" /> {files.length} files generated
                  </div>

                  {done && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {!savedProjectId ? (
                        <Button
                          size="sm"
                          onClick={() => saveMut.mutate()}
                          disabled={saveMut.isPending}
                        >
                          {saveMut.isPending ? (
                            <Loader2 className="size-4 animate-spin mr-1.5" />
                          ) : (
                            <FolderPlus className="size-4 mr-1.5" />
                          )}
                          Save to Workspace
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" asChild>
                          <Link to="/workspace">Open in Workspace</Link>
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={handleExportZip}>
                        <Download className="size-4 mr-1.5" /> Export ZIP
                      </Button>
                      <Button size="sm" variant="ghost" onClick={onClose}>
                        <FileCode2 className="size-4 mr-1.5" /> Back to Chat
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
