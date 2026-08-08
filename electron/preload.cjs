// Preload — exposes a minimal desktop API to the renderer.
// CommonJS on purpose: sandboxed preloads cannot use ESM, and keeping the
// renderer sandboxed (default) is safer. The web app does not require this
// API; it exists so the renderer can detect the desktop shell and run the
// professional desktop OAuth flow (system browser + zeusai:// deep link).

const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("zeusDesktop", {
  version: "1.5",
  platform: process.platform,
  isDesktop: true,

  auth: {
    // Open the system browser for Google sign-in. Resolves { ok: true } once
    // the browser has been launched; the session arrives later via
    // onSessionReady (or getPendingSession after a cold-start deep link).
    startGoogleOAuth: () => ipcRenderer.invoke("zeus-desktop:oauth:start-google"),

    // Pull a session that finished exchanging before the window existed.
    getPendingSession: () => ipcRenderer.invoke("zeus-desktop:oauth:get-session"),

    // Tell the main process a sign-out happened so a stashed session is
    // invalidated and can't be re-applied on a later visit to /auth.
    clearPendingSession: () => ipcRenderer.invoke("zeus-desktop:oauth:clear-session"),

    // Subscribe to the auth result: a Supabase session object on success,
    // or { error: string } on failure. Returns an unsubscribe function.
    onSessionReady: (callback) => subscribe("zeus-desktop:auth-session", callback),
  },
});
