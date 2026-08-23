// Zeus Live Voice — core voice engine (framework-agnostic).
//
// Project Olympus foundation (v1.5 Feature 1). This module owns the raw
// capabilities: voice settings persistence, speech-recognition feature
// detection, and the text-to-speech manager. It is deliberately free of
// React — the UI state machine lives in src/hooks/use-voice.ts and future
// Olympus layers (command center, smart assistants) can drive the same
// primitives without touching the UI.
//
// Two recognition backends are exposed behind one controller interface:
//   - "native": the free, platform-native Web Speech API
//     (webkitSpeechRecognition / SpeechRecognition) — works in Google
//     Chrome, unavailable/unreliable in Electron (no baked-in Google speech
//     key), so it's used on the web only.
//   - "server": MediaRecorder captures microphone audio which is uploaded
//     to POST /api/voice/transcribe (server-side STT via Groq Whisper using
//     the server-only GROQ_API_KEY — never exposed to the client). Used by
//     the Electron desktop app and as a web fallback.
// speechSynthesis (TTS) stays native everywhere.

/* ── settings ─────────────────────────────────────────────────── */

export type VoiceState = "idle" | "listening" | "processing" | "speaking" | "error";

export type VoiceSettings = {
  /** Master switch — hides the mic control when off. */
  enabled: boolean;
  /** Speak every assistant reply aloud, even for typed messages. */
  autoSpeak: boolean;
  /** speechSynthesis voiceURI; null = pick the best default. */
  voiceURI: string | null;
  /** Speaking rate multiplier (0.5–1.5). */
  rate: number;
};

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: true,
  autoSpeak: false,
  voiceURI: null,
  rate: 1,
};

const SETTINGS_KEY = "zeus-voice-settings";

export function loadVoiceSettings(): VoiceSettings {
  if (typeof window === "undefined") return { ...DEFAULT_VOICE_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_VOICE_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
    return {
      enabled:
        typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_VOICE_SETTINGS.enabled,
      autoSpeak:
        typeof parsed.autoSpeak === "boolean" ? parsed.autoSpeak : DEFAULT_VOICE_SETTINGS.autoSpeak,
      voiceURI: typeof parsed.voiceURI === "string" && parsed.voiceURI ? parsed.voiceURI : null,
      rate:
        typeof parsed.rate === "number" && parsed.rate >= 0.5 && parsed.rate <= 2
          ? parsed.rate
          : DEFAULT_VOICE_SETTINGS.rate,
    };
  } catch {
    return { ...DEFAULT_VOICE_SETTINGS };
  }
}

export function saveVoiceSettings(settings: VoiceSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable (private mode / SSR) — settings just won't persist
  }
}

/* ── speech recognition ───────────────────────────────────────── */

// Minimal structural types — webkitSpeechRecognition isn't in lib.dom, and
// the standard SpeechRecognition types differ across TS versions, so we type
// against the small surface we actually use.
export interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: { transcript: string; confidence: number };
}

export interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

export interface SpeechRecognitionErrorEventLike {
  error: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getRecognitionCtor() != null;
}

export function createSpeechRecognition(): SpeechRecognitionLike | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;
  try {
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    return rec;
  } catch {
    return null;
  }
}

/** Human-readable message for a recognition error code. Empty = stay silent. */
export function voiceErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was denied. Allow the microphone in your browser or system settings, then tap the mic again.";
    case "no-speech":
      return "I didn't hear anything — tap the mic and try again.";
    case "audio-capture":
      return "No microphone was found. Connect one and try again.";
    case "network":
      return "Voice recognition hit a network error. Check your connection and try again.";
    case "language-not-supported":
      return "Voice recognition isn't supported for this language.";
    case "auth-required":
      return "Please sign in to use voice input. Sign in and try again.";
    case "usage-limit":
      return "You've reached your usage limit for voice input. Try again later.";
    case "audio-too-large":
      return "That recording was too long. Try a shorter message.";
    case "service-error":
      return "Transcription is temporarily unavailable. Try again in a moment.";
    case "timed-out":
      return "Transcription timed out. Check your connection and try again.";
    case "start-failed":
      return "Couldn't start the microphone. Check that it's available, then try again.";
    case "aborted":
      return "";
    default:
      return "Voice input failed. Please try again.";
  }
}

