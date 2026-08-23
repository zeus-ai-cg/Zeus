/**
 * Webview UI for the Zeus AI sidebar — Phase 2: AI Chat (v2).
 *
 * Screens:
 *   - Signed out → Welcome (Continue with Google / Sign in with Email / Create Account)
 *   - Email → "Check your email" → 6-digit code → Verify
 *   - Signed in → Full chat interface with messages, composer, streaming
 *
 * All state lives in the extension host; the webview is a lightweight
 * renderer that exchanges typed messages over postMessage. No AI calls, no
 * file access, no secrets in this UI.
 *
 * Security: The webview never receives, stores, or logs Supabase tokens.
 */

export interface WebviewMessage {
  type: string;
  [key: string]: unknown;
}

export function buildWebviewHtml(): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '<meta http-equiv="Content-Security-Policy"',
    "      content=\"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src https: data:; font-src 'none'; worker-src 'none';\" />",
    '<title>Zeus AI</title>',
    getStyles(),
    '</head>',
    '<body>',
    '<div class="error-box" id="errorBox"></div>',
    getWelcomeScreen(),
    getEmailScreen(),
    getCodeScreen(),
    getChatScreen(),
    getOverlays(),
    getScript(),
    '</body>',
    '</html>',
  ].join('\n');
}

function getStyles(): string {
  return `
<style>
  :root {
    --bg: var(--vscode-editor-background, #1e1e1e);
    --bg-elevated: var(--vscode-sideBar-background, #252526);
    --card: var(--vscode-editorWidget-background, #2d2d2d);
    --border: var(--vscode-widget-border, #3c3c3c);
    --text: var(--vscode-foreground, #cccccc);
    --text-muted: var(--vscode-descriptionForeground, #999999);
    --accent: var(--vscode-textLink-foreground, #3794ff);
    --accent-2: #22d3ee;
    --accent-soft: rgba(55, 148, 255, 0.16);
    --success: #34d399;
    --danger: var(--vscode-errorForeground, #f48771);
    --danger-bg: rgba(244, 135, 113, 0.12);
    --radius: 8px;
    --font-mono: var(--vscode-editor-font-family, "Cascadia Code", "Fira Code", monospace);
    --font-sans: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
    --transition-fast: 120ms ease;
    --transition-normal: 180ms ease;
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; overflow: hidden; }
  body {
    font-family: var(--font-sans);
    background: var(--bg);
    color: var(--text);
    font-size: 13px;
    line-height: 1.5;
    display: flex;
    flex-direction: column;
  }
  .screen { display: none; flex-direction: column; height: 100%; }
  .screen.active { display: flex; }

  /* ── Buttons ──────────────────────────────────────────────────── */
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    padding: 6px 12px; border-radius: var(--radius);
    border: 1px solid var(--border); background: var(--card); color: var(--text);
    font-size: 12px; font-weight: 600; cursor: pointer; font-family: var(--font-sans);
    transition: all var(--transition-fast);
  }
  .btn:hover { border-color: var(--accent); background: var(--bg-elevated); }
  .btn:active { transform: scale(0.97); }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; pointer-events: none; }
  .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .btn-primary { background: var(--accent); border: none; color: #fff; }
  .btn-primary:hover { opacity: 0.9; border: none; }
  .btn-ghost { background: transparent; border: none; color: var(--accent); }
  .btn-ghost:hover { background: var(--accent-soft); border: none; }
  .btn-danger { color: var(--danger); }
  .btn-danger:hover { background: var(--danger-bg); border-color: var(--danger); }
  .btn-sm { padding: 4px 8px; font-size: 11px; }
  .btn-icon { width: 28px; height: 28px; padding: 0; border-radius: 6px; }
  .btn-stop {
    background: var(--danger); border: none; color: #fff;
    width: 30px; height: 30px; border-radius: 8px; cursor: pointer;
    display: grid; place-items: center; flex-shrink: 0;
    transition: all var(--transition-fast);
    font-size: 14px; font-weight: 700;
  }
  .btn-stop:hover { opacity: 0.85; }
  .btn-stop:active { transform: scale(0.93); }

  /* ── Auth screens ─────────────────────────────────────────────── */
  .auth-content { padding: 20px 16px; flex: 1; display: flex; flex-direction: column; }
  .auth-title { font-size: 17px; font-weight: 700; margin-bottom: 4px; }
  .auth-sub { color: var(--text-muted); font-size: 12.5px; margin-bottom: 16px; }
  .auth-actions { display: flex; flex-direction: column; gap: 8px; }
  .field {
    width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border);
    background: var(--bg); color: var(--text); font-size: 13px; outline: none;
    transition: border-color var(--transition-fast); font-family: var(--font-sans);
  }
  .field:focus { border-color: var(--accent); }
  .code-field { text-align: center; font-size: 18px; letter-spacing: 8px; font-weight: 700; }
  .error-box {
    background: var(--danger-bg); border: 1px solid rgba(244,135,113,0.3);
    color: var(--danger); padding: 8px 10px; border-radius: 6px; font-size: 12px;
    margin-bottom: 10px; display: none;
  }
  .hint { color: var(--text-muted); font-size: 11px; margin-top: 12px; text-align: center; }
  .google-hint { display: none; text-align: center; color: var(--text-muted); font-size: 12px; margin: 8px 0; }

  /* ── Chat header ──────────────────────────────────────────────── */
  .chat-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0;
    background: var(--bg-elevated);
  }
  .chat-header-left { display: flex; align-items: center; gap: 8px; }
  .chat-header-title {
    display: flex; align-items: center; gap: 6px;
  }
  .chat-header-logo {
    width: 22px; height: 22px; border-radius: 6px;
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    display: grid; place-items: center; font-size: 12px; color: #fff;
    font-weight: 700; flex-shrink: 0;
  }
  .chat-title { font-size: 13px; font-weight: 600; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chat-header-actions { display: flex; gap: 4px; align-items: center; }

  /* ── Messages ─────────────────────────────────────────────────── */
  .messages {
    flex: 1; overflow-y: auto; overflow-x: hidden;
    padding: 12px 14px; scroll-behavior: smooth;
    display: flex; flex-direction: column; gap: 12px; position: relative;
  }
  .messages::-webkit-scrollbar { width: 6px; }
  .messages::-webkit-scrollbar-track { background: transparent; }
  .messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

  .msg {
    display: flex; gap: 8px; animation: msgIn 180ms ease forwards;
    opacity: 0; transform: translateY(4px);
  }
  .msg-user { justify-content: flex-end; }
  .msg-user .msg-content { background: var(--accent); color: #fff; border-radius: 12px 12px 2px 12px; }
  .msg-assistant .msg-content {
    background: var(--card); border-radius: 12px 12px 12px 2px;
    border: 1px solid var(--border); flex: 1; min-width: 0;
  }
  .msg-avatar {
    width: 26px; height: 26px; border-radius: 6px; flex-shrink: 0;
    display: grid; place-items: center; font-size: 12px; font-weight: 700;
  }
  .msg-avatar-zeus { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #fff; }
  .msg-content {
    padding: 8px 12px; font-size: 13px; line-height: 1.55;
    max-width: 85%; min-width: 40px; word-break: break-word; position: relative;
  }
  .msg-content p { margin: 0 0 6px 0; }
  .msg-content p:last-child { margin-bottom: 0; }
  .msg-content h1, .msg-content h2, .msg-content h3, .msg-content h4 {
    font-size: 13px; font-weight: 700; margin: 8px 0 4px 0; color: var(--text);
  }
  .msg-content ul, .msg-content ol { margin: 4px 0; padding-left: 20px; }
  .msg-content li { margin: 2px 0; }
  .msg-content code {
    font-family: var(--font-mono); font-size: 12px; background: rgba(255,255,255,0.08);
    padding: 1px 4px; border-radius: 3px;
  }
  .msg-user .msg-content code { background: rgba(0,0,0,0.2); }
  .msg-time { font-size: 10px; color: var(--text-muted); margin-top: 3px; opacity: 0.7; }
  .msg-user .msg-time { text-align: right; }

  .code-block {
    margin: 6px 0; border-radius: 6px; overflow: hidden;
    border: 1px solid var(--border); background: var(--bg);
  }
  .code-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 4px 8px; background: var(--bg-elevated);
    border-bottom: 1px solid var(--border); font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted);
  }
  .code-copy-btn {
    display: inline-flex; align-items: center; gap: 3px;
    padding: 2px 6px; border-radius: 4px; border: none;
    background: transparent; color: var(--text-muted); font-size: 10px;
    cursor: pointer; font-family: var(--font-sans); transition: all var(--transition-fast);
  }
  .code-copy-btn:hover { background: var(--accent-soft); color: var(--accent); }
  .code-copy-btn.copied { color: var(--success); }
  .code-block pre {
    margin: 0; padding: 10px; overflow-x: auto;
    font-family: var(--font-mono); font-size: 12px; line-height: 1.5; color: var(--text);
  }
  .code-block pre code { background: none; padding: 0; font-size: 12px; }

  /* ── Composer ─────────────────────────────────────────────────── */
  .composer {
    border-top: 1px solid var(--border); padding: 10px 14px;
    background: var(--bg-elevated); flex-shrink: 0;
  }
  .composer-inner {
    display: flex; align-items: flex-end; gap: 6px;
    border: 1px solid var(--border); border-radius: 10px;
    background: var(--bg); padding: 4px; transition: border-color var(--transition-fast);
  }
  .composer-inner:focus-within { border-color: var(--accent); }
  .composer-input {
    flex: 1; resize: none; border: none; background: transparent;
    color: var(--text); font-size: 13px; font-family: var(--font-sans);
    line-height: 1.5; padding: 6px 8px; outline: none; min-height: 20px; max-height: 120px;
  }
  .composer-input::placeholder { color: var(--text-muted); }
  .composer-send {
    width: 30px; height: 30px; border-radius: 8px; border: none;
    background: var(--accent); color: #fff; cursor: pointer;
    display: grid; place-items: center; flex-shrink: 0; transition: all var(--transition-fast);
  }
  .composer-send:hover { opacity: 0.9; }
  .composer-send:active { transform: scale(0.93); }
  .composer-send:disabled { opacity: 0.4; cursor: not-allowed; }
  .composer-hint { font-size: 10px; color: var(--text-muted); margin-top: 4px; text-align: center; }

  /* ── Empty state ──────────────────────────────────────────────── */
  .empty-state {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 20px; text-align: center;
  }
  .empty-icon {
    width: 56px; height: 56px; border-radius: 14px;
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    display: grid; place-items: center; font-size: 26px; color: #fff;
    margin-bottom: 14px; box-shadow: 0 4px 20px rgba(55,148,255,0.25);
  }
  .empty-title { font-size: 17px; font-weight: 700; margin-bottom: 4px; }
  .empty-sub { color: var(--text-muted); font-size: 12px; margin-bottom: 18px; max-width: 280px; }
  .starters { display: flex; flex-direction: column; gap: 6px; width: 100%; max-width: 300px; }
  .starter-btn {
    display: flex; align-items: center; gap: 8px; padding: 8px 12px;
    border-radius: 8px; border: 1px solid var(--border); background: var(--card);
    color: var(--text); font-size: 12px; cursor: pointer; text-align: left;
    font-family: var(--font-sans); transition: all var(--transition-fast);
  }
  .starter-btn:hover { border-color: var(--accent); background: var(--bg-elevated); }
  .starter-btn:active { transform: scale(0.98); }
  .starter-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .starter-icon { font-size: 14px; flex-shrink: 0; }

  /* ── Generation indicator ─────────────────────────────────────── */
  .gen-indicator {
    display: flex; align-items: center; gap: 8px; padding: 4px 0;
  }
  .gen-pulse {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--accent);
    animation: genPulse 1.4s ease-in-out infinite;
  }
  .gen-label {
    font-size: 11px; color: var(--text-muted); font-style: italic;
  }
  @keyframes genPulse {
    0%, 100% { opacity: 0.3; transform: scale(0.85); }
    50% { opacity: 1; transform: scale(1.15); }
  }
  .typing-indicator { display: flex; gap: 3px; padding: 4px 0; align-items: center; }
  .typing-dot {
    width: 5px; height: 5px; border-radius: 50%; background: var(--text-muted);
    animation: typingBounce 1.2s infinite ease-in-out;
  }
  .typing-dot:nth-child(2) { animation-delay: 0.2s; }
  .typing-dot:nth-child(3) { animation-delay: 0.4s; }


  /* ── Jump to latest ───────────────────────────────────────────── */
  .jump-latest {
    position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%);
    padding: 4px 10px; border-radius: 12px; border: 1px solid var(--border);
    background: var(--bg-elevated); color: var(--text); font-size: 11px;
    cursor: pointer; z-index: 10; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    transition: all var(--transition-fast); font-family: var(--font-sans);
  }
  .jump-latest:hover { border-color: var(--accent); background: var(--card); }
  .jump-latest.hidden { display: none; }

  /* ── Error bubble ─────────────────────────────────────────────── */
  .error-bubble {
    background: var(--danger-bg); border: 1px solid rgba(244,135,113,0.3);
    color: var(--danger); padding: 8px 12px; border-radius: 8px;
    font-size: 12px; display: flex; align-items: center; gap: 8px;
    animation: msgIn 180ms ease forwards;
  }
  .error-bubble .error-text { flex: 1; }

  /* ── Account menu ─────────────────────────────────────────────── */
  .account-menu {
    position: absolute; top: 44px; right: 10px;
    background: var(--bg-elevated); border: 1px solid var(--border);
    border-radius: 8px; padding: 8px; min-width: 180px; z-index: 100;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4); animation: menuIn 120ms ease;
  }
  .account-menu.hidden { display: none; }
  .account-menu-item {
    display: flex; align-items: center; gap: 8px; padding: 6px 8px;
    border-radius: 4px; font-size: 12px; color: var(--text); cursor: pointer;
    border: none; background: none; width: 100%; text-align: left;
    font-family: var(--font-sans); transition: background var(--transition-fast);
  }
  .account-menu-item:hover { background: var(--accent-soft); }
  .account-menu-divider { height: 1px; background: var(--border); margin: 4px 0; }
  .account-email { font-size: 11px; color: var(--text-muted); padding: 4px 8px; word-break: break-all; }

  .identity-pill {
    display: flex; align-items: center; gap: 6px; padding: 4px 8px;
    border-radius: 6px; font-size: 11px; color: var(--text-muted);
    cursor: pointer; transition: background var(--transition-fast);
  }
  .identity-pill:hover { background: var(--accent-soft); }
  .identity-avatar {
    width: 20px; height: 20px; border-radius: 50%;
    background: var(--accent); color: #fff; font-size: 10px;
    display: grid; place-items: center; font-weight: 700;
  }
  .identity-name { max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .online-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--success); flex-shrink: 0; }

  /* ── Toast ────────────────────────────────────────────────────── */
  .toast {
    position: fixed; bottom: 60px; left: 50%; transform: translateX(-50%);
    padding: 6px 14px; border-radius: 6px; background: var(--success);
    color: #fff; font-size: 12px; font-weight: 600; z-index: 200;
    animation: toastIn 200ms ease, toastOut 200ms ease 1.2s forwards;
    pointer-events: none;
  }

  /* ── Action toolbar ───────────────────────────────────────────── */
  .actions-bar {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px;
    padding: 6px 10px; border-bottom: 1px solid var(--border);
    background: var(--bg-elevated); flex-shrink: 0;
  }
  .action-btn {
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 7px 2px 5px; border-radius: 8px;
    border: 1px solid transparent; background: transparent; color: var(--text-muted);
    font-size: 9.5px; font-weight: 600; cursor: pointer; text-align: center;
    font-family: var(--font-sans); transition: all var(--transition-fast);
  }
  .action-btn:hover { background: var(--accent-soft); color: var(--text); border-color: var(--border); }
  .action-btn:active { transform: scale(0.96); }
  .action-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .action-icon { font-size: 15px; line-height: 1; }
  .action-btn.busy { opacity: 0.5; pointer-events: none; }

  /* ── Context chips ────────────────────────────────────────────── */
  .chips-row {
    display: flex; align-items: center; gap: 4px;
    padding: 0 14px 6px; flex-wrap: wrap; flex-shrink: 0;
    background: var(--bg-elevated);
  }
  .chip {
    display: inline-flex; align-items: center; gap: 3px;
    padding: 2px 8px; border-radius: 10px;
    border: 1px solid var(--border); background: var(--card); color: var(--text-muted);
    font-size: 10px; font-weight: 600; cursor: pointer; user-select: none;
    font-family: var(--font-sans); transition: all var(--transition-fast);
  }
  .chip:hover { border-color: var(--accent); color: var(--text); }
  .chip.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
  .chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .chips-summary {
    font-size: 10px; color: var(--text-muted); padding-left: 2px;
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  /* ── Overlay panels (modals) ──────────────────────────────────── */
  .overlay {
    position: fixed; inset: 0; z-index: 150;
    background: rgba(0,0,0,0.55);
    display: none; align-items: stretch; justify-content: center;
  }
  .overlay.active { display: flex; }
  .panel {
    background: var(--bg-elevated); border: 1px solid var(--border);
    border-radius: 10px; margin: 12px; width: 100%; max-width: 480px;
    display: flex; flex-direction: column; overflow: hidden;
    animation: menuIn 140ms ease;
  }
  .panel-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .panel-title { font-size: 13px; font-weight: 700; }
  .panel-body { flex: 1; overflow-y: auto; padding: 12px 14px; }
  .panel-body::-webkit-scrollbar { width: 6px; }
  .panel-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  .panel-footer {
    display: flex; gap: 6px; justify-content: flex-end;
    padding: 10px 14px; border-top: 1px solid var(--border); flex-shrink: 0;
  }
  .panel-close {
    width: 26px; height: 26px; border-radius: 6px; border: none;
    background: transparent; color: var(--text-muted); cursor: pointer;
    font-size: 14px; display: grid; place-items: center;
  }
  .panel-close:hover { background: var(--accent-soft); color: var(--text); }

  /* ── Privacy preview lists ────────────────────────────────────── */
  .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px; }
  .stat-cell {
    background: var(--card); border: 1px solid var(--border); border-radius: 6px;
    padding: 6px 8px;
  }
  .stat-num { font-size: 15px; font-weight: 700; }
  .stat-label { font-size: 10px; color: var(--text-muted); }
  .stat-num.warn { color: var(--danger); }
  .privacy-note {
    background: var(--card); border: 1px dashed var(--border); border-radius: 6px;
    padding: 8px 10px; font-size: 11px; color: var(--text-muted); margin-bottom: 10px;
    line-height: 1.45;
  }
  .path-list {
    font-family: var(--font-mono); font-size: 10.5px; line-height: 1.6;
    background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
    padding: 8px 10px; max-height: 160px; overflow-y: auto; word-break: break-all;
    white-space: pre-wrap; margin-bottom: 10px; color: var(--text-muted);
  }

  /* ── Diff viewer ──────────────────────────────────────────────── */
  .diff-file { margin-bottom: 10px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .diff-file-head {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    padding: 6px 10px; background: var(--card); border-bottom: 1px solid var(--border);
    font-family: var(--font-mono); font-size: 11px;
  }
  .diff-path { flex: 1; word-break: break-all; }
  .diff-action-tag {
    font-size: 9px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;
    padding: 1px 6px; border-radius: 8px; background: var(--accent-soft); color: var(--accent);
  }
  .diff-stats-add { color: var(--success); font-weight: 700; }
  .diff-stats-del { color: var(--danger); font-weight: 700; }
  .diff-conflict {
    padding: 6px 10px; background: var(--danger-bg); color: var(--danger);
    font-size: 11px; border-bottom: 1px solid var(--border);
  }
  .diff-body {
    margin: 0; padding: 8px 0; overflow-x: auto;
    font-family: var(--font-mono); font-size: 11px; line-height: 1.5; background: var(--bg);
  }
  .diff-line { padding: 0 10px; white-space: pre-wrap; word-break: break-word; }
  .diff-line.add { background: rgba(52, 211, 153, 0.13); color: var(--success); }
  .diff-line.del { background: rgba(244, 135, 113, 0.13); color: var(--danger); }
  .diff-line.hunk { color: var(--text-muted); opacity: 0.8; }
  .diff-file pre.diff-body code { background: none; }

  /* ── Issue list / review checklist ────────────────────────────── */
  .check-group { margin-bottom: 10px; }
  .check-group-title {
    font-family: var(--font-mono); font-size: 11px; color: var(--text);
    margin-bottom: 4px; word-break: break-all;
  }
  .check-item {
    display: flex; align-items: flex-start; gap: 6px;
    padding: 5px 8px; border-radius: 6px; cursor: pointer;
    transition: background var(--transition-fast);
  }
  .check-item:hover { background: var(--card); }
  .check-item input[type="checkbox"] { accent-color: var(--accent); margin-top: 2px; flex-shrink: 0; }
  .sev { font-size: 9px; font-weight: 700; text-transform: uppercase; padding: 1px 5px; border-radius: 8px; flex-shrink: 0; margin-top: 1px; }
  .sev-error { background: var(--danger-bg); color: var(--danger); }
  .sev-warning { background: rgba(250, 204, 21, 0.15); color: #facc15; }
  .sev-info, .sev-hint { background: var(--accent-soft); color: var(--accent); }
  .issue-msg { font-size: 11px; line-height: 1.4; word-break: break-word; }
  .issue-loc { font-size: 10px; color: var(--text-muted); }

  /* ── Tool progress strip ──────────────────────────────────────── */
  .tool-strip {
    display: none; align-items: center; gap: 8px;
    padding: 6px 14px; background: var(--card); border-top: 1px solid var(--border);
    font-size: 11px; color: var(--text-muted); flex-shrink: 0;
  }
  .tool-strip.visible { display: flex; }
  .tool-strip .gen-pulse { flex-shrink: 0; }
  .tool-cancel {
    margin-left: auto; padding: 2px 8px; border-radius: 6px;
    border: 1px solid var(--border); background: transparent; color: var(--danger);
    font-size: 10px; cursor: pointer; font-family: var(--font-sans);
  }
  .tool-cancel:hover { background: var(--danger-bg); }

  @keyframes msgIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes typingBounce {
    0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
    40% { transform: translateY(-4px); opacity: 1; }
  }
  @keyframes menuIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes toastIn {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  @keyframes toastOut { from { opacity: 1; } to { opacity: 0; } }
  .hidden { display: none !important; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>`;
}

