import { useCallback, useEffect, useRef, useState } from "react";
import {
  createNativeRecognizer,
  createServerRecognizer,
  isServerRecognitionSupported,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  loadVoiceSettings,
  saveVoiceSettings,
  SpeechManager,
  voiceErrorMessage,
  type RecognitionBackend,
  type RecognizerController,
  type VoiceSettings,
  type VoiceState,
} from "@/lib/voice";
import { supabase } from "@/integrations/supabase/client";
import { isDesktopShell } from "@/lib/desktop-auth";

export interface UseVoiceOptions {
  /**
   * Called with the final transcript of a voice turn. The caller is
   * responsible for sending it through the normal chat pipeline; until it
   * calls `completeTurn(text | null)` the hook stays in "processing".
   */
  onTranscript: (text: string) => void;
}

export interface UseVoiceResult {
  state: VoiceState;
  /** Live (interim) transcript while listening (native backend only). */
  interim: string;
  /** Non-blocking error/notice message, or null. */
  error: string | null;
  settings: VoiceSettings;
  updateSettings: (patch: Partial<VoiceSettings>) => void;
  /** Start a voice turn (stops any current speech). Toggle: stops while listening. */
  start: () => void;
  /** Stop listening without submitting anything. */
  stopListening: () => void;
  /** Speak text aloud. Fires the speaking → idle state transitions. */
  speak: (text: string) => void;
  /** Stop any speech immediately. */
  stopSpeaking: () => void;
  pauseSpeaking: () => void;
  resumeSpeaking: () => void;
  /** Whether speech is currently paused (for the speaking pill UI). */
  speakingPaused: boolean;
  /**
   * End a voice turn. Call with the assistant's reply text to speak it
   * (voice turns always speak; typed turns speak only when autoSpeak is on),
   * or with null to go back to idle without speaking.
   */
  completeTurn: (speakText: string | null) => void;
  /** Abort everything (recognition + speech) and return to idle. */
  reset: () => void;
  recognitionSupported: boolean;
  synthesisSupported: boolean;
  /** Which recognition engine is active ("native" web or "server" STT). */
  backend: RecognitionBackend;
  /**
   * True while the server backend is uploading/transcribing the recording
   * (before the transcript is submitted). Lets the UI show "Transcribing…"
   * distinct from "Thinking…" (chat streaming). Always false for native.
   */
  transcribing: boolean;
  /** False until the client has mounted (avoids SSR hydration mismatches). */
  hydrated: boolean;
}

/**
 * Choose the recognition engine for this runtime:
 *   - Electron desktop shell → server transcription (native Web Speech is
 *     baked into Chrome only and fails with `network` inside Electron).
 *   - Web with native support → native Web Speech (free, live interim text).
 *   - Web without native support → server transcription fallback.
 */
function pickBackend(): RecognitionBackend {
  if (isDesktopShell()) return "server";
  return isSpeechRecognitionSupported() ? "native" : "server";
}

/**
 * Zeus Live Voice — React state machine over src/lib/voice.ts.
 *
 * Flow: idle → start() → listening → (final transcript) → processing →
 * completeTurn(reply) → speaking (if the turn was voice-initiated or
 * autoSpeak is on) → idle. Errors return to idle with a non-blocking message.
 *
 * Two recognition backends share one state machine and one UI:
 *   - "native"  → Web Speech API (Chrome web). Live interim transcript,
 *     speech-end detection.
 *   - "server"  → MediaRecorder + POST /api/voice/transcribe (Electron
 *     desktop, and web fallback). Push-to-talk: tap to record, tap to send.
 */