/* ── recognition backends ──────────────────────────────────────── */

/**
 * Which engine powers a voice turn:
 *   - "native"  → the Web Speech API (SpeechRecognition). Works in Google
 *     Chrome; unavailable/unreliable in Electron and other Chromium builds.
 *   - "server"  → MediaRecorder captures microphone audio, which is uploaded
 *     to POST /api/voice/transcribe (server-side STT, credential stays on
 *     the server). Used by the Electron desktop app and as a web fallback.
 */
export type RecognitionBackend = "native" | "server";

/**
 * Backend-agnostic recognizer surface used by use-voice. Handlers are
 * captured at start() time, so a caller may null the controller's handler
 * fields immediately after stop()/abort() without losing in-flight events.
 */
export interface RecognizerController {
  kind: RecognitionBackend;
  onstart: (() => void) | null;
  /** finalText = ready-to-submit transcript; interimText = live preview. */
  onresult: ((finalText: string, interimText: string) => void) | null;
  onerror: ((code: string, message?: string) => void) | null;
  onend: (() => void) | null;
  /** Fired when the backend enters an upload/transcribe phase (server only). */
  onprocessing: (() => void) | null;
  start(): void;
  /** Stop and finalize (native: ends recognition; server: uploads audio). */
  stop(): void;
  /** Cancel and discard everything (no transcript is delivered). */
  abort(): void;
}

/** Wrap the Web Speech recognizer behind the shared controller interface. */
export function createNativeRecognizer(): RecognizerController | null {
  const rec = createSpeechRecognition();
  if (!rec) return null;

  let hooks: Pick<
    RecognizerController,
    "onstart" | "onresult" | "onerror" | "onend" | "onprocessing"
  > | null = null;

  const controller: RecognizerController = {
    kind: "native",
    onstart: null,
    onresult: null,
    onerror: null,
    onend: null,
    onprocessing: null,

    start() {
      hooks = {
        onstart: controller.onstart,
        onresult: controller.onresult,
        onerror: controller.onerror,
        onend: controller.onend,
        onprocessing: controller.onprocessing,
      };

      rec.onstart = () => hooks?.onstart?.();
      rec.onresult = (event) => {
        let interimText = "";
        let finalText = "";
        const results = event.results;
        for (let i = event.resultIndex ?? 0; i < (results?.length ?? 0); i += 1) {
          const result = results?.[i];
          if (!result) continue;
          const transcript = result[0]?.transcript ?? "";
          if (result.isFinal) finalText += transcript;
          else interimText += transcript;
        }
        hooks?.onresult?.(finalText, interimText || finalText);
      };
      rec.onerror = (event) => {
        const code = event?.error ?? "";
        // Surface the RAW SpeechRecognitionErrorEvent.error code (network /
        // not-allowed / service-not-allowed / audio-capture / no-speech /
        // language-not-supported) so failures are diagnosable in the console.
        console.warn("[voice] recognition error event", {
          code,
          rawMessage: (event as { message?: string } | null)?.message ?? "",
          userAgent: navigator.userAgent,
          recognitionAvailable: isSpeechRecognitionSupported(),
        });
        hooks?.onerror?.(code, (event as { message?: string } | null)?.message ?? "");
      };
      rec.onend = () => hooks?.onend?.();

      try {
        rec.start();
      } catch {
        hooks?.onerror?.("start-failed");
      }
    },

    stop() {
      try {
        rec.stop();
      } catch {
        // already ended
      }
    },

    abort() {
      try {
        rec.abort();
      } catch {
        // already ended
      }
    },
  };

  return controller;
}

/** Whether the MediaRecorder + server-transcription path is available. */
export function isServerRecognitionSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof fetch === "function"
  );
}

