import * as vscode from "vscode";
import type { Session } from "@supabase/supabase-js";
import {
  clearSession,
  getUserIdentity,
  initSessionStorage,
  isAuthenticated,
  saveSession,
} from "./auth/session";
import { cancelGoogleSignIn, signInWithGoogle } from "./auth/google";
import { sendVerificationCode, verifyEmailCode } from "./auth/email";
import { buildWebviewHtml, type WebviewMessage } from "./webview";
import { sendChatMessage, abortCurrentStream, isStreaming } from "./chat-host";
import { createThread, loadThreadMessages } from "./threads";
import { zeusLog } from "./log";
import { cancelAllToolFlows } from "./tools/stream";
import {
  collectActiveFile,
  collectSelection,
  collectDiagnosticsAttachment,
  collectGitDiffAttachment,
  getCachedProjectSummary,
  clearCachedProjectSummary,
  type ContextAttachment,
} from "./context/builders";
import {
  startAnalysis,
  approveScanAndAnalyze,
  cancelPendingScan,
} from "./actions/analyze";
import {
  runApprovedEditScope,
  applyApprovedChanges,
  rejectChanges,
  rejectPlan,
  runValidationCommand,
} from "./actions/code-edits";
import { collectAndPostIssues, fixSelectedIssues } from "./actions/diagnostics-fix";
import { startReview, reviewSelected, cancelReview } from "./actions/git-review";
import { startTestGeneration } from "./actions/test-gen";
import { scheduleUpdateCheck } from "./update-check";

/**
 * Zeus AI — VS Code extension.
 *
 * Activation surface:
 *   - Activity Bar container "Zeus AI" with a webview sidebar view.
 *   - Commands: Zeus: Open / Sign In / Sign Out.
 *
 * Chat (Phase 2):
 *   - Authenticated streaming chat via the Zeus backend /api/chat endpoint.
 *   - Thread management (create, load messages).
 *
 * Project Intelligence & Safe Coding Actions (Phase 3):
 *   - Included with every Zeus AI extension install (Pro/Ultimate is enforced
 *     by the website at download time; the app itself never checks plans).
 *   - Privacy Firewall filters every file path BEFORE any content is read or
 *     sent. Nothing is transmitted without an explicit user approval step.
 *   - Plan → Diff → Approval → WorkspaceEdit lifecycle for every code change;
 *     nothing is ever applied without explicit approval (single undo step).
 */

const SIDEBAR_VIEW_ID = "zeus-ai.sidebar";

class ZeusSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = SIDEBAR_VIEW_ID;

  private view?: vscode.WebviewView;
  private webviewReadyTimer?: NodeJS.Timeout;
  private currentThreadId: string | null = null;
  private messageHistory: Array<{
    id: string;
    role: "user" | "assistant";
    text: string;
    parts?: Array<{ type: string; text?: string }>;
  }> = [];

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };
    webviewView.webview.html = buildWebviewHtml();
    webviewView.webview.onDidReceiveMessage((message) =>
      void this.handleMessage(message as WebviewMessage).catch((err: unknown) => {
        // Never let a handler rejection fail silently.
        const msg = err instanceof Error ? err.message : "unknown error";
        zeusLog(`message handler failed: ${msg}`);
        this.notifyError("Something went wrong. Please try again.");
        this.post({ type: "busy", busy: false });
      }),
    );

    // Watchdog: the webview script posts "webviewReady" once it has parsed and
    // executed. If it never arrives, the inline script died at parse time
    // (e.g. a syntax error) — surface that instead of failing silently.
    clearTimeout(this.webviewReadyTimer);
    this.webviewReadyTimer = setTimeout(() => {
      zeusLog("webview did NOT report ready within 5s — UI script likely failed to parse");
      void vscode.window.showWarningMessage(
        "Zeus AI: the sidebar UI failed to initialize. Check the 'Zeus AI' output channel and reinstall the extension.",
      );
    }, 5000);

    // Push the current auth state every time the view appears.
    void this.pushAuthState();
  }

  private post(message: Record<string, unknown>): void {
    void this.view?.webview.postMessage(message);
  }

  /** Push the current auth state to the webview (used by view + commands). */
  public async pushAuthState(): Promise<void> {
    const authenticated = await isAuthenticated();
    const user = authenticated ? await getUserIdentity() : null;
    this.post({ type: "authState", authenticated, user });
  }

  /** Surface an error to the webview without logging any secrets. */
  private notifyError(message: string): void {
    this.post({ type: "error", message });
  }

  /** Build a context attachment for a chip id (firewall-filtered inside). */
  private async buildChip(chip: string): Promise<ContextAttachment | { blocked: true; message: string }> {
    switch (chip) {
      case "activeFile":
        return collectActiveFile();
      case "selection":
        return collectSelection();
      case "projectSummary":
        return getCachedProjectSummary();
      case "diagnostics":
        return collectDiagnosticsAttachment();
      case "gitDiff":
        return collectGitDiffAttachment();
      default:
        return { blocked: true as const, message: "Unknown context option." };
    }
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      // ── Auth / session (never gated) ────────────────────────────────
      case "getState":
        await this.pushAuthState();
        break;

      case "webviewReady":
        // Startup diagnostic — confirms the webview script parsed and executed.
        clearTimeout(this.webviewReadyTimer);
        zeusLog("webview initialized");
        break;

      case "signInGoogle": {
        zeusLog("signInGoogle message received");
        const result = await signInWithGoogle();
        if (result.session) {
          zeusLog("Google sign-in succeeded");
          await saveSession(result.session);
          await this.pushAuthState();
          void vscode.window.showInformationMessage("Signed in to Zeus AI.");
        } else if (!result.cancelled) {
          zeusLog("Google OAuth flow failed: sign-in returned no session (see prior safe error)");
          this.notifyError("Google sign-in failed. Please try again.");
          this.post({ type: "busy", busy: false });
          await this.pushAuthState();
        } else {
          zeusLog("Google sign-in cancelled by user");
          this.post({ type: "busy", busy: false });
          await this.pushAuthState();
        }
        break;
      }

      case "sendCode": {
        const email = typeof message.email === "string" ? message.email : "";
        const mode = message.mode === "create" ? "create" : "signin";
        const result = await sendVerificationCode(email, mode === "create");
        this.post({
          type: "emailSent",
          ok: result.ok,
          message: result.ok ? undefined : (result.message ?? "Could not send the code."),
        });
        break;
      }

      case "verifyCode": {
        const email = typeof message.email === "string" ? message.email : "";
        const code = typeof message.code === "string" ? message.code : "";
        const session: Session | null = await verifyEmailCode(email, code);
        if (session) {
          await this.pushAuthState();
          void vscode.window.showInformationMessage("Signed in to Zeus AI.");
        } else {
          this.notifyError("That code didn't match. Check the email and try again.");
          this.post({ type: "busy", busy: false });
        }
        break;
      }

      case "cancelSignIn":
        cancelGoogleSignIn();
        this.post({ type: "busy", busy: false });
        await this.pushAuthState();
        break;

      case "signOut": {
        if (isStreaming()) {
          abortCurrentStream();
        }
        cancelAllToolFlows();
        await clearSession();
        clearCachedProjectSummary();
        this.currentThreadId = null;
        this.messageHistory = [];
        await this.pushAuthState();
        void vscode.window.showInformationMessage("Signed out of Zeus AI.");
        break;
      }

      // ── Chat ─────────────────────────────────────────────────────────
      case "chatSend": {
        const text = typeof message.text === "string" ? message.text.trim() : "";
        if (!text) {
          this.notifyError("Cannot send an empty message.");
          break;
        }

        // Resolve requested context chips → attachments (privacy-filtered).
        let contextText: string | undefined;
        const chips = Array.isArray(message.contextChips) ? message.contextChips : [];
        const attachedLabels: string[] = [];
        for (const chip of chips.slice(0, 5)) {
          const att = await this.buildChip(chip);
          if ("blocked" in att) continue; // silently skip unavailable context
          contextText = contextText ? `${contextText}\n\n${att.text}` : att.text;
          attachedLabels.push(att.label);
        }
        if (attachedLabels.length > 0) {
          this.post({ type: "contextAttached", labels: attachedLabels });
        }

        if (!this.currentThreadId) {
          try {
            const thread = await createThread();
            if (thread) {
              this.currentThreadId = thread.id;
              this.post({
                type: "threadCreated",
                threadId: thread.id,
                title: thread.title,
              });
            } else {
              this.notifyError("Failed to create a new conversation.");
              break;
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to create thread";
            this.notifyError(msg);
            break;
          }
        }

        const userMsg = {
          id: `user-${Date.now()}`,
          role: "user" as const,
          text,
        };
        this.messageHistory.push(userMsg);

        const threadId = this.currentThreadId!;
        await sendChatMessage(
          this.view!.webview,
          threadId,
          text,
          this.messageHistory,
          contextText,
        );
        break;
      }

      case "chatStop":
        abortCurrentStream();
        cancelAllToolFlows();
        break;

      case "chatDone": {
        const fullText = typeof message.fullText === "string" ? message.fullText : "";
        const assistantMsgId = typeof message.assistantMessageId === "string"
          ? message.assistantMessageId
          : `assistant-${Date.now()}`;
        if (fullText) {
          this.messageHistory.push({
            id: assistantMsgId,
            role: "assistant",
            text: fullText,
          });
        }
        break;
      }

      case "newChat":
        if (isStreaming()) {
          abortCurrentStream();
        }
        cancelAllToolFlows();
        this.currentThreadId = null;
        this.messageHistory = [];
        this.post({ type: "threadCreated", threadId: null, title: "New conversation" });
        break;

      case "loadMessages": {
        const threadId = typeof message.threadId === "string" ? message.threadId : "";
        if (!threadId) break;

        try {
          const messages = await loadThreadMessages(threadId);
          this.currentThreadId = threadId;
          this.messageHistory = messages.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            text: m.parts?.map((p) => p.text ?? "").join("") ?? "",
            parts: m.parts,
          }));
          this.post({
            type: "messagesLoaded",
            threadId,
            messages: this.messageHistory,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to load messages";
          this.notifyError(msg);
        }
        break;
      }

      case "retryLastMessage": {
        const lastUserMsg = [...this.messageHistory]
          .reverse()
          .find((m) => m.role === "user");
        if (!lastUserMsg) {
          this.notifyError("No message to retry.");
          break;
        }
        const lastIdx = this.messageHistory.length - 1;
        if (lastIdx >= 0 && this.messageHistory[lastIdx].role === "assistant") {
          this.messageHistory.pop();
        }
        const threadId = this.currentThreadId;
        if (!threadId) {
          this.notifyError("No active conversation to retry.");
          break;
        }
        await sendChatMessage(this.view!.webview, threadId, lastUserMsg.text, this.messageHistory);
        break;
      }

      // ── Analyze Project ─────────────────────────────────────────────
      case "analyzeStart": {
        await startAnalysis(this.view!.webview);
        break;
      }

      case "contextApprove": {
        await approveScanAndAnalyze(this.view!.webview, String(message.scanId));
        break;
      }

      case "contextCancel":
        cancelPendingScan(String(message.scanId));
        this.post({ type: "analysisClosed", reason: "cancelled" });
        break;

      case "analysisClose":
        this.post({ type: "analysisClosed", reason: "closed" });
        break;

      // ── Code edits pipeline ─────────────────────────────────────────
      case "editScopeApprove": {
        await runApprovedEditScope(this.view!.webview, String(message.planId));
        break;
      }

      case "editScopeCancel":
        rejectPlan(String(message.planId));
        this.post({ type: "editPlanClosed" });
        break;

      case "changesApprove": {
        await applyApprovedChanges(this.view!.webview, String(message.proposalId));
        break;
      }

      case "changesReject":
        rejectChanges(String(message.proposalId));
        this.post({ type: "changesClosed", applied: false });
        break;

      case "runValidationCommand": {
        const ok = runValidationCommand(String(message.command));
        if (!ok) this.notifyError("That command is not on the allow-list.");
        break;
      }

      // ── Diagnostics fixer ───────────────────────────────────────────
      case "diagCollect": {
        await collectAndPostIssues(this.view!.webview);
        break;
      }

      case "diagFixSelected": {
        const keys = Array.isArray(message.keys) ? message.keys.map(String) : [];
        await fixSelectedIssues(this.view!.webview, keys);
        break;
      }

      // ── Git diff review ─────────────────────────────────────────────
      case "gitReviewStart": {
        await startReview(this.view!.webview);
        break;
      }

      case "gitReviewSelected": {
        const paths = Array.isArray(message.paths) ? message.paths.map(String) : [];
        await reviewSelected(this.view!.webview, String(message.approvalId), paths);
        break;
      }

      case "gitReviewCancel":
        cancelReview(String(message.approvalId));
        this.post({ type: "reviewCancelled" });
        break;

      // ── Test generation ─────────────────────────────────────────────
      case "testGenStart": {
        await startTestGeneration(this.view!.webview);
        break;
      }

      default:
        // Unknown message — ignore.
        break;
    }
  }
}