function getWelcomeScreen(): string {
  return `
  <div class="screen active" id="screenWelcome">
    <div class="auth-content">
      <div class="auth-title">Welcome to Zeus AI</div>
      <div class="auth-sub">Your AI coding companion in VS Code.</div>
      <div class="auth-actions">
        <button class="btn btn-primary" id="btnGoogle" style="width:100%">Continue with Google</button>
        <button class="btn" id="btnEmail" style="width:100%">Sign in with Email</button>
        <button class="btn" id="btnCreate" style="width:100%">Create Account</button>
      </div>
      <div class="google-hint" id="googleHint">Waiting for your browser...</div>
      <button class="btn btn-ghost" id="btnCancelGoogle" style="display:none; margin-top:8px">Cancel</button>
      <div class="hint">By continuing you agree to the Zeus AI Terms & Privacy Policy.</div>
    </div>
  </div>`;
}

function getEmailScreen(): string {
  return `
  <div class="screen" id="screenEmail">
    <div class="auth-content">
      <div class="auth-title" id="emailTitle">Sign in with Email</div>
      <div class="auth-sub" id="emailSub">We'll email you a verification code.</div>
      <input class="field" id="emailInput" type="email" placeholder="you@example.com"
             autocapitalize="off" autocorrect="off" spellcheck="false" />
      <button class="btn btn-primary" id="btnSendCode" style="width:100%; margin-bottom:8px">Send verification code</button>
      <button class="btn btn-ghost" id="btnBackEmail" style="width:100%">Back</button>
    </div>
  </div>`;
}