/**
 * Pick the best MediaRecorder audio MIME for this runtime. Chromium/Electron
 * supports webm/opus; prefer the most universally decodable candidate and
 * fall back to the browser default (empty string) rather than hardcoding a
 * format the runtime can't produce.
 */
export function pickAudioMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
    "audio/mp4;codecs=mp4a.40.2",
    "",
  ];
  for (const candidate of candidates) {
    if (!candidate) return "";
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    } catch {
      // ignore and try the next candidate
    }
  }
  return "";
}

export interface ServerRecognizerOptions {
  /** Returns the Supabase access token for the authenticated request. */
  getAccessToken: () => Promise<string | null>;
  /** Transcription endpoint (same-origin). */
  endpoint?: string;
}

// Request acoustic echo cancellation explicitly so Zeus's own TTS output
// (played through the system speakers/headphones) is suppressed by the
// recording instead of leaking into the transcript — a polluted transcript
// makes the NEXT turn's answer repeat the previous Q&A.
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

// After a voice turn stops Zeus's current speech (speechSynthesis.cancel),
// wait this long before recording begins so any audio tail from the speaker
// dies down. Without it, the tail of the just-spoken reply can be captured
// and transcribed as if the user had said it. Short enough to be
// imperceptible.
const RECORD_START_SETTLE_MS = 400;

/**
 * MediaRecorder → POST /api/voice/transcribe recognizer. Recording is
 * push-to-talk: tap to start, tap again (stop) to upload what was captured.
 * The transcript is delivered via onresult; failures are mapped to stable
 * codes the UI already understands (no-speech, auth-required, usage-limit,
 * audio-too-large, service-error, timed-out).
 */
