import * as vscode from "vscode";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "../config";

/**
 * Session storage for the Zeus AI extension.
 *
 * The Supabase session (access token + refresh token + user) is stored ONLY
 * in VS Code SecretStorage (Electron safeStorage-encrypted at rest). It is
 * never written to workspaceState, globalState, settings, files, or logs.
 *
 * Tokens are never logged. Only the user's email/name are surfaced to the UI.
 */

const SESSION_KEY = "zeus.auth.session.v1";
/** Refresh the access token when fewer than this many ms remain. */
const REFRESH_SKEW_MS = 60_000;

let secrets: vscode.SecretStorage | null = null;

export function initSessionStorage(storage: vscode.SecretStorage): void {
  secrets = storage;
}

function requireSecrets(): vscode.SecretStorage {
  if (!secrets) throw new Error("Session storage not initialized");
  return secrets;
}

/**
 * Create a Supabase client for auth operations. PKCE flow, no persistence —
 * the extension owns session persistence via SecretStorage.
 */
export function createAuthClient(): SupabaseClient {
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: "pkce",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/** Load the stored session, or null when absent/parseable. */
export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await requireSecrets().get(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (!parsed.access_token || !parsed.refresh_token) return null;
    return parsed as Session;
  } catch {
    // Corrupt/missing secret — treat as signed out.
    return null;
  }
}

/** Persist a session (or delete when null) in SecretStorage. */
export async function saveSession(session: Session | null): Promise<void> {
  const store = requireSecrets();
  if (!session) {
    await store.delete(SESSION_KEY);
    return;
  }
  await store.store(SESSION_KEY, JSON.stringify(session));
}

/** Sign out: delete the stored session. */
export async function clearSession(): Promise<void> {
  await requireSecrets().delete(SESSION_KEY);
}

/** Whether a usable session exists (no network call). */
export async function isAuthenticated(): Promise<boolean> {
  return (await loadSession()) !== null;
}

/** Safe, loggable user identity — email + display name only, never tokens. */
export async function getUserIdentity(): Promise<{ email: string; name: string } | null> {
  const session = await loadSession();
  const email = session?.user?.email;
  if (!email) return null;
  const meta = session.user.user_metadata as Record<string, unknown> | undefined;
  // Google accounts set full_name; email-OTP accounts set display_name.
  const name =
    typeof meta?.full_name === "string" && meta.full_name
      ? meta.full_name
      : typeof meta?.display_name === "string"
        ? meta.display_name
        : "";
  return { email, name };
}

/**
 * Return a valid access token, transparently refreshing an expired session
 * via Supabase. Returns null when signed out or refresh fails (the caller
 * can then surface a sign-in prompt). Never logs the token.
 */
export async function getAccessToken(): Promise<string | null> {
  const session = await loadSession();
  if (!session) return null;

  const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
  if (Date.now() < expiresAtMs - REFRESH_SKEW_MS) {
    return session.access_token;
  }

  // Access token expired (or unknown) — refresh with the stored refresh token.
  const client = createAuthClient();
  const { data, error } = await client.auth.refreshSession({
    refresh_token: session.refresh_token,
  });
  if (error || !data.session) {
    // Refresh failed — drop the stale session so the UI shows signed-out.
    await clearSession();
    return null;
  }
  await saveSession(data.session);
  return data.session.access_token;
}