function getCodeScreen(): string {
  return `
  <div class="screen" id="screenCode">
    <div class="auth-content">
      <div class="auth-title">Check your email</div>
      <div class="auth-sub" id="codeSub">Enter the verification code we sent to</div>
      <input class="field code-field" id="codeInput" type="text"
             placeholder="000000" inputmode="numeric" maxlength="6" autocomplete="one-time-code" />
      <div class="hint" style="text-align:left; margin:0 0 8px">
        Or paste the full link from the email if it contains one.
      </div>
      <input class="field" id="linkInput" type="text" placeholder="or paste link from email"
             autocapitalize="off" autocorrect="off" spellcheck="false" />
      <button class="btn btn-primary" id="btnVerify" style="width:100%; margin-bottom:8px">Verify</button>
      <button class="btn btn-ghost" id="btnResend" style="width:100%; margin-bottom:4px">Resend email</button>
      <button class="btn btn-ghost" id="btnBackCode" style="width:100%">Change email</button>
    </div>
  </div>`;
}

function getChatScreen(): string {
  return `
  <div class="screen" id="screenChat">
    <div class="chat-header">
      <div class="chat-header-left">
        <div class="chat-header-title">
          <div class="chat-header-logo">&#9889;</div>
          <span class="chat-title" id="chatTitle">Zeus AI</span>
        </div>
      </div>
      <div class="chat-header-actions">
        <button class="btn btn-icon btn-ghost" id="btnNewChat" title="New Chat" aria-label="New Chat">&#x2795;</button>
        <div class="identity-pill" id="identityPill" tabindex="0" role="button" aria-label="Account menu">
          <div class="identity-avatar" id="identityAvatar">U</div>
          <span class="identity-name" id="identityName">User</span>
          <span class="online-dot"></span>
        </div>
      </div>
    </div>

    <div class="actions-bar" id="actionsBar">
      <button class="action-btn" id="actionAnalyze">
        <span class="action-icon">&#128269;</span>Analyze Project
      </button>
      <button class="action-btn" id="actionFix">
        <span class="action-icon">&#128295;</span>Fix Problems
      </button>
      <button class="action-btn" id="actionReview">
        <span class="action-icon">&#128268;</span>Review Changes
      </button>
      <button class="action-btn" id="actionTests">
        <span class="action-icon">&#129514;</span>Generate Tests
      </button>
    </div>

    <div class="account-menu hidden" id="accountMenu">
      <div class="account-email" id="accountEmail">user@example.com</div>
      <div class="account-menu-divider"></div>
      <button class="account-menu-item" id="btnAccountSignOut">Sign Out</button>
    </div>

    <div class="messages" id="messagesRegion">
      <div class="empty-state" id="emptyState">
        <div class="empty-icon">&#9889;</div>
        <div class="empty-title">Your AI Software Engineer</div>
        <div class="empty-sub">Ask anything about your code, debugging, architecture, or best practices.</div>
        <div class="starters" id="startersList">
          <button class="starter-btn" data-starter="Explain the selected code">
            <span class="starter-icon">&#128269;</span> Explain the selected code
          </button>
          <button class="starter-btn" data-starter="Find a bug in this file">
            <span class="starter-icon">&#128027;</span> Find a bug in this file
          </button>
          <button class="starter-btn" data-starter="Refactor this function">
            <span class="starter-icon">&#9881;</span> Refactor this function
          </button>
          <button class="starter-btn" data-starter="Write tests for this code">
            <span class="starter-icon">&#9989;</span> Write tests for this code
          </button>
          <button class="starter-btn" data-starter="Help me understand this project">
            <span class="starter-icon">&#128218;</span> Help me understand this project
          </button>
        </div>
      </div>
    </div>

    <button class="jump-latest hidden" id="jumpLatest" aria-label="Jump to latest message">
      Jump to latest
    </button>

    <div class="tool-strip" id="toolStrip">
      <div class="gen-pulse"></div>
      <span id="toolStripLabel">Working&hellip;</span>
      <button class="tool-cancel" id="btnToolCancel">Cancel</button>
    </div>

    <div class="composer">
      <div class="chips-row" id="chipsRow">
        <button class="chip" data-chip="activeFile" title="Attach the currently open file">&#128196; Active File</button>
        <button class="chip" data-chip="selection" title="Attach the selected code">&#9998;&#65039; Selection</button>
        <button class="chip" data-chip="projectSummary" title="Attach project facts from your last approved analysis">&#128202; Project Summary</button>
        <button class="chip" data-chip="diagnostics" title="Attach current editor problems">&#9888;&#65039; Diagnostics</button>
        <button class="chip" data-chip="gitDiff" title="Attach your uncommitted changes">&#128027; Git Diff</button>
      </div>
      <div class="chips-summary hidden" id="chipsSummary"></div>
      <div class="composer-inner">
        <textarea class="composer-input" id="composerInput" rows="1"
                  placeholder="Ask Zeus AI anything... (Shift+Enter for newline)"
                  aria-label="Message composer"></textarea>
        <button class="composer-send" id="btnSend" disabled aria-label="Send message" title="Send">&#x27A4;</button>
        <button class="btn-stop" id="btnStop" style="display:none" aria-label="Stop generation" title="Stop">&#x25A0;</button>
      </div>
      <div class="composer-hint">Zeus AI may make mistakes. Always verify critical code.</div>
    </div>
  </div>`;
}

