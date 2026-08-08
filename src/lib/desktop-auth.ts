import type { Session } from "@supabase/supabase-js";

/**
 * Typed bridge to the Electron desktop shell (exposed by the preload as
 * `window.zeusDesktop`). On the web this API does not exist and every
 * accessor safely returns null, so importing this module is harmless for
 * the normal web build — the desktop flow only activates inside Electron.
 */

export interface DesktopAuthResult {
  /** Supabase session object on success (has access_token). */
  access_token?: string;
  /** Present on failure. */
  error?: string;
  [key: string]: unknown;
}

export interface DesktopAuthBridge {
  startGoogleOAuth(): Promise<{ ok?: boolean; error?: string }>;
  getPendingSession(): Promise<DesktopAuthResult | null>;
  onSessionReady(callback: (result: DesktopAuthResult) => void): () => void;
  clearPendingSession(): Promise<void>;
}

declare global {
  interface Window {
    zeusDesktop?: {
      version: string;
      platform: string;
      isDesktop: boolean;
      auth?: DesktopAuthBridge;
    };
  }
}

export function getDesktopAuthBridge(): DesktopAuthBridge | null {
  if (typeof window === "undefined") return null;
  return window.zeusDesktop?.auth ?? null;
}

export function isDesktopShell(): boolean {
  return typeof window !== "undefined" && Boolean(window.zeusDesktop?.isDesktop);
}

export function isSessionResult(result: unknown): result is Session {
  return Boolean(
    result &&
    typeof result === "object" &&
    typeof (result as { access_token?: unknown }).access_token === "string",
  );
}
