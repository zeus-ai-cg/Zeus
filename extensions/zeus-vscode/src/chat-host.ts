/**
 * Extension host-side chat handler for Zeus AI VS Code extension.
 *
 * Security model:
 * - All API calls are made from the extension host with Bearer token
 * - The webview never receives, stores, or logs access tokens
 * - Typed postMessage is the only communication channel
 *
 * Timeout behavior:
 * - 20s: first-chunk timeout — if no data arrives within 20s of sending the
 *   request, a "Still working…" hint is shown (Stop remains available).
 * - 120s: hard timeout — if the stream hasn't completed in 120s, it is
 *   aborted and a Retry-able error is shown. This prevents the UI from ever
 *   getting permanently stuck.
 */

import * as vscode from "vscode";
import { getAccessToken, clearSession } from "./auth/session";
import { getConfig } from "./config";
import { parseStreamResponse } from "./stream-parser";
import type { ChatMessage } from "./chat.types";

// ── State ────────────────────────────────────────────────────────────

let activeAbortController: AbortController | null = null;
let activeThreadId: string | null = null;

/** How long to wait for the first chunk before showing "Still working…" */
const FIRST_CHUNK_TIMEOUT_MS = 20_000;
/** Hard cap — abort the stream if it hasn't finished in this time */
const HARD_TIMEOUT_MS = 120_000;

// ── Public API ───────────────────────────────────────────────────────

/**
 * Send a chat message and stream the response back to the webview.
 * Returns true if the request was initiated, false if auth failed.
 * `contextText` (optional) is appended to the user's visible text as a
 * pre-approved attachment block.
 */
export async function sendChatMessage(
  webview: vscode.Webview,
  threadId: string,
  text: string,
  history: ChatMessage[],
  contextText?: string,
): Promise<boolean> {
  // Prevent duplicate sends
  if (activeAbortController) {
    return false;
  }

  const token = await getAccessToken();
  if (!token) {
    webview.postMessage({
      type: "chatError",
      threadId,
      message: "Not authenticated. Please sign in.",
    });
    return false;
  }

  const { apiBaseUrl } = getConfig();

  // Guard: refuse to send to an unconfigured placeholder URL
  if (!apiBaseUrl) {
    webview.postMessage({
      type: "chatError",
      threadId,
      message:
        "API base URL not configured. Set zeus.apiBaseUrl in VS Code settings.",
    });
    return false;
  }

  const controller = new AbortController();
  activeAbortController = controller;
  activeThreadId = threadId;

  // Accumulated text accessible in both try and catch
  let fullText = "";
  let firstChunkReceived = false;
  let doneSent = false;
  let hardTimeout: ReturnType<typeof setTimeout> | null = null;
  let stillWorkingHint: ReturnType<typeof setTimeout> | null = null;

  // Notify webview that streaming started
  webview.postMessage({ type: "chatStart", threadId });

  // Safety: hard timeout to prevent the UI from ever getting permanently stuck
  hardTimeout = setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  }, HARD_TIMEOUT_MS);

  try {
    const url = `${apiBaseUrl}/api/chat`;
    const messages = [
      ...history.map((m) => ({
        id: m.id,
        role: m.role,
        parts: m.parts ?? [{ type: "text", text: m.text }],
      })),
      {
        id: `user-${Date.now()}`,
        role: "user",
        parts: [{ type: "text", text: contextText ? `${text}\n\n${contextText}` : text }],
      },
    ];

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages,
        threadId,
        mode: "chat",
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // 401: token expired beyond refresh — clear stale auth, prompt re-sign-in
      if (response.status === 401) {
        await clearSession();
        webview.postMessage({
          type: "authState",
          authenticated: false,
          user: null,
        });
        webview.postMessage({
          type: "chatError",
          threadId,
          message: "Session expired. Please sign in again.",
        });
        return true;
      }
      const errorText = await response.text();
      let errorMessage = `Request failed (${response.status})`;
      try {
        const parsed = JSON.parse(errorText);
        errorMessage = parsed.message ?? parsed.error ?? errorMessage;
      } catch {
        // Not JSON
      }
      webview.postMessage({ type: "chatError", threadId, message: errorMessage });
      return true;
    }

    // Start the first-chunk timeout — if no data arrives within 20s, show a
    // friendly hint while keeping the Stop button available.
    stillWorkingHint = setTimeout(() => {
      if (!firstChunkReceived && !controller.signal.aborted) {
        webview.postMessage({
          type: "chatStillWorking",
          threadId,
        });
      }
    }, FIRST_CHUNK_TIMEOUT_MS);

    // Stream the response
    for await (const chunk of parseStreamResponse(response)) {
      if (controller.signal.aborted) break;

      // First chunk received — cancel the "still working" hint
      if (!firstChunkReceived) {
        firstChunkReceived = true;
        if (stillWorkingHint) {
          clearTimeout(stillWorkingHint);
          stillWorkingHint = null;
        }
      }

      switch (chunk.type) {
        case "text-delta":
          fullText += chunk.textDelta ?? "";
          webview.postMessage({
            type: "chatChunk",
            threadId,
            textDelta: chunk.textDelta ?? "",
          });
          break;
        case "done":
          doneSent = true;
          webview.postMessage({
            type: "chatDone",
            threadId,
            fullText,
            assistantMessageId: `assistant-${Date.now()}`,
          });
          break;
        case "error":
          webview.postMessage({
            type: "chatError",
            threadId,
            message: chunk.error ?? "Unknown error",
          });
          break;
      }
    }

    // Stream ended without explicit done event — ensure we always send a
    // terminal message so the webview never gets stuck in "Thinking…"
    if (!doneSent && !controller.signal.aborted) {
      webview.postMessage({
        type: "chatDone",
        threadId,
        fullText,
        assistantMessageId: `assistant-${Date.now()}`,
      });
    }
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      if (hardTimeout && !firstChunkReceived) {
        // Hard timeout fired before any data arrived — show a timeout error
        webview.postMessage({
          type: "chatError",
          threadId,
          message: "Request timed out. The server may be slow or unreachable. Try again.",
        });
      } else {
        // User cancelled or hard timeout on partial stream — send accumulated text
        webview.postMessage({
          type: "chatAborted",
          threadId,
          partialText: fullText,
        });
      }
    } else {
      const message =
        err instanceof Error ? err.message : "Network error occurred";
      webview.postMessage({ type: "chatError", threadId, message });
    }
  } finally {
    if (hardTimeout) {
      clearTimeout(hardTimeout);
      hardTimeout = null;
    }
    if (stillWorkingHint) {
      clearTimeout(stillWorkingHint);
      stillWorkingHint = null;
    }
    activeAbortController = null;
    activeThreadId = null;
  }

  return true;
}

/**
 * Abort the active streaming response.
 */
export function abortCurrentStream(): string | null {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
    const tid = activeThreadId;
    activeThreadId = null;
    return tid;
  }
  return null;
}

/**
 * Check if a stream is currently active for the given thread.
 */
export function isStreaming(threadId?: string): boolean {
  if (!activeAbortController) return false;
  if (threadId) return activeThreadId === threadId;
  return true;
}
