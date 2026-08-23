/**
 * Generic streaming request runner for Zeus tool flows (project analysis,
 * diagnostics fixes, git review, test generation, edit planning).
 *
 * Reuses the EXISTING authenticated POST /api/chat endpoint and stream
 * parser — no new AI endpoints, provider keys stay server-side.
 *
 * Distinct from chat-host.ts so normal conversation streaming is never
 * disturbed; tool messages are keyed by flowId (toolChunk/toolDone/
 * toolError) and each flow can be cancelled independently.
 *
 * Persistence policy: /api/chat requires a real thread id, so each action
 * creates an EPHEMERAL thread and deletes it when the flow ends. Project
 * context is therefore not retained remotely beyond the request lifetime.
 */

import * as vscode from "vscode";
import { getAccessToken } from "../auth/session";
import { getConfig } from "../config";
import { parseStreamResponse } from "../stream-parser";
import { zeusLog } from "../log";
import { createThread, deleteThread } from "../threads";

const FIRST_CHUNK_TIMEOUT_MS = 20_000;
const HARD_TIMEOUT_MS = 180_000;

const activeFlows = new Map<string, AbortController>();

export interface ToolFlowOptions {
  flowId: string;
  webview: vscode.Webview;
  /** Short label used for the ephemeral thread title (e.g. "Project Analysis"). */
  label?: string;
  /** Full user prompt (context + instruction). Never logged. */
  prompt: string;
  /** Optional system-style preamble embedded at the top of the prompt. */
  preamble?: string;
  onText?: (delta: string) => void;
}

export function cancelToolFlow(flowId: string): void {
  const c = activeFlows.get(flowId);
  if (c) {
    c.abort();
    activeFlows.delete(flowId);
  }
}

export function cancelAllToolFlows(): void {
  for (const [, c] of activeFlows) c.abort();
  activeFlows.clear();
}

export function isToolFlowActive(): boolean {
  return activeFlows.size > 0;
}

export interface ToolFlowResult {
  ok: boolean;
  fullText: string;
  error?: string;
}

/** Run one streaming tool request to completion. */
export async function runToolFlow(opts: ToolFlowOptions): Promise<ToolFlowResult> {
  const { flowId, webview } = opts;

  if (activeFlows.has(flowId)) {
    return { ok: false, fullText: "", error: "A Zeus action is already running." };
  }

  const token = await getAccessToken();
  if (!token) {
    void webview.postMessage({ type: "toolError", flowId, message: "Not authenticated. Please sign in." });
    return { ok: false, fullText: "", error: "unauthenticated" };
  }

  const { apiBaseUrl } = getConfig();
  if (!apiBaseUrl) {
    void webview.postMessage({ type: "toolError", flowId, message: "API base URL not configured." });
    return { ok: false, fullText: "", error: "unconfigured" };
  }

  const controller = new AbortController();
  activeFlows.set(flowId, controller);

  let fullText = "";
  let firstChunk = false;
  let hardTimeout: ReturnType<typeof setTimeout> | null = null;
  let hintTimer: ReturnType<typeof setTimeout> | null = null;
  const post = (msg: Record<string, unknown>) => void webview.postMessage(msg);

  hardTimeout = setTimeout(() => {
    if (!controller.signal.aborted) controller.abort();
  }, HARD_TIMEOUT_MS);

  let threadId: string | null = null;
  try {
    post({ type: "toolStatus", flowId, stage: "started" });

    // Ephemeral thread: created for this action only, deleted afterwards so
    // project context is not persisted remotely beyond the request lifetime.
    const thread = await createThread(`Zeus · ${opts.label ?? "Action"}`);
    if (!thread) throw new Error("Could not create a Zeus action session.");
    threadId = thread.id;

    const response = await fetch(`${apiBaseUrl}/api/chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            id: `tool-${flowId}`,
            role: "user",
            parts: [
              { type: "text", text: (opts.preamble ? opts.preamble + "\n\n" : "") + opts.prompt },
            ],
          },
        ],
        threadId,
        mode: "chat",
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try {
        const parsed = JSON.parse(await response.text()) as { message?: string; error?: string };
        message = parsed.message ?? parsed.error ?? message;
      } catch {
        /* not JSON */
      }
      if (response.status === 401) message = "Session expired. Please sign in again.";
      post({ type: "toolError", flowId, message });
      return { ok: false, fullText, error: message };
    }

    hintTimer = setTimeout(() => {
      if (!firstChunk && !controller.signal.aborted) {
        post({ type: "toolStatus", flowId, stage: "stillWorking" });
      }
    }, FIRST_CHUNK_TIMEOUT_MS);

    for await (const chunk of parseStreamResponse(response)) {
      if (controller.signal.aborted) break;
      if (!firstChunk) {
        firstChunk = true;
        if (hintTimer) {
          clearTimeout(hintTimer);
          hintTimer = null;
        }
      }
      if (chunk.type === "text-delta") {
        const delta = chunk.textDelta ?? "";
        fullText += delta;
        opts.onText?.(delta);
        post({ type: "toolChunk", flowId, textDelta: delta });
      } else if (chunk.type === "error") {
        const message = chunk.error ?? "Unknown backend error";
        post({ type: "toolError", flowId, message });
        return { ok: false, fullText, error: message };
      }
    }

    post({ type: "toolDone", flowId, fullText });
    return { ok: true, fullText };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      const timedOut = !firstChunk && hardTimeout !== null && !hintTimer;
      post({
        type: "toolError",
        flowId,
        message: timedOut ? "Request timed out. Try again." : "Cancelled.",
        cancelled: !timedOut,
      });
      return { ok: false, fullText, error: timedOut ? "timeout" : "cancelled" };
    }
    const message = err instanceof Error ? err.message : "Network error occurred";
    zeusLog(`tool flow ${flowId} failed: ${message}`);
    post({ type: "toolError", flowId, message });
    return { ok: false, fullText, error: message };
  } finally {
    if (hardTimeout) clearTimeout(hardTimeout);
    if (hintTimer) clearTimeout(hintTimer);
    activeFlows.delete(flowId);
    // Best-effort ephemeral-thread cleanup — never blocks or fails the action.
    if (threadId) void deleteThread(threadId).catch(() => undefined);
  }
}
