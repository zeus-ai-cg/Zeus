import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  STT_MAX_AUDIO_BYTES,
  SttProviderError,
  getSttChainOrder,
  transcribeAudioWithFallback,
} from "@/lib/voice-transcribe.server";

// ---------------------------------------------------------------------------
// POST /api/voice/transcribe — server-side speech-to-text for Zeus Live
// Voice. Used by the Electron desktop app (and as a web fallback) because
// Chromium's native SpeechRecognition is not present in Electron builds.
//
// Provider strategy lives in voice-transcribe.server.ts: Groq Whisper is the
// primary engine (Groq's key is reserved for mic input only), with an
// automatic fallback chain gemini -> mistral -> cerebras -> cloudflare when
// Groq hits quota or fails transiently.
//
// Security model:
//   - The user is resolved SERVER-SIDE from the Bearer token (same as
//     /api/chat); a userId from the renderer is never trusted.
//   - STT credentials live only in server env.
//   - Usage/plan gating is NOT duplicated here: transcripts flow into the
//     normal /api/chat pipeline, which owns quotas. Transcription is an
//     input method, not a second counter.
//   - A small per-user in-memory rate bucket guards abuse spikes.
// ---------------------------------------------------------------------------

const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/flac",
  "audio/x-flac",
  "audio/aac",
  "audio/x-m4a",
  "audio/aiff",
  "audio/x-aiff",
  "audio/3gpp",
]);

const MAX_TRANSCRIPTIONS_PER_MINUTE = 20;

const rateBuckets = new Map<string, number[]>();

function allowTranscription(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  const hits = (rateBuckets.get(userId) ?? []).filter((t) => t >= windowStart);
  if (hits.length >= MAX_TRANSCRIPTIONS_PER_MINUTE) {
    rateBuckets.set(userId, hits);
    return false;
  }
  hits.push(now);
  rateBuckets.set(userId, hits);
  if (rateBuckets.size > 10_000) {
    for (const [id, times] of rateBuckets) {
      const recent = times.filter((t) => t >= windowStart);
      if (recent.length === 0) rateBuckets.delete(id);
      else rateBuckets.set(id, recent);
    }
  }
  return true;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/voice/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // ===== Authentication (server-side, mirrors /api/chat) =====
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
          if (!token) return json({ error: "unauthorized" }, 401);

          const supabase = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            {
              global: { headers: { Authorization: `Bearer ${token}` } },
              auth: { persistSession: false, autoRefreshToken: false },
            },
          );
          const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
          if (claimsErr || !claimsData?.claims?.sub) {
            console.warn("[voice] auth.failed | reason = getClaims rejected token");
            return json({ error: "unauthorized" }, 401);
          }
          const userId = claimsData.claims.sub;
          console.info(`[voice] auth.ok | userId = ${userId}`);

          if (!allowTranscription(userId)) {
            return json(
              {
                error: "rate_limited",
                message: "Too many transcription requests. Try again shortly.",
              },
              429,
            );
          }

          // ===== Payload validation =====
          const contentLength = Number(request.headers.get("content-length") ?? 0);
          if (contentLength > STT_MAX_AUDIO_BYTES) {
            return json({ error: "audio_too_large" }, 413);
          }

          let form: FormData;
          try {
            form = await request.formData();
          } catch (error) {
            console.error(`[voice] multipart.failed | detail = ${error instanceof Error ? error.message : "unknown"}`);
            return json({ error: "invalid_multipart" }, 400);
          }

          const entry = form.get("audio");
          if (!entry || typeof entry === "string") {
            return json({ error: "missing_audio" }, 400);
          }
          const file = entry as File;
          const fullMime = (file.type || "audio/webm").toLowerCase();
          const baseMime = fullMime.split(";")[0].trim();
          if (file.size === 0) return json({ error: "empty_audio" }, 400);
          if (file.size > STT_MAX_AUDIO_BYTES) return json({ error: "audio_too_large" }, 413);
          if (!ALLOWED_AUDIO_TYPES.has(baseMime)) {
            return json(
              { error: "unsupported_audio_type", message: `Unsupported audio type: ${baseMime}` },
              400,
            );
          }

          // ===== Transcribe (fallback chain inside; credentials stay server-side) =====
          console.info("[voice] transcribe.request", {
            userId,
            bytes: file.size,
            mime: fullMime,
            chain: getSttChainOrder().join("->"),
          });
          if (getSttChainOrder().length === 0) {
            return json(
              { error: "not_configured", message: "Voice transcription is not configured." },
              503,
            );
          }

          const audioBytes = new Uint8Array(await file.arrayBuffer());
          let text = "";
          try {
            const result = await transcribeAudioWithFallback(fullMime, audioBytes);
            text = result.text;
          } catch (error) {
            const isProvider = error instanceof SttProviderError;
            const category = isProvider ? error.category : "unknown";
            console.error(
              `[voice] transcribe.failed | category = ${category} | userId = ${userId} | bytes = ${file.size}`,
            );
            return json({ error: "transcription_failed" }, 502);
          }

          console.info(`[voice] transcript | userId = ${userId} | length = ${text.length}`);
          return json({ text }, 200);
        } catch (error) {
          console.error("[voice] transcribe.request_failed", error);
          return json({ error: "server_error" }, 500);
        }
      },
    },
  },
});