export function createServerRecognizer(
  options: ServerRecognizerOptions,
): RecognizerController | null {
  if (!isServerRecognitionSupported()) return null;

  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let mimeType = "";
  let started = false;
  let cancelled = false;

  let hooks: Pick<
    RecognizerController,
    "onstart" | "onresult" | "onerror" | "onend" | "onprocessing"
  > | null = null;

  const stopTracks = () => {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  };

  const upload = async () => {
    const audioChunks = chunks;
    chunks = [];
    const type = mimeType;
    mimeType = "";
    stopTracks();

    if (cancelled || audioChunks.length === 0) {
      hooks?.onerror?.("no-speech");
      return;
    }
    const blob = new Blob(audioChunks, { type: type || undefined });
    // Diagnostic breadcrumbs (no secrets) for desktop.log / devtools.
    console.info(
      `[voice] recording stopped | audio size = ${blob.size} bytes | mime = ${type || "default"}`,
    );

    // Recording finished — uploading/transcribing begins.
    hooks?.onprocessing?.();

    const token = await options.getAccessToken();
    console.info(`[voice] auth token available = ${token ? "true" : "false"}`);
    if (!token) {
      hooks?.onerror?.("auth-required");
      return;
    }

    const endpoint = options.endpoint ?? "/api/voice/transcribe";
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 30_000);
    try {
      console.info(`[voice] transcribe request started (${endpoint})`);
      const form = new FormData();
      form.append("audio", blob, "voice-recording");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
        signal: abort.signal,
      });
      console.info(`[voice] transcribe response = ${response.status}`);

      if (response.status === 401 || response.status === 403) {
        hooks?.onerror?.("auth-required");
        return;
      }
      if (response.status === 413) {
        hooks?.onerror?.("audio-too-large");
        return;
      }
      if (response.status === 429) {
        hooks?.onerror?.("usage-limit");
        return;
      }
      if (!response.ok) {
        hooks?.onerror?.("service-error");
        return;
      }

      const payload = (await response.json()) as { text?: string };
      const text = (payload?.text ?? "").trim();
      if (!text) {
        hooks?.onerror?.("no-speech");
        return;
      }
      console.info(
        `[voice] transcript received = ${JSON.stringify(text.slice(0, 120))}${text.length > 120 ? "…" : ""}`,
      );
      hooks?.onresult?.(text, text);
      hooks?.onend?.();
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      hooks?.onerror?.(aborted ? "timed-out" : "service-error");
    } finally {
      clearTimeout(timer);
    }
  };

  const controller: RecognizerController = {
    kind: "server",
    onstart: null,
    onresult: null,
    onerror: null,
    onend: null,
    onprocessing: null,

    start() {
      if (started) return;
      started = true;
      cancelled = false;
      chunks = [];
      hooks = {
        onstart: controller.onstart,
        onresult: controller.onresult,
        onerror: controller.onerror,
        onend: controller.onend,
        onprocessing: controller.onprocessing,
      };

      navigator.mediaDevices
        .getUserMedia({ audio: AUDIO_CONSTRAINTS })
        .then((mediaStream) => {
          if (cancelled) {
            mediaStream.getTracks().forEach((track) => track.stop());
            return;
          }
          stream = mediaStream;
          mimeType = pickAudioMimeType();

          let rec: MediaRecorder;
          try {
            rec = mimeType
              ? new MediaRecorder(mediaStream, { mimeType })
              : new MediaRecorder(mediaStream);
          } catch {
            try {
              rec = new MediaRecorder(mediaStream);
              mimeType = "";
            } catch {
              stopTracks();
              hooks?.onerror?.("audio-capture");
              return;
            }
          }
          recorder = rec;

          rec.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) chunks.push(event.data);
          };
          rec.onerror = () => {
            hooks?.onerror?.("audio-capture");
          };
          rec.onstop = () => {
            void upload();
          };

          // Settle delay before recording starts (see RECORD_START_SETTLE_MS)
          // so the tail of any just-stopped TTS reply can't enter the audio.
          setTimeout(() => {
            if (cancelled) {
              stopTracks();
              return;
            }
            try {
              rec.start(250);
            } catch {
              stopTracks();
              hooks?.onerror?.("audio-capture");
              return;
            }
            console.info("[voice] recording started");
            hooks?.onstart?.();
          }, RECORD_START_SETTLE_MS);
        })
        .catch((error: unknown) => {
          const name = (error as DOMException | null)?.name ?? "";
          if (name === "NotAllowedError" || name === "SecurityError") {
            hooks?.onerror?.("not-allowed");
          } else {
            // NotFoundError / OverconstrainedError / anything else.
            hooks?.onerror?.("audio-capture");
          }
        });
    },

    stop() {
      const rec = recorder;
      recorder = null;
      if (rec && rec.state !== "inactive") {
        try {
          rec.stop();
        } catch {
          // already stopped
        }
      }
    },

    abort() {
      cancelled = true;
      const rec = recorder;
      recorder = null;
      if (rec && rec.state !== "inactive") {
        try {
          // TS 5.9's lib.dom omits MediaRecorder.abort() even though every
          // Chromium/Firefox supports it — cast to the real surface.
          (rec as MediaRecorder & { abort(): void }).abort();
        } catch {
          // already stopped
        }
      }
      chunks = [];
      stopTracks();
    },
  };

  return controller;
}

/* ── speech synthesis ─────────────────────────────────────────── */

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined";
}

export function getVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSynthesisSupported()) return [];
  return window.speechSynthesis.getVoices();
}

/** Pick the voice to use: exact URI match, else a natural English voice, else the first available. */
export function pickVoice(voiceURI: string | null): SpeechSynthesisVoice | null {
  const voices = getVoices();
  if (voices.length === 0) return null;
  if (voiceURI) {
    const match = voices.find((v) => v.voiceURI === voiceURI);
    if (match) return match;
  }
  const english = voices.filter((v) => (v.lang ?? "").toLowerCase().startsWith("en"));
  const google = english.find((v) => /google us english/i.test(v.name));
  return google ?? english[0] ?? voices[0] ?? null;
}

