import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getEnabledBuiltinSkills,
  toggleBuiltinSkill,
  listCustomSkills,
  createCustomSkill,
  deleteCustomSkill,
} from "@/lib/skills/functions";
import { BUILTIN_SKILLS } from "@/lib/skills/builtin";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useState } from "react";
import { Wrench, Plus, Trash2, Lock, Sparkles } from "lucide-react";
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

type CustomSkill = {
  id: string;
  name: string;
  description: string | null;
  instructions: string;
  examples: string | null;
  is_active: boolean;
  created_at: string;
};

const PLAN_SKILL_LIMITS: Record<string, { builtin: number; custom: number }> = {
  free: { builtin: 3, custom: 0 },
  pro: { builtin: 8, custom: 3 },
  ultimate: { builtin: 8, custom: 10 },
};

export function SkillsPanel() {
  const qc = useQueryClient();
  const builtinFn = useServerFn(getEnabledBuiltinSkills);
  const toggleFn = useServerFn(toggleBuiltinSkill);
  const listCustomFn = useServerFn(listCustomSkills);
  const createCustomFn = useServerFn(createCustomSkill);
  const deleteCustomFn = useServerFn(deleteCustomSkill);

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newInstructions, setNewInstructions] = useState("");
  const [showCustomForm, setShowCustomForm] = useState(false);

  const { data: builtinData } = useQuery({
    queryKey: ["builtin-skills"],
    queryFn: () => builtinFn(),
  });

  const { data: customSkills = [] } = useQuery({
    queryKey: ["custom-skills"],
    queryFn: () => listCustomFn() as unknown as Promise<CustomSkill[]>,
    enabled: builtinData?.plan !== "free",
  });

  const enabledIds = builtinData?.enabledIds ?? [];
  const plan = builtinData?.plan ?? "free";
  const limits = PLAN_SKILL_LIMITS[plan] ?? PLAN_SKILL_LIMITS.free;

  const toggleMut = useMutation({
    mutationFn: ({ skillId, enabled }: { skillId: string; enabled: boolean }) =>
      toggleFn({ data: { skillId, enabled } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["builtin-skills"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: () =>
      createCustomFn({
        data: {
          name: newName,
          description: newDesc || undefined,
          instructions: newInstructions,
        },
      }),
    onSuccess: () => {
      setNewName("");
      setNewDesc("");
      setNewInstructions("");
      setShowCustomForm(false);
      qc.invalidateQueries({ queryKey: ["custom-skills"] });
      toast.success("Custom skill created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCustomFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-skills"] });
      toast.success("Skill deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
        <span className="size-6 rounded-md grid place-items-center bg-secondary">
          <Wrench className="size-4" />
        </span>
        Skills
      </div>
      <div className="p-5 space-y-5">
        <p className="text-sm text-muted-foreground">
          Skills give Zeus AI specialized expertise. Enable relevant skills for the topic you're
          working on — they're injected into the system prompt when your message matches.
        </p>

        {/* Builtin skills */}
        <div className="space-y-2">
          <div className="text-sm font-medium">
            Builtin Skills
            <span className="ml-2 text-muted-foreground">
              ({enabledIds.length}/{limits.builtin} enabled · {plan} plan)
            </span>
          </div>
          {BUILTIN_SKILLS.map((skill) => {
            const enabled = enabledIds.includes(skill.id);
            const isLocked = !enabled && enabledIds.length >= limits.builtin;
            return (
              <div
                key={skill.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border/50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg">{skill.icon}</span>
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{skill.name}</div>
                    <div className="text-xs text-muted-foreground">{skill.description}</div>
                  </div>
                </div>
                {isLocked && !enabled ? (
                  <Lock className="size-4 text-muted-foreground shrink-0" />
                ) : (
                  <Switch
                    checked={enabled}
                    onCheckedChange={(v) => toggleMut.mutate({ skillId: skill.id, enabled: v })}
                    disabled={toggleMut.isPending}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Custom skills */}
        {plan !== "free" && (
          <div className="space-y-3">
            <div className="text-sm font-medium flex items-center justify-between">
              <span>
                Custom Skills
                <span className="ml-2 text-muted-foreground">
                  ({customSkills.length}/{limits.custom})
                </span>
              </span>
              {customSkills.length < limits.custom && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCustomForm(!showCustomForm)}
                >
                  <Plus className="size-3.5 mr-1" />
                  New
                </Button>
              )}
            </div>

            {showCustomForm && (
              <div className="p-4 rounded-lg border border-border space-y-3">
                <Input
                  placeholder="Skill name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={100}
                />
                <Input
                  placeholder="Short description (optional)"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  maxLength={200}
                />
                <Textarea
                  placeholder="Instructions for Zeus AI when this skill is active..."
                  value={newInstructions}
                  onChange={(e) => setNewInstructions(e.target.value)}
                  maxLength={2000}
                  rows={4}
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setShowCustomForm(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => createMut.mutate()}
                    disabled={!newName.trim() || !newInstructions.trim() || createMut.isPending}
                  >
                    <Sparkles className="size-3.5 mr-1" />
                    Create
                  </Button>
                </div>
              </div>
            )}

            {customSkills.map((skill) => (
              <div
                key={skill.id}
                className="flex items-start justify-between gap-3 p-3 rounded-lg bg-secondary/50 border border-border/50"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm">{skill.name}</div>
                  {skill.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">{skill.description}</div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {skill.instructions}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteMut.mutate(skill.id)}
                  disabled={deleteMut.isPending}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {plan === "free" && (
          <p className="text-xs text-muted-foreground italic">
            Custom skills are available on Pro and Ultimate plans.
          </p>
        )}
      </div>
    </div>
  );
}
