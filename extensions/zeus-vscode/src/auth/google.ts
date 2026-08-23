import * as http from "node:http";
import * as vscode from "vscode";
import type { Session } from "@supabase/supabase-js";
import { createAuthClient } from "./session";
import { zeusLog } from "../log";

// Tracks the single in-flight Google flow so the webview can cancel it when
// the user abandons the browser step (instead of waiting out the 10-min TTL).
let cancelActiveFlow: (() => void) | null = null;

/** Cancel the in-flight Google sign-in, if any. No-op when idle. */
export function cancelGoogleSignIn(): void {
  cancelActiveFlow?.();
}

export interface GoogleSignInResult {
  session: Session | null;
  /** True when the user abandoned the flow (cancelled), vs a real failure. */
  cancelled: boolean;
}

/**
 * Google OAuth via PKCE with a loopback callback server.
 *
 * Mirrors the Zeus desktop PKCE architecture (verifier stays client-side,
 * code exchanged for a session over a loopback URL):
 *
 *   1. Create a Supabase client with flowType "pkce".
 *   2. Start an HTTP server bound to 127.0.0.1:<random free port>.
 *   3. Ask Supabase for the Google authorize URL (it embeds the PKCE
 *      code_challenge) and open it in the system browser.
 *   4. Supabase redirects back to http://127.0.0.1:<port>/callback?code=…
 *   5. Exchange the code for a session using the same client (which holds
 *      the code_verifier in memory).
 *
 * The server binds to loopback only, closes after the exchange (or a
 * timeout), and never exposes anything beyond the single authorization code.
 *
 * Returns the session on success, or null when the user cancelled / the flow
 * failed / timed out.
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  zeusLog("Google OAuth flow started");
  const client = createAuthClient();
  const timeoutMs = 10 * 60 * 1000; // same TTL as the Zeus desktop flow

  return new Promise<GoogleSignInResult>((resolve) => {
    let settled = false;
    let cancelled = false;
    // One in-flight flow at a time: the `settled` guard means only the first
    // /callback hit can complete the exchange; any later hit is a no-op.
    let flowId: string | null = null;
    const finish = (session: Session | null) => {
      if (settled) return;
      settled = true;
      cancelActiveFlow = null;
      clearTimeout(timer);
      if (server.listening) server.close();
      resolve({ session, cancelled });
    };
    // The webview can abandon the browser step at any time.
    cancelActiveFlow = () => {
      cancelled = true;
      finish(null);
    };

    // Safe failure helper — logs only a short, non-secret reason.
    const failWith = (reason: string) => {
      zeusLog(`OAuth flow failed: ${reason}`);
      void vscode.window.showErrorMessage(`Google sign-in failed: ${reason}`);
      finish(null);
    };

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      const errorDescription = url.searchParams.get("error_description");

      // Render a small closeable page; the session is delivered over IPC to
      // the webview once the exchange below completes.
      if (error || !code) {
        zeusLog("OAuth flow failed: callback returned an error or missing code");
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          callbackPage(
            "Zeus AI sign-in failed",
            errorDescription ?? error ?? "Google sign-in was cancelled.",
          ),
        );
        finish(null);
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(callbackPage("Signing you in…", "You can close this tab and return to VS Code."));

      void client.auth
        .exchangeCodeForSession(code, flowId ? { flowId } : undefined)
        .then(({ data, error: exchangeError }) => {
          if (exchangeError || !data.session) {
            failWith(exchangeError?.message ?? "token exchange returned no session");
            return;
          }
          finish(data.session);
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : "unknown error";
          failWith(message);
        });
    });

    const timer = setTimeout(() => {
      failWith("timed out");
    }, timeoutMs);

    server.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        finish(null);
        return;
      }
      const redirectTo = `http://127.0.0.1:${address.port}/callback`;
      // Supabase Auth owns OAuth `state` end-to-end: GoTrue generates its own
      // CSRF state for the Google handshake, validates it on its callback, and
      // only then redirects to `redirectTo` with the authorization code. Any
      // client-supplied `state` (via queryParams) collides with Supabase's
      // reserved state and yields `bad_oauth_state`, so none is sent here.
      const { data, error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error || !data.url) {
        failWith(`could not start OAuth: ${error?.message ?? "no authorize URL"}`);
        return;
      }
      // The PKCE verifier is stored per-flow; pass the flowId so the exchange
      // reads the correct verifier slot (single in-flight flow here).
      flowId = data.flowId ?? null;
      zeusLog("browser launch requested");
      await vscode.env.openExternal(vscode.Uri.parse(data.url));
    });
  });
}

function callbackPage(title: string, subtitle: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         background: #0f172a; color: #e2e8f0; display: grid;
         place-items: center; min-height: 100vh; margin: 0; }
  .card { background: #1e293b; border-radius: 12px; padding: 32px 40px;
          max-width: 360px; text-align: center; }
  .logo { font-size: 28px; }
  h1 { font-size: 18px; margin: 12px 0 6px; }
  p { font-size: 14px; color: #94a3b8; margin: 0; }
</style>
</head>
<body>
  <div class="card">
    <div class="logo">⚡</div>
    <h1>${esc(title)}</h1>
    <p>${esc(subtitle)}</p>
  </div>
</body>
</html>`;
}