/** Strip markdown/code noise so Zeus doesn't read syntax aloud. */
export function sanitizeForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " (code block omitted) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split long responses into bounded chunks (sentence-aware). Long single
 * utterances can stall or get cut off in Chromium/Electron TTS, so we queue
 * sentence chunks instead.
 */
export function chunkForSpeech(text: string, maxLen = 220): string[] {
  const clean = sanitizeForSpeech(text);
  if (!clean) return [];
  const sentences = clean.match(/[^.!?\n]+[.!?]*\s*/g) ?? [clean];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && (current + sentence).length > maxLen) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/* ── TTS manager ──────────────────────────────────────────────── */

/**
 * Owns the speechSynthesis queue. One instance per voice session so a new
 * utterance always cancels any previous one (no overlapping voices), and
 * long responses are spoken chunk-by-chunk. Stale utterance events from an
 * old generation are ignored via a monotonically increasing generation id.
 */
export class SpeechManager {
  private voiceURI: string | null = null;
  private rate = 1;
  private speaking = false;
  private cancelled = false;
  private generation = 0;
  private chunkIndex = 0;
  private utterances: SpeechSynthesisUtterance[] = [];

  onSpeakingChange: ((speaking: boolean) => void) | null = null;
  onError: ((message: string) => void) | null = null;

  get isSpeaking(): boolean {
    return this.speaking;
  }

  configure(opts: { voiceURI: string | null; rate: number }): void {
    this.voiceURI = opts.voiceURI;
    this.rate = opts.rate;
  }

  speak(text: string): void {
    if (!isSpeechSynthesisSupported()) {
      this.onError?.("Text-to-speech isn't supported in this browser.");
      return;
    }
    const chunks = chunkForSpeech(text);
    if (chunks.length === 0) {
      this.onError?.("I couldn't find anything to say.");
      return;
    }
    // Stop anything currently playing before starting the new response.
    this.stop();
    this.generation += 1;
    const gen = this.generation;
    this.cancelled = false;
    this.chunkIndex = 0;
    this.utterances = chunks.map((chunk) => this.buildUtterance(chunk, gen));
    this.playNext();
  }

  private buildUtterance(text: string, gen: number): SpeechSynthesisUtterance {
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(this.voiceURI);
    if (voice) utterance.voice = voice;
    utterance.rate = this.rate;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onend = () => {
      if (this.cancelled || gen !== this.generation) return;
      this.chunkIndex += 1;
      if (this.chunkIndex < this.utterances.length) this.playNext();
      else this.finish();
    };

    utterance.onerror = (event) => {
      if (this.cancelled || gen !== this.generation) return;
      // cancel()/interrupts fire these — not real failures.
      if (event.error === "canceled" || event.error === "interrupted") return;
      this.cancelled = true;
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
      this.finish();
      this.onError?.("Zeus couldn't speak that response. Try a different voice in Settings.");
    };

    return utterance;
  }

  private playNext(): void {
    if (this.cancelled || !isSpeechSynthesisSupported()) return;
    const utterance = this.utterances[this.chunkIndex];
    if (!utterance) return;
    if (!this.speaking) {
      this.speaking = true;
      this.onSpeakingChange?.(true);
    }
    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      this.cancelled = true;
      this.finish();
    }
  }

  private finish(): void {
    if (!this.speaking) {
      this.utterances = [];
      return;
    }
    this.speaking = false;
    this.utterances = [];
    this.onSpeakingChange?.(false);
  }

  pause(): void {
    if (!this.speaking || !isSpeechSynthesisSupported()) return;
    try {
      window.speechSynthesis.pause();
    } catch {
      // ignore
    }
  }

  resume(): void {
    if (!isSpeechSynthesisSupported()) return;
    try {
      window.speechSynthesis.resume();
    } catch {
      // ignore
    }
  }

  stop(): void {
    this.cancelled = true;
    this.generation += 1;
    const wasSpeaking = this.speaking;
    this.speaking = false;
    this.utterances = [];
    if (isSpeechSynthesisSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    if (wasSpeaking) this.onSpeakingChange?.(false);
  }
}