function getOverlays(): string {
  return `
  <div class="overlay" id="overlayContext">
    <div class="panel" role="dialog" aria-label="Context preview">
      <div class="panel-header">
        <span class="panel-title">Approve context to send</span>
        <button class="panel-close" id="ctxCloseBtn" aria-label="Close">&times;</button>
      </div>
      <div class="panel-body">
        <div class="privacy-note">Nothing has been sent yet. Only the files listed below pass Zeus privacy filters. Protected files (.env, keys, credentials...) are never read or shown.</div>
        <div class="stat-grid" id="ctxStats"></div>
        <div class="path-list" id="ctxPaths"></div>
        <div style="font-size:11px;color:var(--text-muted)" id="ctxMeta"></div>
      </div>
      <div class="panel-footer">
        <button class="btn" id="btnCtxCancel">Cancel</button>
        <button class="btn btn-primary" id="btnCtxApprove">Approve &amp; Analyze</button>
      </div>
    </div>
  </div>

  <div class="overlay" id="overlayPlan">
    <div class="panel" role="dialog" aria-label="Change plan preview">
      <div class="panel-header">
        <span class="panel-title">Files Zeus will read</span>
        <button class="panel-close" id="planCloseBtn" aria-label="Close">&times;</button>
      </div>
      <div class="panel-body">
        <div class="privacy-note" id="planInstruction" style="font-style:normal;color:var(--text)"></div>
        <div class="path-list" id="planPaths" style="white-space:normal"></div>
        <div style="font-size:11px;color:var(--text-muted)" id="planNotes"></div>
      </div>
      <div class="panel-footer">
        <button class="btn" id="btnPlanCancel">Cancel</button>
        <button class="btn btn-primary" id="btnPlanApprove">Approve &amp; Run</button>
      </div>
    </div>
  </div>

  <div class="overlay" id="overlayChanges">
    <div class="panel" role="dialog" aria-label="Proposed changes">
      <div class="panel-header">
        <span class="panel-title">Review proposed changes</span>
        <button class="panel-close" id="changesCloseBtn" aria-label="Close">&times;</button>
      </div>
      <div class="panel-body" id="changesBody"></div>
      <div class="panel-footer" id="changesFooter"></div>
    </div>
  </div>

  <div class="overlay" id="overlayIssues">
    <div class="panel" role="dialog" aria-label="Editor problems">
      <div class="panel-header">
        <span class="panel-title">Editor problems</span>
        <button class="panel-close" id="issuesCloseBtn" aria-label="Close">&times;</button>
      </div>
      <div class="panel-body" id="issuesBody"></div>
      <div class="panel-footer">
        <button class="btn" id="btnIssuesCancel">Close</button>
        <button class="btn btn-primary" id="btnFixSelected">Fix Selected</button>
      </div>
    </div>
  </div>

  <div class="overlay" id="overlayReview">
    <div class="panel" role="dialog" aria-label="Select changes to review">
      <div class="panel-header">
        <span class="panel-title">Uncommitted changes</span>
        <button class="panel-close" id="reviewCloseBtn" aria-label="Close">&times;</button>
      </div>
      <div class="panel-body" id="reviewBody"></div>
      <div class="panel-footer">
        <button class="btn" id="btnReviewCancel">Cancel</button>
        <button class="btn btn-primary" id="btnReviewRun">Review Selected</button>
      </div>
    </div>
  </div>`;
}

