/**
 * Typed message contracts between the Zeus AI extension host and the webview.
 *
 * Security rule: the webview NEVER sees raw access tokens or file contents
 * beyond previews the user approved seeing. The extension host makes all
 * authenticated requests and sends only safe UI data back.
 */

import type { ContextAttachment } from "./context/builders";

// ── Webview → Extension Host ─────────────────────────────────────────

export type ChatContextChip = "activeFile" | "selection" | "projectSummary" | "diagnostics" | "gitDiff";

export type WebviewMessage =
  // Auth / session (always available, never gated)
  | { type: "getState" }
  | { type: "signInGoogle" }
  | { type: "sendCode"; email: string; mode: "signin" | "create" }
  | { type: "verifyCode"; email: string; code: string }
  | { type: "cancelSignIn" }
  | { type: "signOut" }
  // Chat
  | { type: "chatSend"; text: string; threadId?: string; contextChips?: ChatContextChip[] }
  | { type: "chatStop" }
  | { type: "newChat" }
  | { type: "retryLastMessage"; threadId: string }
  | { type: "loadMessages"; threadId: string }
  // Analyze Project
  | { type: "analyzeStart" }
  | { type: "contextApprove"; scanId: string }
  | { type: "contextCancel"; scanId: string }
  | { type: "analysisClose" }
  // Code edits pipeline
  | { type: "editScopeApprove"; planId: string }
  | { type: "editScopeCancel"; planId: string }
  | { type: "changesApprove"; proposalId: string }
  | { type: "changesReject"; proposalId: string }
  | { type: "runValidationCommand"; command: string }
  // Diagnostics fixer
  | { type: "diagCollect" }
  | { type: "diagFixSelected"; keys: string[] }
  // Git review
  | { type: "gitReviewStart" }
  | { type: "gitReviewSelected"; approvalId: string; paths: string[] }
  | { type: "gitReviewCancel"; approvalId: string }
  // Test generation
  | { type: "testGenStart" };

// ── Domain types ─────────────────────────────────────────────────────

export interface UserIdentity {
  email: string;
  name: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  parts?: Array<{ type: string; text?: string }>;
  createdAt?: string;
}

// ── Extension Host → Webview (typed subset for reference/tests) ─────

export interface ContextPreviewMessage {
  type: "contextPreview";
  scanId: string;
  workspaceName: string;
  counts: {
    totalFilesOnDisk: number;
    included: number;
    sensitiveBlocked: number;
    ignored: number;
    skippedBinary: number;
  };
  limits: { maxFiles: number; maxFileKB: number; maxTotalKB: number };
  truncated: boolean;
  respectGitignore: boolean;
  samplePaths: string[];
  estimatedKB: number;
  estimatedTokens: number;
}

export interface ChangesProposedMessage {
  type: "changesProposed";
  proposalId: string;
  summary: string;
  files: Array<{
    path: string;
    action: "create" | "update";
    diff: string;
    additions: number;
    deletions: number;
    conflicted: string | null;
  }>;
  validation: string[];
  conflicts: number;
  note: string | null;
}

export interface EditPlanPreviewMessage {
  type: "editPlanPreview";
  planId: string;
  instruction: string;
  workspaceName: string;
  files: Array<{ path: string }>;
  notes: string[];
  attachmentLabels: string[];
}

export type ToolFlowMessage =
  | { type: "toolStatus"; flowId: string; stage: string }
  | { type: "toolChunk"; flowId: string; textDelta: string }
  | { type: "toolDone"; flowId: string; fullText: string }
  | { type: "toolError"; flowId: string; message: string; cancelled?: boolean };

export type { ContextAttachment };
