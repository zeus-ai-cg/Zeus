import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SlidersHorizontal } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getMe, setCodingPreferences } from "@/lib/profile.functions";

const CODING_STYLES = [
  { value: "idiomatic", label: "Idiomatic (default)" },
  { value: "concise", label: "Concise" },
  { value: "verbose", label: "Verbose / heavily commented" },
  { value: "functional", label: "Functional style" },
];
const RESPONSE_LENGTHS = [
  { value: "brief", label: "Brief" },
  { value: "balanced", label: "Balanced (default)" },
  { value: "detailed", label: "Detailed" },
];
const CREATIVITY_LEVELS = [
  { value: "conservative", label: "Conservative" },
  { value: "balanced", label: "Balanced (default)" },
  { value: "creative", label: "Creative" },
];

export function CodingPreferencesPanel() {
  const qc = useQueryClient();
  const meFn = useServerFn(getMe);
  const { data: profile } = useQuery({ queryKey: ["me"], queryFn: () => meFn() });

  const saveFn = useServerFn(setCodingPreferences);
  const saveMut = useMutation({
    mutationFn: (vars: {
      codingStyle?: string;
      responseLength?: string;
      creativityLevel?: string;
    }) => saveFn({ data: vars as never }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
    onError: (e: Error) => toast.error(e.message || "Couldn't save that preference."),
  });

  return (
    <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
        <span className="size-6 rounded-md grid place-items-center bg-secondary">
          <SlidersHorizontal className="size-4" />
        </span>
        Coding preferences
      </div>
      <div className="p-5 space-y-4">
        <p className="text-sm text-muted-foreground">
          Applied to chat responses and every project modification Zeus AI generates.
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Coding style</p>
            <Select
              value={profile?.coding_style ?? "idiomatic"}
              onValueChange={(v) => saveMut.mutate({ codingStyle: v as never })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CODING_STYLES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Response length</p>
            <Select
              value={profile?.response_length ?? "balanced"}
              onValueChange={(v) => saveMut.mutate({ responseLength: v as never })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESPONSE_LENGTHS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Creativity</p>
            <Select
              value={profile?.creativity_level ?? "balanced"}
              onValueChange={(v) => saveMut.mutate({ creativityLevel: v as never })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CREATIVITY_LEVELS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