export function useVoice({ onTranscript }: UseVoiceOptions): UseVoiceResult {
  const [state, setState] = useState<VoiceState>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [speakingPaused, setSpeakingPaused] = useState(false);
  const [backend, setBackend] = useState<RecognitionBackend>(() => pickBackend());
  const [transcribing, setTranscribing] = useState(false);
  // Hydration guard: initial state must match SSR's first render. Settings
  // are loaded from localStorage in an effect (same pattern as useTheme).
  const [hydrated, setHydrated] = useState(false);
  const [settings, setSettings] = useState<VoiceSettings>(() => loadVoiceSettings());

  const stateRef = useRef<VoiceState>("idle");
  const setStateBoth = useCallback((s: VoiceState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const backendRef = useRef<RecognitionBackend>(backend);
  backendRef.current = backend;

  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  // True while a turn that started from the microphone is in flight, so
  // completeTurn knows to speak the reply even if autoSpeak is off.
  const voiceTurnRef = useRef(false);

  const recRef = useRef<RecognizerController | null>(null);
  const speechRef = useRef<SpeechManager | null>(null);
  const listeningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    setHydrated(true);
    setSettings(loadVoiceSettings());
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Non-blocking errors: show the notice briefly, then fade back to idle.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  const switchBackend = useCallback((next: RecognitionBackend) => {
    backendRef.current = next;
    setBackend(next);
  }, []);

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const getSpeech = useCallback((): SpeechManager => {
    if (!speechRef.current) {
      const manager = new SpeechManager();
      manager.onSpeakingChange = (speaking) => {
        if (!mountedRef.current) return;
        setSpeakingPaused(false);
        setStateBoth(speaking ? "speaking" : "idle");
      };
      manager.onError = (message) => {
        if (!mountedRef.current) return;
        setError(message);
      };
      speechRef.current = manager;
    }
    return speechRef.current;
  }, [setStateBoth]);

  const clearListeningTimer = useCallback(() => {
    if (listeningTimerRef.current) {
      clearTimeout(listeningTimerRef.current);
      listeningTimerRef.current = null;
    }
  }, []);

  const stopListening = useCallback(() => {
    clearListeningTimer();
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      // stop() first: the backend's in-flight events still resolve because
      // handlers are captured at start() time.
      try {
        rec.stop();
      } catch {
        // already ended
      }
      rec.onstart = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.onprocessing = null;
    }
  }, [clearListeningTimer]);

  const abortListening = useCallback(() => {
    clearListeningTimer();
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      rec.onstart = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.onprocessing = null;
      try {
        rec.abort();
      } catch {
        // already ended
      }
    }
  }, [clearListeningTimer]);

  // Build a recognizer for the current backend, falling back to the other
  // one when the preferred engine is unavailable in this runtime.
  const buildController = useCallback((): RecognizerController | null => {
    if (backendRef.current === "server") {
      const controller = createServerRecognizer({ getAccessToken });
      if (controller) return controller;
      switchBackend("native");
    }
    return createNativeRecognizer();
  }, [getAccessToken, switchBackend]);

  const start = useCallback(() => {
    setError(null);
    const current = stateRef.current;
    // Toggle: tapping the mic again while listening ends the turn.
    if (current === "listening") {
      stopListening();
      // Native: recognition ends without a final result → back to idle.
      // Server: recording stops and the audio upload begins — the backend's
      // onprocessing/onresult events drive processing → submit.
      if (backendRef.current === "native") setStateBoth("idle");
      return;
    }
    // Ignore starts while a turn is already being processed.
    if (current === "processing") return;

    // Respect the master switch (defense in depth behind the UI).
    if (!settingsRef.current.enabled) {
      setError("Voice is turned off in Settings — turn it on to use the microphone.");
      return;
    }

    // A new voice turn stops whatever Zeus is currently saying.
    getSpeech().stop();

    const controller = buildController();
    if (!controller) {
      setError(
        "Voice input isn't supported in this browser. Try the Zeus AI desktop app, or allow the microphone in your browser settings.",
      );
      setStateBoth("idle");
      return;
    }

    // Diagnostic breadcrumbs (no secrets) for desktop.log / devtools.
    console.info(
      `[voice] platform = ${isDesktopShell() ? "desktop" : "web"} | selected backend = ${backendRef.current} | recognizer = ${controller.kind}`,
    );

    let turnDone = false;

    const finishTurn = (text: string | null) => {
      if (turnDone) return;
      turnDone = true;
      clearListeningTimer();
      if (recRef.current) {
        try {
          recRef.current.onstart = null;
          recRef.current.onresult = null;
          recRef.current.onerror = null;
          recRef.current.onend = null;
          recRef.current.onprocessing = null;
        } catch {
          // ignore
        }
      }
      recRef.current = null;
      setInterim("");
      setTranscribing(false);
      if (text && text.trim()) {
        voiceTurnRef.current = true;
        setStateBoth("processing");
        onTranscriptRef.current(text.trim());
      } else {
        setStateBoth("idle");
      }
    };

    controller.onstart = () => {
      // The hook already moved to "listening" before start(); nothing to do.
    };

    controller.onprocessing = () => {
      if (turnDone) return;
      // Server backend: recording finished, audio is uploading/transcribing.
      setTranscribing(true);
      setStateBoth("processing");
    };

    controller.onresult = (finalText, interimText) => {
      if (turnDone) return;
      if (finalText.trim()) {
        turnDone = true;
        clearListeningTimer();
        recRef.current = null;
        setInterim("");
        setTranscribing(false);
        voiceTurnRef.current = true;
        setStateBoth("processing");
        console.info(
          `[voice] transcript received = ${JSON.stringify(finalText.trim().slice(0, 120))}${finalText.trim().length > 120 ? "…" : ""}`,
        );
        onTranscriptRef.current(finalText.trim());
      } else {
        setInterim(interimText);
      }
    };

    controller.onerror = (code, rawMessage) => {
      if (turnDone) return;
      console.warn("[voice] recognition error event", {
        code,
        rawMessage: rawMessage ?? "",
        backend: backendRef.current,
        userAgent: navigator.userAgent,
      });
      if (code === "aborted") {
        // A competing abort (e.g. the tab lost focus) — quietly return.
        turnDone = true;
        clearListeningTimer();
        recRef.current = null;
        setInterim("");
        setStateBoth("idle");
        return;
      }
      if (code === "no-speech") {
        // Nothing heard — soft notice, back to idle.
        turnDone = true;
        clearListeningTimer();
        recRef.current = null;
        setInterim("");
        setError(voiceErrorMessage(code));
        setStateBoth("idle");
        return;
      }
      // Web fallback: the native engine failed with a known
      // unavailable/network condition (Electron-class runtimes, Edge post
      // v134) → switch this session to the server transcription backend.
      if (
        backendRef.current === "native" &&
        !isDesktopShell() &&
        (code === "network" || code === "service-not-allowed")
      ) {
        switchBackend("server");
        turnDone = true;
        clearListeningTimer();
        recRef.current = null;
        setInterim("");
        setError(
          "Voice recognition isn't available in this browser — switched to Zeus's server transcription. Tap the mic and try again.",
        );
        setStateBoth("idle");
        return;
      }
      turnDone = true;
      clearListeningTimer();
      recRef.current = null;
      setInterim("");
      setError(voiceErrorMessage(code) || "Voice input failed. Please try again.");
      setStateBoth("idle");
    };

    controller.onend = () => {
      // Recognition ended by itself (silence) without a final transcript.
      if (!turnDone) finishTurn(null);
    };

    recRef.current = controller;
    setInterim("");
    setStateBoth("listening");
    controller.start();

    // Safety net — never stay in "listening" forever. Native: end quietly.
    // Server: finalize (upload what was recorded) so a long pause still
    // turns into a message instead of being discarded.
    listeningTimerRef.current = setTimeout(() => {
      if (stateRef.current !== "listening") return;
      if (backendRef.current === "server") {
        stopListening();
      } else {
        setError("I didn't catch that — tap the mic and try again.");
        finishTurn(null);
      }
    }, 30_000);
  }, [buildController, clearListeningTimer, getSpeech, setStateBoth, stopListening, switchBackend]);

  const speak = useCallback(
    (text: string) => {
      if (!text?.trim()) return;
      if (!isSpeechSynthesisSupported()) {
        setError("Text-to-speech isn't supported in this browser.");
        return;
      }
      setError(null);
      const manager = getSpeech();
      manager.configure({
        voiceURI: settingsRef.current.voiceURI,
        rate: settingsRef.current.rate,
      });
      manager.speak(text);
    },
    [getSpeech],
  );

  const stopSpeaking = useCallback(() => {
    getSpeech().stop();
  }, [getSpeech]);

  const pauseSpeaking = useCallback(() => {
    getSpeech().pause();
    setSpeakingPaused(true);
  }, [getSpeech]);

  const resumeSpeaking = useCallback(() => {
    getSpeech().resume();
    setSpeakingPaused(false);
  }, [getSpeech]);

  const completeTurn = useCallback(
    (speakText: string | null) => {
      const wasVoiceTurn = voiceTurnRef.current;
      voiceTurnRef.current = false;
      setTranscribing(false);
      const text = speakText?.trim();
      if (text && (wasVoiceTurn || settingsRef.current.autoSpeak)) {
        speak(text);
      } else {
        setSpeakingPaused(false);
        setStateBoth("idle");
      }
    },
    [setStateBoth, speak],
  );

  const reset = useCallback(() => {
    voiceTurnRef.current = false;
    clearListeningTimer();
    abortListening();
    getSpeech().stop();
    setSpeakingPaused(false);
    setTranscribing(false);
    setInterim("");
    setError(null);
    setStateBoth("idle");
  }, [abortListening, clearListeningTimer, getSpeech, setStateBoth]);

  const updateSettings = useCallback((patch: Partial<VoiceSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveVoiceSettings(next);
      return next;
    });
    // Apply voice/rate changes live to any in-flight speech.
    if (speechRef.current && (patch.voiceURI !== undefined || patch.rate !== undefined)) {
      speechRef.current.configure({
        voiceURI: patch.voiceURI ?? settingsRef.current.voiceURI,
        rate: patch.rate ?? settingsRef.current.rate,
      });
    }
  }, []);

  // Clean up recognition + speech when the chat view unmounts.
  useEffect(() => {
    return () => {
      clearListeningTimer();
      abortListening();
      speechRef.current?.stop();
    };
  }, [abortListening, clearListeningTimer]);

  return {
    state,
    interim,
    error,
    settings,
    updateSettings,
    start,
    stopListening,
    speak,
    stopSpeaking,
    pauseSpeaking,
    resumeSpeaking,
    speakingPaused,
    completeTurn,
    reset,
    recognitionSupported:
      hydrated &&
      (isDesktopShell() || isSpeechRecognitionSupported() || isServerRecognitionSupported()),
    synthesisSupported: hydrated && isSpeechSynthesisSupported(),
    backend,
    transcribing,
    hydrated,
  };
}
