import { AudioLines, Loader2, Mic, MicOff, Pause, Play, Square, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { UseVoiceResult } from "@/hooks/use-voice";

/**
 * Zeus Live Voice — composer mic button. Renders the four assistant states
 * (idle / listening / processing / speaking) as a single compact control:
 *   - idle: plain mic; click to start listening
 *   - listening: pulsing mic; click to stop
 *   - processing: spinner; disabled until the reply streams in
 *   - speaking: stop-square; click to stop Zeus mid-sentence
 * Gracefully degrades to a disabled mic-off button when speech recognition
 * isn't available (so chat itself is never affected).
 */
export function VoiceControl({
  voice,
  disabled,
  className,
}: {
  voice: UseVoiceResult;
  disabled?: boolean;
  className?: string;
}) {
  const { state, settings, recognitionSupported, start, stopListening, stopSpeaking, error } =
    voice;

  const listening = state === "listening";
  const processing = state === "processing";
  const speaking = state === "speaking";
  const voiceOff = !settings.enabled;

  // The mic control is ALWAYS visible in the composer so voice can never
  // silently disappear. When it can't be used, the button is disabled with a
  // clear tooltip instead of being hidden: voice off in Settings, or speech
  // recognition unavailable in this browser/runtime (e.g. Firefox/Safari).
  if (!recognitionSupported) {
    return (
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled
        aria-label="Voice input isn't supported in this browser"
        title="Voice input isn't supported in this browser"
        className={cn("absolute bottom-2 right-12 size-9", className)}
      >
        <MicOff className="size-4 text-muted-foreground/40" />
      </Button>
    );
  }

  const handleClick = () => {
    if (disabled || voiceOff) return;
    if (speaking) {
      stopSpeaking();
      return;
    }
    if (listening) {
      stopListening();
      return;
    }
    start();
  };

  const label = voiceOff
    ? "Voice is turned off in Settings"
    : listening
      ? "Stop listening"
      : processing
        ? voice.transcribing
          ? "Transcribing…"
          : "Thinking…"
        : speaking
          ? "Stop speaking"
          : "Talk to Zeus";

  return (
    <div className={cn("absolute bottom-2 right-12", className)}>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={disabled || processing || voiceOff}
        onClick={handleClick}
        aria-label={label}
        title={label}
        className={cn(
          "relative size-9 transition-colors",
          voiceOff && "opacity-60",
          listening && "text-primary",
          speaking && "text-accent",
          error && "text-destructive",
        )}
      >
        {voiceOff ? (
          <MicOff className="size-4" />
        ) : listening ? (
          <span className="relative grid place-items-center">
            <span className="absolute inline-flex size-6 rounded-full bg-primary/40 animate-ping" />
            <Mic className="relative size-4" />
          </span>
        ) : processing ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : speaking ? (
          <Square className="size-3.5" />
        ) : (
          <Mic className="size-4" />
        )}
      </Button>
    </div>
  );
}

/**
 * Status pill shown above the composer while a voice turn is active:
 * "Listening…" with the live transcript, "Thinking…", or "Zeus is
 * speaking…" with pause/resume/stop controls. Non-intrusive — disappears as
 * soon as the turn ends.
 */
export function VoiceStatusPill({ voice }: { voice: UseVoiceResult }) {
  const {
    state,
    interim,
    error,
    settings,
    speakingPaused,
    pauseSpeaking,
    resumeSpeaking,
    stopSpeaking,
  } = voice;

  if (state === "idle" && !error) return null;
  if (!settings.enabled) return null;

  if (state === "idle" && error) {
    return (
      <div className="max-w-3xl mx-auto mb-2 animate-in fade-in slide-in-from-bottom-1">
        <div className="inline-flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/25 rounded-full px-3 py-1.5 max-w-full">
          <Volume2 className="size-3.5 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto mb-2 animate-in fade-in slide-in-from-bottom-1">
      <div className="inline-flex items-center gap-2.5 text-xs text-muted-foreground bg-card/90 border border-border rounded-full px-3 py-1.5 shadow-sm max-w-full">
        {state === "listening" && (
          <>
            <AudioLines className="size-3.5 text-primary animate-pulse shrink-0" />
            <span className="font-medium text-foreground">Listening…</span>
            <VoiceWaveform className="text-primary" />
            {interim && <span className="italic truncate max-w-[40vw]">“{interim}”</span>}
            <span className="hidden sm:inline opacity-70">
              {voice.backend === "server" ? "tap the mic to send" : "tap the mic to stop"}
            </span>
          </>
        )}
        {state === "processing" && (
          <>
            <Loader2 className="size-3.5 animate-spin shrink-0" />
            <span className="font-medium text-foreground">
              {voice.transcribing ? "Transcribing…" : "Thinking…"}
            </span>
          </>
        )}
        {state === "speaking" && (
          <>
            <Volume2 className="size-3.5 text-accent shrink-0" />
            <span className="font-medium text-foreground">Zeus is speaking…</span>
            <VoiceWaveform className="text-accent" />
            <button
              type="button"
              onClick={() => (speakingPaused ? resumeSpeaking() : pauseSpeaking())}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 hover:bg-secondary transition-colors"
              title={speakingPaused ? "Resume" : "Pause"}
            >
              {speakingPaused ? <Play className="size-3" /> : <Pause className="size-3" />}
            </button>
            <button
              type="button"
              onClick={stopSpeaking}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 hover:bg-secondary transition-colors"
              title="Stop speaking"
            >
              <Square className="size-3" />
            </button>
          </>
        )}
      </div>
    </div>
  );
} /** Shared animated equalizer used by the composer pill and the command center. */
export function VoiceWaveform({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-[2px] h-3.5", className)} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="zeus-wave-bar" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </span>
  );
}
