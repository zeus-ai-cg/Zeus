// Server-only speech-to-text for Zeus Live Voice (Project Olympus).
//
// Provider strategy (per product decision):
//   Groq Whisper is the PRIMARY engine for microphone transcription — it is
//   fast, cheap, and accepts webm/opus straight from MediaRecorder. All other
//   AI features (chat, engineer mode, reviews, ...) run on Ox Alpha; Groq's
//   key is reserved exclusively for voice input.
//
// Fallback chain when Groq hits its quota / fails transiently:
//     groq -> gemini -> mistral -> cerebras -> cloudflare
//   - gemini:      generateContent inline_data audio (gemini-2.5-flash)
//   - mistral:     OpenAI-compatible /audio/transcriptions (Voxtral)
//   - cerebras:    SKIPPED automatically — Cerebras exposes LLM inference
//                  only and has NO speech-to-text endpoint today; kept in
//                  the chain so the order matches product spec.
//   - cloudflare:  Workers AI @cf/openai/whisper
//
// Notes on formats: webm/opus (the browser/Electron recording format) is
// accepted by Groq; Gemini/Mistral/Cloudflare may reject that container — a
// rejection simply advances the chain, and since the chain only walks past
// Groq on quota/outage, real-world impact is minimal.
//
// This module must NEVER be imported from client code (node Buffer/env).

export const STT_MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export type SttProviderId = "groq" | "gemini" | "mistral" | "cerebras" | "cloudflare";

export class SttProviderError extends Error {
  readonly status: number;
  readonly category:
    | "rate_limit"
    | "provider_auth"
    | "provider_server"
    | "invalid_request"
    | "model_not_found"
    | "audio_too_large"
    | "unsupported_provider"
    | "timeout"
    | "network";
  readonly retryAfterMs: number | null;

  constructor(
    status: number,
    category: SttProviderError["category"],
    message: string,
    retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "SttProviderError";
    this.status = status;
    this.category = category;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Categories that justify walking to the next provider in the chain. */
function shouldFallback(category: SttProviderError["category"]): boolean {
  return (
    category === "rate_limit" ||
    category === "provider_server" ||
    category === "provider_auth" ||
    category === "model_not_found" ||
    category === "invalid_request" ||
    category === "unsupported_provider" ||
    category === "audio_too_large" ||
    category === "timeout" ||
    category === "network"
  );
}

function sanitizeDetail(detail: string): string {
  return detail
    .replace(/(api[_-]?key|token|secret|authorization)["'\s:=]+[A-Za-z0-9._-]+/gi, "$1=***")
    .slice(0, 240);
}

const MIME_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/aac": "aac",
  "audio/x-m4a": "m4a",
  "audio/aiff": "aiff",
  "audio/x-aiff": "aiff",
  "audio/3gpp": "3gp",
};

function extensionForMime(mimeType: string): string {
  const base = (mimeType || "").split(";")[0].trim().toLowerCase();
  return MIME_EXT[base] || "webm";
}

async function fetchJson(
  url: string,
  init: RequestInit,
  label: string,
  parse: (body: unknown) => string,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw classify(label, response.status, detail, response.headers);
    }
    return parse(await response.json());
  } catch (error) {
    if (error instanceof SttProviderError) throw error;
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new SttProviderError(0, aborted ? "timeout" : "network", `${label} ${aborted ? "timed out" : "network error"}`);
  } finally {
    clearTimeout(timeout);
  }
}

function classify(
  label: string,
  status: number,
  detail: string,
  headers?: Headers,
): SttProviderError {
  let category: SttProviderError["category"] = "provider_server";
  if (status === 400) category = "invalid_request";
  else if (status === 401 || status === 403) category = "provider_auth";
  else if (status === 404) category = "model_not_found";
  else if (status === 413) category = "audio_too_large";
  else if (status === 429) category = "rate_limit";
  else if (status >= 500) category = "provider_server";

  let retryAfterMs: number | null = null;
  if (status === 429 && headers) {
    const ra = Number(headers.get("retry-after"));
    if (Number.isFinite(ra) && ra > 0) retryAfterMs = Math.min(ra * 1000, 10_000);
  }
  console.error(`[voice] ${label}.error | category=${category} | status=${status} | ${sanitizeDetail(detail)}`);
  return new SttProviderError(status, category, `${label} failed (${status})`, retryAfterMs);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

type SttProvider = {
  id: SttProviderId;
  enabled: () => boolean;
  transcribe: (mimeType: string, audioBytes: Uint8Array) => Promise<string>;
};

// --- groq (primary) ----------------------------------------------------------
async function transcribeGroq(mimeType: string, audioBytes: Uint8Array): Promise<string> {
  const call = (mime: string) =>
    fetchJson(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY || ""}` },
        body: (() => {
          const form = new FormData();
          form.append("model", process.env.SPEECH_TO_TEXT_MODEL || "whisper-large-v3-turbo");
          form.append("response_format", "json");
          form.append(
            "file",
            new Blob([toArrayBuffer(audioBytes)], { type: mime || "audio/webm" }),
            `voice-recording.${extensionForMime(mime)}`,
          );
          return form;
        })(),
      },
      "groq-stt",
      (body) => ((body as { text?: string })?.text ?? "").trim(),
    );

  try {
    return await call(mimeType);
  } catch (error) {
    // Chromium sometimes sends `audio/webm;codecs=opus` which Groq rejects as
    // invalid_request even though it accepts plain webm — retry bare container.
    const baseMime = mimeType.split(";")[0].trim().toLowerCase();
    if (
      error instanceof SttProviderError &&
      error.category === "invalid_request" &&
      baseMime !== mimeType.toLowerCase()
    ) {
      console.warn("[voice] groq-stt.codec_retry | retrying with bare container MIME");
      return await call(baseMime);
    }
    throw error;
  }
}

// --- gemini ------------------------------------------------------------------
async function transcribeGemini(mimeType: string, audioBytes: Uint8Array): Promise<string> {
  const model = process.env.GEMINI_STT_MODEL || "gemini-2.5-flash";
  const key = process.env.GEMINI_API_KEY || "";
  return fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: "Transcribe this audio exactly. Output ONLY the transcript text." },
              {
                inline_data: {
                  mime_type: mimeType.split(";")[0].trim() || "audio/webm",
                  data: Buffer.from(toArrayBuffer(audioBytes)).toString("base64"),
                },
              },
            ],
          },
        ],
      }),
    },
    "gemini-stt",
    (body) => {
      const parts = (body as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      })?.candidates?.[0]?.content?.parts;
      return (parts?.map((p) => p?.text ?? "").join("") ?? "").trim();
    },
  );
}

// --- mistral (Voxtral) -------------------------------------------------------
async function transcribeMistral(mimeType: string, audioBytes: Uint8Array): Promise<string> {
  const model = process.env.MISTRAL_STT_MODEL || "voxtral-mini-2507";
  const form = new FormData();
  form.append("model", model);
  form.append(
    "file",
    new Blob([toArrayBuffer(audioBytes)], { type: mimeType || "audio/webm" }),
    `voice-recording.${extensionForMime(mimeType)}`,
  );
  return fetchJson(
    "https://api.mistral.ai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY || ""}` },
      body: form,
    },
    "mistral-stt",
    (body) => ((body as { text?: string })?.text ?? "").trim(),
  );
}

