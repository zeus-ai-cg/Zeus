import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, KeyRound, Loader2, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getMe } from "@/lib/profile.functions";
import {
  listUserApiKeys,
  saveUserApiKey,
  deleteUserApiKey,
  setActiveModel,
} from "@/lib/model-keys.functions";
import { PROVIDERS, getProvider, type ProviderId } from "@/lib/model-providers";

export function ModelSettingsPanel() {
  const qc = useQueryClient();

  const meFn = useServerFn(getMe);
  const { data: profile } = useQuery({ queryKey: ["me"], queryFn: () => meFn() });

  const keysFn = useServerFn(listUserApiKeys);
  const { data: keys = [] } = useQuery({ queryKey: ["user-api-keys"], queryFn: () => keysFn() });
  const keyByProvider = new Map(keys.map((k) => [k.provider, k]));

  const activeProvider = (profile?.active_model_provider ?? "gemini") as ProviderId;
  const activeModelId = profile?.active_model_id ?? "gemini-2.5-flash";

  const setActiveFn = useServerFn(setActiveModel);
  const setActiveMut = useMutation({
    mutationFn: (vars: { provider: ProviderId; modelId: string }) => setActiveFn({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Active model updated");
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't update the active model."),
  });

  const activeProviderInfo = getProvider(activeProvider) ?? PROVIDERS[0];
  const canUseActive = activeProvider === "gemini" || keyByProvider.has(activeProvider);

  return (
    <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
        <span className="size-6 rounded-md grid place-items-center bg-secondary">
          <Bot className="size-4" />
        </span>
        AI Models
      </div>

      <div className="p-5 border-b border-border">
        <div className="font-medium">Active model</div>
        <div className="text-sm text-muted-foreground mt-0.5">
          Which model your chats and project modifications use.
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <Select
            value={activeProvider}
            onValueChange={(v) => {
              const provider = getProvider(v);
              if (provider)
                setActiveMut.mutate({ provider: provider.id, modelId: provider.models[0].id });
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={activeModelId}
            onValueChange={(v) => setActiveMut.mutate({ provider: activeProvider, modelId: v })}
          >
            <SelectTrigger className="w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {activeProviderInfo.models.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!canUseActive && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
            Add an API key for {activeProviderInfo.label} below — chat won't work for this provider
            until you do.
          </p>
        )}
      </div>

      <div className="divide-y divide-border">
        {PROVIDERS.map((provider) => (
          <ProviderKeyRow
            key={provider.id}
            provider={provider.id}
            label={provider.label}
            placeholder={provider.keyPlaceholder}
            helpUrl={provider.keyHelpUrl}
            builtIn={provider.builtIn}
            existing={keyByProvider.get(provider.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ProviderKeyRow({
  provider,
  label,
  placeholder,
  helpUrl,
  builtIn,
  existing,
}: {
  provider: ProviderId;
  label: string;
  placeholder: string;
  helpUrl: string;
  builtIn?: boolean;
  existing?: { provider: string; last_four: string };
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(false);

  const saveFn = useServerFn(saveUserApiKey);
  const saveMut = useMutation({
    mutationFn: () => saveFn({ data: { provider, apiKey: value } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-api-keys"] });
      toast.success(`${label} key saved`);
      setValue("");
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't save that key."),
  });

  const deleteFn = useServerFn(deleteUserApiKey);
  const deleteMut = useMutation({
    mutationFn: () => deleteFn({ data: { provider } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-api-keys"] });
      toast.success(`${label} key removed`);
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't remove that key."),
  });

  return (
    <div className="p-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <KeyRound className="size-3.5 text-muted-foreground" />
          <span className="font-medium">{label}</span>
          {builtIn && !existing && (
            <Badge variant="outline" className="text-xs">
              Uses Zeus AI's built-in key
            </Badge>
          )}
          {existing && (
            <Badge variant="secondary" className="text-xs flex items-center gap-1">
              <CheckCircle2 className="size-3" /> Connected · •••• {existing.last_four}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {existing && !editing && (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Update key
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={deleteMut.isPending}
                onClick={() => deleteMut.mutate()}
              >
                {deleteMut.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </Button>
            </>
          )}
          {!existing && !editing && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Add key
            </Button>
          )}
        </div>
      </div>
      {editing && (
        <div className="flex gap-2 mt-3 flex-wrap items-center">
          <Input
            type="password"
            autoComplete="off"
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="max-w-xs"
          />
          <Button
            size="sm"
            disabled={value.length < 8 || saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            {saveMut.isPending ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : null}
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(false);
              setValue("");
            }}
          >
            Cancel
          </Button>
          <a
            href={helpUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Get a key
          </a>
        </div>
      )}
    </div>
  );
}
