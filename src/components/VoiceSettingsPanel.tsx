import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AudioLines, Volume2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_VOICE_SETTINGS,
  getVoices,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  loadVoiceSettings,
  pickVoice,
  saveVoiceSettings,
  type VoiceSettings,
} from "@/lib/voice";

/**
 * Zeus Live Voice settings — a small section on the existing Settings page.
 * Preferences are stored in localStorage (same pattern as the theme and the
 * rest of the client-side settings), so they apply identically in the web
 * app and the Electron desktop shell. No server/database involvement.
 */
export function VoiceSettingsPanel() {
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const synthesisSupported = isSpeechSynthesisSupported();
  const recognitionSupported = isSpeechRecognitionSupported();

  useEffect(() => {
    setHydrated(true);
    setSettings(loadVoiceSettings());
  }, []);

  // Voices can load asynchronously (voiceschanged) — refresh until they appear.
  useEffect(() => {
    if (!isSpeechSynthesisSupported()) return;
    const refresh = () => setVoices(getVoices());
    refresh();
    window.speechSynthesis.addEventListener("voiceschanged", refresh);
    const timer = window.setTimeout(refresh, 600);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", refresh);
      window.clearTimeout(timer);
    };
  }, []);

  const update = (patch: Partial<VoiceSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveVoiceSettings(next);
      return next;
    });
  };

  const testVoice = () => {
    if (!isSpeechSynthesisSupported()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      "Hi, I'm Zeus. Your voice assistant is ready. How can I help?",
    );
    const voice = pickVoice(settings.voiceURI);
    if (voice) utterance.voice = voice;
    utterance.rate = settings.rate;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
        <span className="size-6 rounded-md grid place-items-center bg-secondary">
          <AudioLines className="size-4" />
        </span>
        Voice
      </div>

      <div className="divide-y divide-border">
        <div className="p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-medium">Zeus Live Voice</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              Talk to Zeus from the chat composer. Works in your browser and in Zeus AI Desktop.
            </div>
          </div>
          <Switch
            checked={hydrated && settings.enabled}
            onCheckedChange={(v) => {
              update({ enabled: v });
              toast.success(v ? "Voice on" : "Voice off");
            }}
          />
        </div>

        <div className="p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-medium">Speak responses aloud</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              Zeus reads its replies out loud after every message. Voice turns always speak their
              reply, whether or not this is on.
            </div>
          </div>
          <Switch
            checked={hydrated && settings.autoSpeak}
            onCheckedChange={(v) => {
              update({ autoSpeak: v });
              toast.success(v ? "Auto-speak on" : "Auto-speak off");
            }}
          />
        </div>

        <div className="p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-medium">Zeus's voice</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              Pick the system voice Zeus speaks with.
            </div>
          </div>
          {synthesisSupported ? (
            <Select
              value={settings.voiceURI ?? "default"}
              onValueChange={(v) => update({ voiceURI: v === "default" ? null : v })}
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default voice</SelectItem>
                {voices.map((v) => (
                  <SelectItem key={v.voiceURI} value={v.voiceURI}>
                    {v.name} · {v.lang}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs text-muted-foreground">
              Text-to-speech isn't available in this browser.
            </span>
          )}
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="font-medium">Speaking speed</div>
              <div className="text-sm text-muted-foreground mt-0.5">
                Slower for a calm tutor, faster for quick answers.
              </div>
            </div>
            <span className="text-sm font-mono text-primary w-12 text-right">
              {settings.rate.toFixed(2)}×
            </span>
          </div>
          <Slider
            min={0.5}
            max={1.5}
            step={0.05}
            value={[settings.rate]}
            onValueChange={([v]) => update({ rate: v })}
            disabled={!synthesisSupported}
            className="mt-4"
          />
          <div className="flex items-center gap-2 mt-3">
            <Button size="sm" variant="outline" disabled={!synthesisSupported} onClick={testVoice}>
              <Volume2 className="size-3.5 mr-1.5" /> Test voice
            </Button>
            {!recognitionSupported && (
              <p className="text-xs text-muted-foreground">
                Voice input isn't supported in this browser — the mic button will stay disabled.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