export function activate(context: vscode.ExtensionContext): void {
  initSessionStorage(context.secrets);

  // Best-effort update nudge (fires 15s after activation, never blocks).
  scheduleUpdateCheck(context);

  // Sidebar view provider.
  const provider = new ZeusSidebarProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ZeusSidebarProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // Zeus: Open — focus the sidebar view.
  context.subscriptions.push(
    vscode.commands.registerCommand("zeus.open", () => {
      void vscode.commands.executeCommand(`${ZeusSidebarProvider.viewType}.focus`);
    }),
  );

  // Zeus: Sign In — open the sidebar and show the sign-in flow.
  context.subscriptions.push(
    vscode.commands.registerCommand("zeus.signIn", () => {
      void vscode.commands.executeCommand(`${ZeusSidebarProvider.viewType}.focus`);
    }),
  );

  // Zeus: Sign Out.
  context.subscriptions.push(
    vscode.commands.registerCommand("zeus.signOut", async () => {
      if (isStreaming()) {
        abortCurrentStream();
      }
      cancelAllToolFlows();
      await clearSession();
      clearCachedProjectSummary();
      await provider.pushAuthState();
      void vscode.window.showInformationMessage("Signed out of Zeus AI.");
    }),
  );
}

export function deactivate(): void {
  abortCurrentStream();
  cancelAllToolFlows();
}
