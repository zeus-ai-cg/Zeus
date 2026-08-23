import * as vscode from "vscode";

/**
 * Safe diagnostic logging for the Zeus AI extension.
 *
 * Rules (enforced by convention, see README):
 *   - Never log access tokens, refresh tokens, authorization headers,
 *     OAuth authorization codes, callback URLs containing codes, or user
 *     message content.
 *   - Only short, static lifecycle strings and safe error messages.
 */
let channel: vscode.OutputChannel | null = null;

export function zeusLog(message: string): void {
  // Mirror to console so Extension Host logs capture it too.
  console.log(`[Zeus AI] ${message}`);
  if (!channel) {
    channel = vscode.window.createOutputChannel("Zeus AI");
  }
  channel.appendLine(`[${new Date().toISOString()}] ${message}`);
}
