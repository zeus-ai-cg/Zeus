import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listMemories,
  createMemory,
  deleteMemory,
  clearMemories,
  getMemorySettings,
  setMemorySettings,
} from "@/lib/memory.functions";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useState } from "react";
import { Brain, Plus, Trash2, AlertCircle } from "lucide-react";

type Memory = {
  id: string;
  content: string;
  category: string;
  source: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  preference: "Preference",
  goal: "Goal",
  context: "Context",
  constraint: "Constraint",
};

export function MemoryPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMemories);
  const createFn = useServerFn(createMemory);
  const deleteFn = useServerFn(deleteMemory);
  const clearFn = useServerFn(clearMemories);
  const getSettingsFn = useServerFn(getMemorySettings);
  const setSettingsFn = useServerFn(setMemorySettings);

  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState<string>("general");

  const { data: settings } = useQuery({
    queryKey: ["memory-settings"],
    queryFn: () => getSettingsFn() as Promise<{ enabled: boolean; plan: string; limit: number }>,
  });

  const { data: memories = [] } = useQuery({
    queryKey: ["memories"],
    queryFn: () => listFn() as unknown as Promise<Memory[]>,
    enabled: (settings as { enabled?: boolean } | undefined)?.enabled ?? true,
  });

  const toggleMut = useMutation({
    mutationFn: (enabled: boolean) => setSettingsFn({ data: { enabled } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memory-settings"] });
      qc.invalidateQueries({ queryKey: ["memories"] });
      toast.success("Memory setting updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMut = useMutation({
    mutationFn: () =>
      createFn({ data: { content: newContent, category: newCategory as never, source: "user" as const } }),
    onSuccess: () => {
      setNewContent("");
      setNewCategory("general");
      qc.invalidateQueries({ queryKey: ["memories"] });
      toast.success("Memory saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memories"] });
      toast.success("Memory deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearMut = useMutation({
    mutationFn: () => clearFn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memories"] });
      toast.success("All memories cleared");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const usedCount = (memories as Memory[]).length;
  const limit = (settings as { limit?: number } | undefined)?.limit ?? 10;
  const atLimit = usedCount >= limit;

  return (
    <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
        <span className="size-6 rounded-md grid place-items-center bg-secondary">
          <Brain className="size-4" />
        </span>
        Memory
      </div>
      <div className="p-5 space-y-4">
        {/* Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Memory system</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              Zeus AI remembers facts you share across conversations.
            </div>
          </div>
          <Switch
            checked={(settings as { enabled?: boolean } | undefined)?.enabled ?? true}
            onCheckedChange={(v) => toggleMut.mutate(v)}
          />
        </div>

        {(settings as { enabled?: boolean } | undefined)?.enabled && (
          <>
            {/* Usage */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="size-3.5" />
              {usedCount} / {limit} memories used ({(settings as { plan?: string } | undefined)?.plan ?? "free"} plan)
            </div>

            {/* Add memory */}
            {!atLimit && (
              <div className="flex gap-2">
                <Input
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="e.g. I prefer TypeScript, use React, work on mobile"
                  className="flex-1"
                  maxLength={500}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newContent.trim()) addMut.mutate();
                  }}
                />
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={() => addMut.mutate()}
                  disabled={!newContent.trim() || addMut.isPending}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            )}

            {atLimit && (
              <div className="text-sm text-amber-500">
                Memory limit reached. Delete some memories to add new ones.
              </div>
            )}

            {/* Memory list */}
            {memories.length > 0 && (
              <div className="space-y-2">
                {memories.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-start justify-between gap-3 p-3 rounded-lg bg-secondary/50 border border-border/50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{m.content}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {CATEGORY_LABELS[m.category] ?? m.category}
                        {" · "}
                        {new Date(m.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteMut.mutate(m.id)}
                      disabled={deleteMut.isPending}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Clear all */}
            {memories.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10">
                    Clear all memories
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all memories?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently deletes all your stored memories. Zeus AI will
                      no longer remember facts about you across conversations.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => clearMut.mutate()}>
                      Clear all
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </>
        )}
      </div>
    </div>
  );
}