// --- cerebras ----------------------------------------------------------------
// Cerebras serves LLM inference only — it has no speech-to-text API. Kept in
// the chain position per product spec so the ordering is explicit and future-
// proof: if Cerebras ever ships an STT endpoint, flip this stub to real code.
async function transcribeCerebras(): Promise<string> {
  throw new SttProviderError(
    0,
    "unsupported_provider",
    "cerebras has no speech-to-text endpoint; skipping",
  );
}

// --- cloudflare workers ai ---------------------------------------------------
async function transcribeCloudflare(_mimeType: string, audioBytes: Uint8Array): Promise<string> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID || "";
  const model = process.env.CLOUDFLARE_STT_MODEL || "@cf/openai/whisper";
  return fetchJson(
    `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_API_KEY || ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ audio: Buffer.from(toArrayBuffer(audioBytes)).toString("base64") }),
    },
    "cloudflare-stt",
    (body) =>
      (
        (body as { result?: { transcript?: string; text?: string } })?.result?.transcript ??
        (body as { result?: { text?: string } })?.result?.text ??
        ""
      ).trim(),
  );
}

const CHAIN: SttProvider[] = [
  { id: "groq", enabled: () => !!process.env.GROQ_API_KEY, transcribe: transcribeGroq },
  { id: "gemini", enabled: () => !!process.env.GEMINI_API_KEY, transcribe: transcribeGemini },
  { id: "mistral", enabled: () => !!process.env.MISTRAL_API_KEY, transcribe: transcribeMistral },
  { id: "cerebras", enabled: () => !!process.env.CEREBRAS_API_KEY, transcribe: transcribeCerebras },
  {
    id: "cloudflare",
    enabled: () => !!(process.env.CLOUDFLARE_API_KEY && process.env.CLOUDFLARE_ACCOUNT_ID),
    transcribe: transcribeCloudflare,
  },
];

export function getSttChainOrder(): SttProviderId[] {
  return CHAIN.filter((p) => p.enabled()).map((p) => p.id);
}

/**
 * Transcribe audio walking the fallback chain. Resolves with the first
 * successful transcript; throws the LAST SttProviderError when every
 * available provider fails.
 */
export async function transcribeAudioWithFallback(
  mimeType: string,
  audioBytes: Uint8Array,
): Promise<{ text: string; provider: SttProviderId }> {
  let lastError: SttProviderError = new SttProviderError(
    0,
    "provider_server",
    "no STT provider configured",
  );
  for (const provider of CHAIN) {
    if (!provider.enabled()) continue;
    console.info(`[voice] stt.try | provider=${provider.id} | mime=${mimeType} | bytes=${audioBytes.byteLength}`);
    try {
      const text = (await provider.transcribe(mimeType, audioBytes)).trim();
      console.info(`[voice] stt.ok | provider=${provider.id} | length=${text.length}`);
      return { text, provider: provider.id };
    } catch (error) {
      lastError =
        error instanceof SttProviderError
          ? error
          : new SttProviderError(0, "network", String(error instanceof Error ? error.message : error));
      if (!shouldFallback(lastError.category)) break;
      console.warn(`[voice] stt.fallback | from=${provider.id} | reason=${lastError.category}`);
    }
  }
  throw lastError;
}
