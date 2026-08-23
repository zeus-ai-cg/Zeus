/**
 * Stream parser for the AI SDK v7 UIMessageStream wire format.
 *
 * The backend returns a streaming response using `createUIMessageStreamResponse`
 * from the `ai` package (v7). The wire format is standard SSE:
 *
 *   data: {"type":"text-delta","id":"...","delta":"Hello"}\n\n
 *   data: {"type":"text","id":"...","text":"Hello"}\n\n
 *   data: {"type":"finish","finishReason":"stop"}\n\n
 *   data: {"type":"error","errorText":"..."}\n\n
 *   data: [DONE]\n\n
 *
 * The parser also handles legacy prefix-based formats (`0:`, `g:`, `d:`, `2:`,
 * `8:`) for backward compatibility with older backends.
 *
 * Security: Only yields text deltas and completion signals. Never logs or
 * exposes tokens, authorization headers, or user message content.
 */

export interface StreamChunk {
  type: "text-delta" | "done" | "error";
  textDelta?: string;
  error?: string;
  finishReason?: string;
}

/**
 * Parse a streaming response body into text deltas.
 * Handles AI SDK v7 JSON format AND legacy prefix formats.
 */
export async function* parseStreamResponse(
  response: Response,
): AsyncGenerator<StreamChunk, void, unknown> {
  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Request failed (${response.status})`;
    try {
      const parsed = JSON.parse(errorText);
      errorMessage = parsed.message ?? parsed.error ?? errorMessage;
    } catch {
      // Not JSON, use as-is
    }
    yield { type: "error", error: errorMessage };
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    yield { type: "error", error: "No response body" };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let doneYielded = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue; // skip empty/comments

        // SSE format: "data: <payload>"
        if (!trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6);
        if (!payload || payload === "[DONE]") {
          if (!doneYielded) {
            doneYielded = true;
            yield { type: "done", finishReason: "stop" };
          }
          return;
        }

        // ── AI SDK v7 JSON format ──────────────────────────────────
        // data: {"type":"text-delta","id":"...","delta":"Hello"}
        // data: {"type":"finish","finishReason":"stop"}
        // data: {"type":"error","errorText":"..."}
        if (payload.startsWith("{")) {
          try {
            const obj = JSON.parse(payload);
            if (obj.type === "text-delta" && typeof obj.delta === "string") {
              yield { type: "text-delta", textDelta: obj.delta };
            } else if (obj.type === "text" && typeof obj.text === "string") {
              // Full text (not a delta) — send as delta for compatibility
              yield { type: "text-delta", textDelta: obj.text };
            } else if (obj.type === "finish") {
              doneYielded = true;
              yield {
                type: "done",
                finishReason: obj.finishReason ?? "stop",
              };
              return;
            } else if (obj.type === "error") {
              doneYielded = true;
              yield {
                type: "error",
                error: obj.errorText ?? obj.error ?? "Stream error",
              };
              return;
            }
            // All other types (tool-input-start, reasoning-delta, etc.) are ignored
          } catch {
            // Malformed JSON — skip silently
          }
          continue;
        }

        // ── Legacy prefix-based formats (backward compat) ──────────
        if (payload.startsWith("0:")) {
          // Legacy text delta
          try {
            const text = JSON.parse(payload.slice(2));
            if (typeof text === "string") {
              yield { type: "text-delta", textDelta: text };
            }
          } catch { /* skip malformed */ }
        } else if (payload.startsWith("g:")) {
          // Full text delta
          try {
            const text = JSON.parse(payload.slice(2));
            if (typeof text === "string") {
              yield { type: "text-delta", textDelta: text };
            }
          } catch { /* skip malformed */ }
        } else if (payload.startsWith("d:")) {
          // Done/finish
          if (!doneYielded) {
            doneYielded = true;
            try {
              const meta = JSON.parse(payload.slice(2));
              yield { type: "done", finishReason: meta.finishReason ?? "stop" };
            } catch {
              yield { type: "done", finishReason: "stop" };
            }
          }
          return;
        } else if (payload.startsWith("2:")) {
          // Error
          doneYielded = true;
          try {
            const err = JSON.parse(payload.slice(2));
            yield {
              type: "error",
              error: typeof err === "string" ? err : err.message ?? "Stream error",
            };
          } catch {
            yield { type: "error", error: "Unknown stream error" };
          }
          return;
        } else if (payload.startsWith("8:")) {
          // Control message — could be finish
          try {
            const meta = JSON.parse(payload.slice(2));
            if (meta.type === "finish" || meta.finishReason) {
              if (!doneYielded) {
                doneYielded = true;
                yield { type: "done", finishReason: meta.finishReason ?? "stop" };
              }
              return;
            }
          } catch { /* skip */ }
        }
        // Other prefixes (1:, 3:, 4:, 5:, etc.) — tool calls/metadata, ignore
      }
    }

    // Stream ended without explicit done event — yield done
    if (!doneYielded) {
      doneYielded = true;
      yield { type: "done", finishReason: "stop" };
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith("data: ")) {
        const payload = trimmed.slice(6);
        if (payload === "[DONE]") {
          // Already yielded done above
        } else if (payload.startsWith("{")) {
          try {
            const obj = JSON.parse(payload);
            if (obj.type === "text-delta" && typeof obj.delta === "string") {
              yield { type: "text-delta", textDelta: obj.delta };
            } else if (obj.type === "text" && typeof obj.text === "string") {
              yield { type: "text-delta", textDelta: obj.text };
            } else if (obj.type === "finish") {
              if (!doneYielded) {
                doneYielded = true;
                yield { type: "done", finishReason: obj.finishReason ?? "stop" };
              }
            } else if (obj.type === "error") {
              if (!doneYielded) {
                doneYielded = true;
                yield { type: "error", error: obj.errorText ?? "Stream error" };
              }
            }
          } catch { /* skip */ }
        } else if (payload.startsWith("0:")) {
          try {
            const text = JSON.parse(payload.slice(2));
            if (typeof text === "string") {
              yield { type: "text-delta", textDelta: text };
            }
          } catch { /* skip */ }
        } else if (payload.startsWith("d:")) {
          if (!doneYielded) {
            doneYielded = true;
            yield { type: "done", finishReason: "stop" };
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
