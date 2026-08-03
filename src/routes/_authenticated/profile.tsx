import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getMe, updateProfile } from "@/lib/profile.functions";
import { PageHeader } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { User } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const me = useServerFn(getMe);
  const upd = useServerFn(updateProfile);
  const qc = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ["me"], queryFn: () => me() });

  const [form, setForm] = useState({
    display_name: "",
    full_name: "",
    age: "",
    nationality: "",
    avatar_url: "",
  });

  useEffect(() => {
    if (profile)
      setForm({
        display_name: profile.display_name ?? "",
        full_name: profile.full_name ?? "",
        age: profile.age ? String(profile.age) : "",
        nationality: profile.nationality ?? "",
        avatar_url: profile.avatar_url ?? "",
      });
  }, [profile]);

  const mut = useMutation({
    mutationFn: () =>
      upd({
        data: {
          display_name: form.display_name || undefined,
          full_name: form.full_name || null,
          age: form.age ? Number(form.age) : null,
          nationality: form.nationality || null,
          avatar_url: form.avatar_url || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Profile saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onPickAvatar = (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Only images");
    if (file.size > 1.5 * 1024 * 1024) return toast.error("Image must be under 1.5 MB");
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, avatar_url: reader.result as string }));
    reader.readAsDataURL(file);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-10 animate-in fade-in duration-300">
        <PageHeader title="Your Profile" subtitle="Your identity in Zeus AI." />

        <div className="mt-8 rounded-xl border border-border bg-card/60 p-6 space-y-5">
          <div className="flex items-center gap-4">
            <div className="size-20 rounded-full overflow-hidden bg-secondary border border-border grid place-items-center shrink-0">
              {form.avatar_url ? (
                <img src={form.avatar_url} alt="avatar" className="size-full object-cover" />
              ) : (
                <User className="size-8 text-muted-foreground" />
              )}
            </div>
            <div>
              <label className="inline-block">
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onPickAvatar(f);
                  }}
                />
                <span className="inline-flex items-center text-sm px-3 py-1.5 rounded-md border border-border bg-secondary hover:bg-secondary/80 cursor-pointer transition-colors">
                  Upload photo
                </span>
              </label>
              {form.avatar_url && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setForm((f) => ({ ...f, avatar_url: "" }))}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>

          <Field label="Display name">
            <Input
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            />
          </Field>
          <Field label="Full name">
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Age">
              <Input
                type="number"
                min={5}
                max={120}
                value={form.age}
                onChange={(e) => setForm({ ...form, age: e.target.value })}
              />
            </Field>
            <Field label="Nationality">
              <Input
                value={form.nationality}
                onChange={(e) => setForm({ ...form, nationality: e.target.value })}
                placeholder="e.g. Pakistani"
              />
            </Field>
          </div>

          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow w-full"
          >
            {mut.isPending ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