function getScript(): string {
  return `<script>(function () {
  "use strict";
  var vscode = acquireVsCodeApi();

  var screens = {
    welcome: document.getElementById("screenWelcome"),
    email: document.getElementById("screenEmail"),
    code: document.getElementById("screenCode"),
    chat: document.getElementById("screenChat"),
  };

  function show(screen) {
    Object.keys(screens).forEach(function(key) {
      var el = screens[key];
      if (el) el.classList.toggle("active", key === screen);
    });
    // Leaving the chat screen dismisses any stray overlay panels.
    if (screen !== "chat") {
      ["overlayContext", "overlayPlan", "overlayChanges", "overlayIssues", "overlayReview"]
        .forEach(function(id) {
          var ov = document.getElementById(id);
          if (ov) ov.classList.remove("active");
        });
    }
  }

  var state = {
    authenticated: false,
    user: null,
    email: "",
    mode: "signin",
    isStreaming: false,
    streamingText: "",
    currentThreadId: null,
    showJumpBtn: false,
    accountMenuOpen: false,
    genPhase: "",
    activeChips: {},
    pendingScanId: null,
    pendingPlanId: null,
    pendingProposalId: null,
    pendingReviewId: null,
    toolBubbles: {},
    toolBuffers: {},
  };

  function showError(message) {
    var box = document.getElementById("errorBox");
    if (!box) return;
    box.textContent = message;
    box.style.display = message ? "block" : "none";
    if (message) setTimeout(function() { box.style.display = "none"; }, 4000);
  }

  function showToast(text) {
    var existing = document.querySelector(".toast");
    if (existing) existing.remove();
    var t = document.createElement("div");
    t.className = "toast";
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(function() { t.remove(); }, 1500);
  }

  function setBusy(busy) {
    ["btnGoogle", "btnEmail", "btnCreate", "btnSendCode", "btnVerify", "btnResend"]
      .forEach(function(id) { var el = document.getElementById(id); if (el) el.disabled = busy; });
  }

  function send(msg) { vscode.postMessage(msg); }

  // Surface unexpected runtime errors in the sidebar instead of failing
  // silently. Never logs message content — only the error text.
  window.addEventListener("error", function(e) {
    showError("UI error: " + (e.message || "unknown"));
    if (e.error) { try { console.error("[Zeus AI] webview error:", e.error); } catch (ex) {} }
  });
  window.addEventListener("unhandledrejection", function(e) {
    var reason = e && e.reason;
    var text = reason instanceof Error ? reason.message : String(reason || "unknown");
    showError("UI error: " + text);
    try { console.error("[Zeus AI] unhandled rejection:", reason); } catch (ex) {}
  });

  var composerInput = document.getElementById("composerInput");
  var btnSend = document.getElementById("btnSend");
  var btnStop = document.getElementById("btnStop");
  var messagesRegion = document.getElementById("messagesRegion");
  var emptyState = document.getElementById("emptyState");
  var jumpLatest = document.getElementById("jumpLatest");

  function autoResize() {
    composerInput.style.height = "auto";
    composerInput.style.height = Math.min(composerInput.scrollHeight, 120) + "px";
  }

  function updateSendButton() {
    var hasText = composerInput.value.trim().length > 0;
    btnSend.disabled = !hasText || !state.authenticated || state.isStreaming;
    btnSend.style.display = state.isStreaming ? "none" : "";
    btnStop.style.display = state.isStreaming ? "grid" : "none";
  }

  // ── Phase 3: context chips ───────────────────────────────────────
  function activeChipList() {
    return Object.keys(state.activeChips).filter(function(k) { return state.activeChips[k]; });
  }

  function updateChipsSummary() {
    var summary = document.getElementById("chipsSummary");
    if (!summary) return;
    var on = activeChipList();
    if (on.length === 0) {
      summary.classList.add("hidden");
      summary.textContent = "";
      return;
    }
    var labels = on.map(function(c) { return chipLabel(c); });
    summary.textContent = "Will attach: " + labels.join(", ");
    summary.classList.remove("hidden");
  }

  function chipLabel(chip) {
    switch (chip) {
      case "activeFile": return "Active File";
      case "selection": return "Selected Code";
      case "projectSummary": return "Project Summary";
      case "diagnostics": return "Diagnostics";
      case "gitDiff": return "Git Diff";
      default: return chip;
    }
  }

  function clearChips() {
    state.activeChips = {};
    var chips = document.querySelectorAll("#chipsRow .chip");
    for (var i = 0; i < chips.length; i++) chips[i].classList.remove("on");
    updateChipsSummary();
  }

  // ── Phase 3: overlay helpers ─────────────────────────────────────
  function openOverlay(id) { var el = document.getElementById(id); if (el) el.classList.add("active"); }
  function closeOverlay(id) { var el = document.getElementById(id); if (el) el.classList.remove("active"); }

  function setToolStrip(visible, label, cancellable) {
    var strip = document.getElementById("toolStrip");
    if (!strip) return;
    strip.classList.toggle("visible", !!visible);
    var lbl = document.getElementById("toolStripLabel");
    if (lbl && label) lbl.innerHTML = escapeHtml(label);
    var cancelBtn = document.getElementById("btnToolCancel");
    if (cancelBtn) cancelBtn.style.display = cancellable === false ? "none" : "";
  }

  function stageLabel(stage) {
    switch (stage) {
      case "scanning": return "Scanning workspace\u2026";
      case "reading": return "Preparing safe context\u2026";
      case "analyzing": return "Analyzing project\u2026";
      case "started": return "Working\u2026";
      case "stillWorking": return "Still working\u2026";
      default: return "Working\u2026";
    }
  }

  // ── Phase 3: tool-flow bubbles in the chat area ──────────────────
  function startToolBubble(flowId, caption) {
    emptyState.style.display = "none";
    var el = document.createElement("div");
    el.className = "msg msg-assistant";
    el.innerHTML =
      '<div class="msg-avatar msg-avatar-zeus">&#9889;</div>' +
      '<div class="msg-content"><div class="tool-caption" style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">' +
      escapeHtml(caption) +
      '</div><div class="tool-body"></div></div>';
    messagesRegion.appendChild(el);
    scrollToBottom();
    state.toolBubbles[flowId] = el;
    state.toolBuffers[flowId] = "";
    return el;
  }

  function appendToolChunk(flowId, delta) {
    state.toolBuffers[flowId] = (state.toolBuffers[flowId] || "") + delta;
    var wrap = state.toolBubbles[flowId];
    if (!wrap) return;
    var body = wrap.querySelector(".tool-body");
    if (body) body.innerHTML = renderMarkdown(state.toolBuffers[flowId]);
    scrollToBottom();
  }

  function finishToolBubble(flowId) {
    var wrap = state.toolBubbles[flowId];
    var buf = state.toolBuffers[flowId] || "";
    if (wrap) {
      var body = wrap.querySelector(".tool-body");
      if (body) body.innerHTML = renderMarkdown(buf);
      if (flowId === "analysis") {
        var row = document.createElement("div");
        row.style.marginTop = "8px";
        var useBtn = document.createElement("button");
        useBtn.className = "btn btn-sm";
        useBtn.textContent = "Use this project context in chat";
        useBtn.addEventListener("click", function() {
          state.activeChips.projectSummary = true;
          var chipEl = document.querySelector('#chipsRow .chip[data-chip="projectSummary"]');
          if (chipEl) chipEl.classList.add("on");
          updateChipsSummary();
          showToast("Project Summary ready \u2014 it will attach to your next message");
        });
        row.appendChild(useBtn);
        var content = wrap.querySelector(".msg-content");
        if (content) content.appendChild(row);
      }
      delete state.toolBubbles[flowId];
      delete state.toolBuffers[flowId];
    }
    setToolStrip(false);
    scrollToBottom();
  }

  function failToolFlow(flowId, message) {
    delete state.toolBubbles[flowId];
    delete state.toolBuffers[flowId];
    setToolStrip(false);
    appendErrorBubble(message);
  }

  function focusComposer() {
    setTimeout(function() { composerInput.focus(); }, 50);
  }

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function renderMarkdown(text) {
    if (!text) return "";
    var html = escapeHtml(text);
    var codeBlockRegex = /\x60\x60\x60([\\w]*)\\n([\\s\\S]*?)\x60\x60\x60/g;
    var match;
    var result = "";
    var lastIndex = 0;
    while ((match = codeBlockRegex.exec(html)) !== null) {
      result += html.substring(lastIndex, match.index);
      var lang = match[1] || "plaintext";
      var code = match[2];
      var blockId = "cb-" + Math.random().toString(36).slice(2, 8);
      result += '<div class="code-block"><div class="code-header"><span>' + lang + '</span>';
      result += '<button class="code-copy-btn" data-code-id="' + blockId + '">Copy</button></div>';
      result += '<pre id="' + blockId + '"><code>' + code + '</code></pre></div>';
      lastIndex = match.index + match[0].length;
    }
    result += html.substring(lastIndex);
    html = result;
    html = html.replace(/\x60([^\x60]+)\x60/g, "<code>$1</code>");
    html = html.replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>");
    html = html.replace(/\\*([^*]+)\\*/g, "<em>$1</em>");
    html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
    html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>.*<\\/li>\\n?)+/g, "<ul>$&</ul>");
    html = html.replace(/\\n\\n/g, "</p><p>");
    html = "<p>" + html + "</p>";
    html = html.replace(/\\n/g, "<br>");
    return html;
  }

  function formatTime() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function scrollToBottom() {
    messagesRegion.scrollTop = messagesRegion.scrollHeight;
    state.showJumpBtn = false;
    jumpLatest.classList.add("hidden");
  }

  function appendUserMessage(text) {
    emptyState.style.display = "none";
    var msg = document.createElement("div");
    msg.className = "msg msg-user";
    msg.innerHTML = '<div class="msg-content"><div>' + escapeHtml(text) + '</div><div class="msg-time">' + formatTime() + '</div></div>';
    messagesRegion.appendChild(msg);
    scrollToBottom();
  }

  var streamingMsgEl = null;
  var streamingTextContent = "";

  function updateGenPhase(chunksReceived) {
    if (chunksReceived === 0) return "Thinking";
    if (chunksReceived < 8) return "Writing";
    return "Finishing";
  }

  var chunkCount = 0;

  function showTypingIndicator() {
    emptyState.style.display = "none";
    chunkCount = 0;
    streamingMsgEl = document.createElement("div");
    streamingMsgEl.className = "msg msg-assistant";
    streamingMsgEl.innerHTML = '<div class="msg-avatar msg-avatar-zeus">&#9889;</div><div class="msg-content"><div class="gen-indicator"><div class="gen-pulse"></div><span class="gen-label">Thinking&hellip;</span></div></div>';
    messagesRegion.appendChild(streamingMsgEl);
    scrollToBottom();
  }

  function updateStreamingMessage(delta) {
    if (!streamingMsgEl) return;
    streamingTextContent += delta;
    chunkCount++;
    var contentDiv = streamingMsgEl.querySelector(".msg-content");
    if (contentDiv) {
      var phase = updateGenPhase(chunkCount);
      contentDiv.innerHTML = renderMarkdown(streamingTextContent) + '<div class="gen-indicator"><div class="gen-pulse"></div><span class="gen-label">' + phase + '&hellip;</span></div><div class="msg-time">' + formatTime() + '</div>';
    }
    if (!state.showJumpBtn) scrollToBottom();
  }

  function finishStreamingMessage(fullText) {
    if (!streamingMsgEl) return;
    var contentDiv = streamingMsgEl.querySelector(".msg-content");
    if (contentDiv) {
      var rendered = fullText || streamingTextContent;
      contentDiv.innerHTML = renderMarkdown(rendered) + '<div class="msg-time">' + formatTime() + '</div>';
    }
    streamingMsgEl = null;
    streamingTextContent = "";
    chunkCount = 0;
    state.isStreaming = false;
    state.genPhase = "";
    updateSendButton();
    scrollToBottom();
    focusComposer();
  }

  function removeStreamingMessage() {
    if (streamingMsgEl) { streamingMsgEl.remove(); streamingMsgEl = null; }
    streamingTextContent = "";
    chunkCount = 0;
  }

  function appendErrorBubble(message) {
    var el = document.createElement("div");
    el.className = "error-bubble";
    el.innerHTML = '<span class="error-text">' + escapeHtml(message) + '</span><button class="btn btn-sm btn-danger">Retry</button>';
    messagesRegion.appendChild(el);
    scrollToBottom();
  }

  messagesRegion.addEventListener("scroll", function() {
    var distFromBottom = messagesRegion.scrollHeight - messagesRegion.scrollTop - messagesRegion.clientHeight;
    state.showJumpBtn = distFromBottom > 120;
    jumpLatest.classList.toggle("hidden", !state.showJumpBtn);
  }, { passive: true });

  jumpLatest.addEventListener("click", scrollToBottom);

  messagesRegion.addEventListener("click", function(e) {
    var copyBtn = e.target.closest(".code-copy-btn");
    if (copyBtn) {
      var codeId = copyBtn.getAttribute("data-code-id");
      var codeEl = document.getElementById(codeId);
      if (codeEl) {
        function fallbackCopy(text) {
          var ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
        function doCopy() {
          copyBtn.textContent = "Copied!";
          copyBtn.classList.add("copied");
          showToast("Copied to clipboard");
          setTimeout(function() { copyBtn.textContent = "Copy"; copyBtn.classList.remove("copied"); }, 1500);
        }
        try {
          if (navigator.clipboard) {
            navigator.clipboard.writeText(codeEl.textContent || "").then(doCopy).catch(function() { fallbackCopy(codeEl.textContent || ""); doCopy(); });
          } else {
            fallbackCopy(codeEl.textContent || "");
            doCopy();
          }
        } catch(ex) {
          fallbackCopy(codeEl.textContent || "");
          doCopy();
        }
      }
      return;
    }
    var retryBtn = e.target.closest(".error-bubble .btn-danger");
    if (retryBtn) {
      send({ type: "retryLastMessage", threadId: state.currentThreadId });
    }
  });

  composerInput.addEventListener("input", function() { autoResize(); updateSendButton(); });
  composerInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });
  btnSend.addEventListener("click", handleSend);
  btnStop.addEventListener("click", function() {
    send({ type: "chatStop" });
  });

  function handleSend() {
    var text = composerInput.value.trim();
    if (!text || !state.authenticated || state.isStreaming) return;
    appendUserMessage(text);
    composerInput.value = "";
    autoResize();
    state.isStreaming = true;
    updateSendButton();
    showTypingIndicator();
    var chips = activeChipList();
    clearChips();
    send({ type: "chatSend", text: text, threadId: state.currentThreadId, contextChips: chips });
  }

  // ── Phase 3 wiring: actions bar, chips ───────────────────────────
  document.getElementById("actionAnalyze").addEventListener("click", function() {
    send({ type: "analyzeStart" });
  });
  document.getElementById("actionFix").addEventListener("click", function() {
    send({ type: "diagCollect" });
  });
  document.getElementById("actionReview").addEventListener("click", function() {
    send({ type: "gitReviewStart" });
  });
  document.getElementById("actionTests").addEventListener("click", function() {
    send({ type: "testGenStart" });
  });

  document.getElementById("chipsRow").addEventListener("click", function(e) {
    var chip = e.target.closest(".chip");
    if (!chip) return;
    var key = chip.getAttribute("data-chip");
    state.activeChips[key] = !state.activeChips[key];
    chip.classList.toggle("on", !!state.activeChips[key]);
    updateChipsSummary();
  });

  // ── Phase 3 wiring: context preview modal ────────────────────────
  function renderContextPreview(msg) {
    state.pendingScanId = msg.scanId;
    var stats = document.getElementById("ctxStats");
    stats.innerHTML = "";
    function stat(num, label, warn) {
      var cell = document.createElement("div");
      cell.className = "stat-cell";
      var n = document.createElement("div");
      n.className = "stat-num" + (warn ? " warn" : "");
      n.textContent = String(num);
      var l = document.createElement("div");
      l.className = "stat-label";
      l.textContent = label;
      cell.appendChild(n); cell.appendChild(l);
      stats.appendChild(cell);
    }
    stat(msg.counts.included, "files will be included");
    stat(msg.counts.sensitiveBlocked, "protected files blocked", msg.counts.sensitiveBlocked > 0);
    stat(msg.counts.ignored, "git-ignored files skipped");
    stat(msg.estimatedKB + " KB", "approx. context size");
    var paths = document.getElementById("ctxPaths");
    paths.textContent = (msg.samplePaths || []).join("\\n") || "(no includeable files)";
    var meta = document.getElementById("ctxMeta");
    meta.textContent =
      "Workspace: " + msg.workspaceName +
      (msg.truncated ? " \u00b7 list truncated by limits (" + msg.limits.maxFiles + " files / " + msg.limits.maxTotalKB + " KB)" : "") +
      " \u00b7 gitignore: " + (msg.respectGitignore ? "on" : "off");
    openOverlay("overlayContext");
  }

  document.getElementById("btnCtxApprove").addEventListener("click", function() {
    if (!state.pendingScanId) return;
    closeOverlay("overlayContext");
    startToolBubble("analysis", "Zeus \u00b7 Project Analysis");
    setToolStrip(true, stageLabel("reading"));
    send({ type: "contextApprove", scanId: state.pendingScanId });
    state.pendingScanId = null;
  });
  function cancelContextPreview() {
    if (state.pendingScanId) {
      send({ type: "contextCancel", scanId: state.pendingScanId });
      state.pendingScanId = null;
    }
    closeOverlay("overlayContext");
  }
  document.getElementById("btnCtxCancel").addEventListener("click", cancelContextPreview);
  document.getElementById("ctxCloseBtn").addEventListener("click", cancelContextPreview);

  // ── Phase 3 wiring: plan preview modal ───────────────────────────
  function renderPlanPreview(msg) {
    state.pendingPlanId = msg.planId;
    document.getElementById("planInstruction").textContent = msg.instruction;
    var list = document.getElementById("planPaths");
    list.textContent = "";
    if (!msg.files || msg.files.length === 0) {
      var none = document.createElement("div");
      none.textContent = "No existing files need to be read.";
      list.appendChild(none);
    } else {
      msg.files.forEach(function(f) {
        var row = document.createElement("div");
        row.textContent = "\u2022 " + f.path;
        list.appendChild(row);
      });
    }
    var notes = document.getElementById("planNotes");
    notes.textContent = "";
    (msg.notes || []).forEach(function(n) {
      var line = document.createElement("div");
      line.textContent = "\u2022 " + n;
      notes.appendChild(line);
    });
    if ((msg.attachmentLabels || []).length > 0) {
      var att = document.createElement("div");
      att.textContent = "\\u2022 Attached context: " + msg.attachmentLabels.join(", ");
      notes.appendChild(att);
    }
    openOverlay("overlayPlan");
  }

  document.getElementById("btnPlanApprove").addEventListener("click", function() {
    if (!state.pendingPlanId) return;
    closeOverlay("overlayPlan");
    setToolStrip(true, "Preparing your changes\u2026");
    send({ type: "editScopeApprove", planId: state.pendingPlanId });
    state.pendingPlanId = null;
  });
  function cancelPlanPreview() {
    if (state.pendingPlanId) {
      send({ type: "editScopeCancel", planId: state.pendingPlanId });
      state.pendingPlanId = null;
    }
    closeOverlay("overlayPlan");
  }
  document.getElementById("btnPlanCancel").addEventListener("click", cancelPlanPreview);
  document.getElementById("planCloseBtn").addEventListener("click", cancelPlanPreview);

  // ── Phase 3 wiring: changes review modal ─────────────────────────
  function diffLineClass(line) {
    if (line.charAt(0) === "+") return "add";
    if (line.charAt(0) === "-") return "del";
    if (line.slice(0, 2) === "@@") return "hunk";
    return "";
  }

  function renderChangesProposed(msg) {
    state.pendingProposalId = msg.proposalId;
    setToolStrip(false);
    var body = document.getElementById("changesBody");
    body.textContent = "";

    var head = document.createElement("div");
    head.style.marginBottom = "10px";
    var summaryText = msg.summary || "Proposed changes";
    if (msg.note) summaryText += " \\u2014 " + msg.note;
    head.textContent = summaryText;
    head.style.fontWeight = "600";
    body.appendChild(head);

    if (msg.conflicts > 0) {
      var warn = document.createElement("div");
      warn.className = "privacy-note";
      warn.style.borderColor = "var(--danger)";
      warn.style.color = "var(--danger)";
      warn.textContent = msg.conflicts + " item(s) could not be verified and will NOT be applied.";
      body.appendChild(warn);
    }

    var anyApplicable = false;
    (msg.files || []).forEach(function(f) {
      var box = document.createElement("div");
      box.className = "diff-file";
      var fileHead = document.createElement("div");
      fileHead.className = "diff-file-head";
      var tag = document.createElement("span");
      tag.className = "diff-action-tag";
      tag.textContent = f.action === "create" ? "New file" : "Modified";
      var pth = document.createElement("span");
      pth.className = "diff-path";
      pth.textContent = f.path;
      var plus = document.createElement("span");
      plus.className = "diff-stats-add";
      plus.textContent = "+" + f.additions;
      var minus = document.createElement("span");
      minus.className = "diff-stats-del";
      minus.textContent = "\u2212" + f.deletions;
      fileHead.appendChild(tag); fileHead.appendChild(pth);
      fileHead.appendChild(plus); fileHead.appendChild(minus);
      box.appendChild(fileHead);
      if (f.conflicted) {
        var cf = document.createElement("div");
        cf.className = "diff-conflict";
        cf.textContent = f.conflicted;
        box.appendChild(cf);
      } else {
        anyApplicable = true;
        var pre = document.createElement("pre");
        pre.className = "diff-body";
        var code = document.createElement("code");
        (f.diff || "").split("\\n").forEach(function(line) {
          var div = document.createElement("div");
          div.className = "diff-line " + diffLineClass(line);
          div.textContent = line.length > 0 ? line : " ";
          code.appendChild(div);
        });
        pre.appendChild(code);
        box.appendChild(pre);
      }
      body.appendChild(box);
    });

    var footer = document.getElementById("changesFooter");
    footer.textContent = "";
    var rejectBtn = document.createElement("button");
    rejectBtn.className = "btn btn-danger";
    rejectBtn.textContent = "Reject";
    rejectBtn.addEventListener("click", function() {
      if (state.pendingProposalId) send({ type: "changesReject", proposalId: state.pendingProposalId });
      closeOverlay("overlayChanges");
      state.pendingProposalId = null;
    });
    footer.appendChild(rejectBtn);
    if (anyApplicable) {
      var applyBtn = document.createElement("button");
      applyBtn.className = "btn btn-primary";
      applyBtn.textContent = "Apply changes";
      applyBtn.addEventListener("click", function() {
        if (!state.pendingProposalId) return;
        applyBtn.disabled = true;
        send({ type: "changesApprove", proposalId: state.pendingProposalId });
      });
      footer.appendChild(applyBtn);
    } else {
      var nothing = document.createElement("span");
      nothing.style.cssText = "font-size:11px;color:var(--text-muted);align-self:center";
      nothing.textContent = "No applicable changes.";
      footer.appendChild(nothing);
    }
    openOverlay("overlayChanges");
  }

  function renderChangesApplied(msg) {
    var body = document.getElementById("changesBody");
    body.textContent = "";
    var title = document.createElement("div");
    title.style.fontWeight = "600";
    title.style.marginBottom = "8px";
    title.textContent = "Changes applied (single undo step in VS Code)";
    body.appendChild(title);

    var ul = document.createElement("ul");
    ul.style.paddingLeft = "18px";
    (msg.results || []).forEach(function(r) {
      var li = document.createElement("li");
      li.style.fontSize = "12px";
      li.style.marginBottom = "4px";
      var label = r.path + " \u2014 ";
      if (r.status === "applied" || r.status === "created") label += "applied";
      else if (r.status === "skipped-drift") label += "skipped: " + (r.detail || "file changed since preview");
      else label += "not applied: " + (r.detail || r.status);
      li.textContent = label;
      if (r.status !== "applied" && r.status !== "created") li.style.color = "var(--danger)";
      ul.appendChild(li);
    });
    body.appendChild(ul);

    var footer = document.getElementById("changesFooter");
    footer.textContent = "";
    (msg.validation || []).forEach(function(cmd) {
      var runBtn = document.createElement("button");
      runBtn.className = "btn btn-sm";
      runBtn.textContent = "Run: " + cmd;
      runBtn.addEventListener("click", function() { send({ type: "runValidationCommand", command: cmd }); });
      footer.appendChild(runBtn);
    });
    var done = document.createElement("button");
    done.className = "btn btn-primary";
    done.textContent = "Done";
    done.addEventListener("click", function() {
      closeOverlay("overlayChanges");
      state.pendingProposalId = null;
    });
    footer.appendChild(done);
    showToast("Changes applied");
  }

  // ── Phase 3 wiring: issues modal ─────────────────────────────────
  function renderIssuesList(msg) {
    var body = document.getElementById("issuesBody");
    body.textContent = "";
    if ((!msg.groups || msg.groups.length === 0)) {
      var empty = document.createElement("div");
      empty.style.color = "var(--text-muted)";
      empty.textContent = "No problems found in includeable files.";
      body.appendChild(empty);
      return;
    }
    msg.groups.forEach(function(group) {
      var g = document.createElement("div");
      g.className = "check-group";
      var gt = document.createElement("div");
      gt.className = "check-group-title";
      gt.textContent = group.path;
      g.appendChild(gt);
      (group.issues || []).forEach(function(iss) {
        var labelEl = document.createElement("label");
        labelEl.className = "check-item";
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.setAttribute("data-issue-key", iss.id);
        var sev = document.createElement("span");
        sev.className = "sev sev-" + iss.severityLabel;
        sev.textContent = iss.severityLabel;
        var txt = document.createElement("span");
        txt.className = "issue-msg";
        txt.textContent = iss.message + " (line " + iss.line + ")";
        labelEl.appendChild(cb); labelEl.appendChild(sev); labelEl.appendChild(txt);
        g.appendChild(labelEl);
      });
      body.appendChild(g);
    });
    if (msg.blockedFileCount > 0) {
      var note = document.createElement("div");
      note.className = "privacy-note";
      note.textContent = msg.blockedFileCount + " privacy-protected file(s) with problems were excluded entirely.";
      body.appendChild(note);
    }
    openOverlay("overlayIssues");
  }

  document.getElementById("btnFixSelected").addEventListener("click", function() {
    var keys = [];
    document.querySelectorAll("#issuesBody input[data-issue-key]:checked").forEach(function(cb) {
      keys.push(cb.getAttribute("data-issue-key"));
    });
    closeOverlay("overlayIssues");
    if (keys.length === 0) return;
    setToolStrip(true, "Planning fixes\u2026");
    send({ type: "diagFixSelected", keys: keys });
  });
  document.getElementById("btnIssuesCancel").addEventListener("click", function() {
    closeOverlay("overlayIssues");
  });
  document.getElementById("issuesCloseBtn").addEventListener("click", function() {
    closeOverlay("overlayIssues");
  });

  // ── Phase 3 wiring: git review modal ─────────────────────────────
  function renderReviewFiles(msg) {
    state.pendingReviewId = msg.approvalId;
    var body = document.getElementById("reviewBody");
    body.textContent = "";
    (msg.files || []).forEach(function(f) {
      var labelEl = document.createElement("label");
      labelEl.className = "check-item";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.setAttribute("data-review-path", f.path);
      var txt = document.createElement("span");
      txt.className = "issue-msg";
      txt.style.fontFamily = "var(--font-mono)";
      txt.textContent = f.path + " (" + f.status + ")";
      labelEl.appendChild(cb); labelEl.appendChild(txt);
      body.appendChild(labelEl);
    });
    if (msg.protectedSkipped > 0) {
      var note = document.createElement("div");
      note.className = "privacy-note";
      note.textContent = msg.protectedSkipped + " privacy-protected file(s) are excluded from review.";
      body.appendChild(note);
    }
    openOverlay("overlayReview");
  }

  document.getElementById("btnReviewRun").addEventListener("click", function() {
    var paths = [];
    document.querySelectorAll("#reviewBody input[data-review-path]:checked").forEach(function(cb) {
      paths.push(cb.getAttribute("data-review-path"));
    });
    closeOverlay("overlayReview");
    if (paths.length === 0 || !state.pendingReviewId) return;
    startToolBubble("gitReview", "Zeus \u00b7 Change Review");
    setToolStrip(true, "Reviewing your changes\u2026");
    send({ type: "gitReviewSelected", approvalId: state.pendingReviewId, paths: paths });
    state.pendingReviewId = null;
  });
  function cancelReviewModal() {
    if (state.pendingReviewId) {
      send({ type: "gitReviewCancel", approvalId: state.pendingReviewId });
      state.pendingReviewId = null;
    }
    closeOverlay("overlayReview");
  }
  document.getElementById("btnReviewCancel").addEventListener("click", cancelReviewModal);
  document.getElementById("reviewCloseBtn").addEventListener("click", cancelReviewModal);

  document.getElementById("btnToolCancel").addEventListener("click", function() {
    send({ type: "chatStop" });
  });

  document.getElementById("startersList").addEventListener("click", function(e) {
    var btn = e.target.closest(".starter-btn");
    if (!btn) return;
    var text = btn.getAttribute("data-starter");
    if (text) { composerInput.value = text; autoResize(); updateSendButton(); focusComposer(); }
  });

  var identityPill = document.getElementById("identityPill");
  var accountMenu = document.getElementById("accountMenu");

  identityPill.addEventListener("click", function() {
    state.accountMenuOpen = !state.accountMenuOpen;
    accountMenu.classList.toggle("hidden", !state.accountMenuOpen);
  });

  document.addEventListener("click", function(e) {
    if (!identityPill.contains(e.target) && !accountMenu.contains(e.target)) {
      state.accountMenuOpen = false;
      accountMenu.classList.add("hidden");
    }
  });

  document.getElementById("btnAccountSignOut").addEventListener("click", function() {
    state.accountMenuOpen = false;
    accountMenu.classList.add("hidden");
    send({ type: "signOut" });
  });

  document.getElementById("btnNewChat").addEventListener("click", function() {
    if (state.isStreaming) {
      if (!confirm("A response is still generating. Start a new chat?")) return;
      send({ type: "chatStop" });
    }
    messagesRegion.innerHTML = "";
    messagesRegion.appendChild(emptyState);
    emptyState.style.display = "";
    streamingMsgEl = null;
    streamingTextContent = "";
    chunkCount = 0;
    state.isStreaming = false;
    state.currentThreadId = null;
    state.showJumpBtn = false;
    jumpLatest.classList.add("hidden");
    updateSendButton();
    send({ type: "newChat" });
    focusComposer();
    showToast("New chat started");
  });

  document.getElementById("btnGoogle").addEventListener("click", function() {
    console.log("[Zeus AI] Google button clicked");
    showError(""); setBusy(true);
    document.getElementById("googleHint").style.display = "block";
    document.getElementById("btnCancelGoogle").style.display = "block";
    send({ type: "signInGoogle" });
  });

  document.getElementById("btnCancelGoogle").addEventListener("click", function() {
    setBusy(false);
    document.getElementById("googleHint").style.display = "none";
    document.getElementById("btnCancelGoogle").style.display = "none";
    showError("Sign-in cancelled.");
    send({ type: "cancelSignIn" });
  });

  document.getElementById("btnEmail").addEventListener("click", function() {
    state.mode = "signin";
    document.getElementById("emailTitle").textContent = "Sign in with Email";
    document.getElementById("emailSub").textContent = "We'll email you a verification code.";
    document.getElementById("emailInput").value = "";
    showError(""); show("email"); document.getElementById("emailInput").focus();
  });

  document.getElementById("btnCreate").addEventListener("click", function() {
    state.mode = "create";
    document.getElementById("emailTitle").textContent = "Create your account";
    document.getElementById("emailSub").textContent = "We'll email you a verification code.";
    document.getElementById("emailInput").value = "";
    showError(""); show("email"); document.getElementById("emailInput").focus();
  });

  document.getElementById("btnSendCode").addEventListener("click", function() {
    var email = document.getElementById("emailInput").value.trim();
    if (!email) { showError("Please enter your email address."); return; }
    showError(""); setBusy(true); state.email = email;
    send({ type: "sendCode", email: email, mode: state.mode });
  });

  document.getElementById("btnVerify").addEventListener("click", verify);
  document.getElementById("codeInput").addEventListener("keydown", function(e) { if (e.key === "Enter") verify(); });
  document.getElementById("linkInput").addEventListener("keydown", function(e) { if (e.key === "Enter") verify(); });
  document.getElementById("codeInput").addEventListener("input", function(e) {
    e.target.value = e.target.value.replace(/[^0-9]/g, "").slice(0, 6);
  });

  function verify() {
    var code = document.getElementById("codeInput").value.trim();
    var link = document.getElementById("linkInput").value.trim();
    var token = link || code;
    if (!token) { showError("Enter the 6-digit code or paste the link from the email."); return; }
    showError(""); setBusy(true);
    send({ type: "verifyCode", email: state.email, code: token });
  }

  document.getElementById("btnResend").addEventListener("click", function() {
    if (!state.email) return;
    showError(""); setBusy(true);
    send({ type: "sendCode", email: state.email, mode: state.mode });
  });

  document.getElementById("btnBackEmail").addEventListener("click", function() { showError(""); show("welcome"); });
  document.getElementById("btnBackCode").addEventListener("click", function() { showError(""); show("email"); });

  window.addEventListener("message", function(event) {
    var msg = event.data || {};
    switch (msg.type) {
      case "authState":
        state.authenticated = !!msg.authenticated;
        state.user = msg.user || null;
        setBusy(false);
        document.getElementById("googleHint").style.display = "none";
        document.getElementById("btnCancelGoogle").style.display = "none";
        if (state.authenticated) {
          var name = state.user && (state.user.name || state.user.email);
          var initial = (name || "U").charAt(0).toUpperCase();
          document.getElementById("identityAvatar").textContent = initial;
          document.getElementById("identityName").textContent = name || "User";
          document.getElementById("accountEmail").textContent = state.user ? state.user.email || "" : "";
          show("chat"); focusComposer();
        } else {
          show("welcome");
        }
        break;
      case "emailSent":
        setBusy(false);
        if (msg.ok) {
          document.getElementById("codeSub").textContent = "Enter the verification code we sent to " + (state.email || "") + ".";
          document.getElementById("codeInput").value = "";
          document.getElementById("linkInput").value = "";
          show("code"); document.getElementById("codeInput").focus();
        } else { showError(msg.message || "Could not send the verification code."); show("email"); }
        break;
      case "busy": setBusy(!!msg.busy); break;
      case "error": setBusy(false); showError(msg.message || "Something went wrong."); break;
      case "chatStart":
        state.isStreaming = true;
        streamingTextContent = "";
        chunkCount = 0;
        state.currentThreadId = msg.threadId || state.currentThreadId;
        updateSendButton();
        break;
      case "chatChunk": updateStreamingMessage(msg.textDelta || ""); break;
      case "chatStillWorking":
        if (state.isStreaming && streamingMsgEl) {
          var lbl = streamingMsgEl.querySelector(".gen-label");
          if (lbl) lbl.textContent = "Still working\u2026";
        }
        break;
      case "chatDone":
        finishStreamingMessage(msg.fullText || "");
        showToast("Response complete");
        break;
      case "chatError":
        removeStreamingMessage();
        state.isStreaming = false;
        updateSendButton();
        appendErrorBubble(msg.message || "Something went wrong.");
        focusComposer();
        break;
      case "chatAborted":
        finishStreamingMessage(msg.partialText || streamingTextContent);
        showToast("Generation stopped");
        break;
      case "threadCreated":
        state.currentThreadId = msg.threadId;
        if (msg.title && msg.title !== "New conversation") {
          document.getElementById("chatTitle").textContent = msg.title;
        }
        break;
      case "messagesLoaded":
        messagesRegion.innerHTML = "";
        if (msg.messages && msg.messages.length > 0) {
          emptyState.style.display = "none";
          msg.messages.forEach(function(m) {
            if (m.role === "user") {
              appendUserMessage(m.text);
            } else {
              var el = document.createElement("div");
              el.className = "msg msg-assistant";
              el.innerHTML = '<div class="msg-avatar msg-avatar-zeus">&#9889;</div><div class="msg-content">' + renderMarkdown(m.text) + '</div>';
              messagesRegion.appendChild(el);
            }
          });
          scrollToBottom();
        } else {
          messagesRegion.appendChild(emptyState);
          emptyState.style.display = "";
        }
        break;

      // ── Phase 3: project intelligence flows ───────────────────────
      case "contextAttached":
        if (msg.labels && msg.labels.length > 0) {
          showToast("Attached: " + msg.labels.join(", "));
        }
        break;
      case "contextPreview":
        renderContextPreview(msg);
        break;
      case "analysisStage":
        setToolStrip(true, stageLabel(msg.stage));
        break;
      case "analysisClosed":
        closeOverlay("overlayContext");
        setToolStrip(false);
        break;
      case "analysisError":
        delete state.toolBubbles.analysis;
        delete state.toolBuffers.analysis;
        setToolStrip(false);
        appendErrorBubble(msg.message || "Analysis failed.");
        break;
      case "analysisDone":
        finishToolBubble("analysis");
        break;

      case "editPlanPreview":
        renderPlanPreview(msg);
        break;
      case "editPlanClosed":
        closeOverlay("overlayPlan");
        setToolStrip(false);
        break;

      case "changesProposed":
        renderChangesProposed(msg);
        break;
      case "changesApplied":
        renderChangesApplied(msg);
        break;
      case "changesClosed":
        closeOverlay("overlayChanges");
        state.pendingProposalId = null;
        break;

      case "issuesList":
        renderIssuesList(msg);
        break;

      case "reviewFilesPreview":
        renderReviewFiles(msg);
        break;
      case "reviewUnavailable":
        showError(msg.message || "Nothing to review.");
        break;
      case "reviewCancelled":
        closeOverlay("overlayReview");
        break;

      // ── Phase 3: tool-flow streaming ────────────────────────────
      case "toolStatus":
        if (msg.flowId !== "edits") setToolStrip(true, stageLabel(msg.stage));
        break;
      case "toolChunk":
        if (msg.flowId === "analysis" || msg.flowId === "gitReview") {
          if (!state.toolBubbles[msg.flowId]) {
            startToolBubble(msg.flowId, msg.flowId === "analysis" ? "Zeus \u00b7 Project Analysis" : "Zeus \u00b7 Change Review");
          }
          appendToolChunk(msg.flowId, msg.textDelta || "");
          if (msg.flowId !== "edits") setToolStrip(true, stageLabel("started"));
        } else if (msg.flowId === "edits") {
          setToolStrip(true, "Preparing your changes\u2026");
        }
        break;
      case "toolDone":
        if (msg.flowId === "analysis") { finishToolBubble("analysis"); }
        else if (msg.flowId === "gitReview") { finishToolBubble("gitReview"); }
        else { setToolStrip(false); }
        break;
      case "toolError":
        ["overlayContext", "overlayPlan", "overlayChanges", "overlayIssues", "overlayReview"].forEach(function(id) { closeOverlay(id); });
        failToolFlow(msg.flowId || "unknown", (msg.message || "Action failed.") + (msg.cancelled ? "" : ""));
        break;
    }
  });

  // ── Startup diagnostic: proves the script parsed & executed ──────
  console.log("[Zeus AI] webview initialized");
  send({ type: "webviewReady" });

  send({ type: "getState" });
  updateSendButton();
})();</script>`;
}
