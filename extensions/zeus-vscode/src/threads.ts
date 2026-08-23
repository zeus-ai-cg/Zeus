/**
 * Thread management utilities for the Zeus AI VS Code extension.
 *
 * Uses Supabase client directly (same as the web app's server functions).
 * All calls are made from the extension host with the user's access token.
 * The webview never sees raw tokens.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAccessToken } from "./auth/session";
import { getConfig } from "./config";

// ── Types ────────────────────────────────────────────────────────────

export interface Thread {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
}

export interface ThreadMessage {
  id: string;
  role: "user" | "assistant" | "system";
  parts: Array<{ type: string; text?: string }>;
  created_at?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Create an authenticated Supabase client using the user's access token.
 */
function createAuthenticatedClient(token: string): SupabaseClient {
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── Thread operations ────────────────────────────────────────────────

/**
 * Create a new thread via Supabase.
 */
export async function createThread(
  title?: string,
): Promise<Thread | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const supabase = createAuthenticatedClient(token);

  // Get the user ID from the token
  const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) return null;
  const userId = claimsData.claims.sub;

  const { data: row, error } = await supabase
    .from("threads")
    .insert({
      user_id: userId,
      title: title ?? "New conversation",
    })
    .select("id, title, updated_at, created_at")
    .single();

  if (error) {
    console.error("Failed to create thread:", error.message);
    throw new Error(error.message);
  }

  return row as Thread;
}

/**
 * Load messages for a specific thread.
 */
export async function loadThreadMessages(
  threadId: string,
): Promise<ThreadMessage[]> {
  const token = await getAccessToken();
  if (!token) return [];

  const supabase = createAuthenticatedClient(token);

  const { data: rows, error } = await supabase
    .from("messages")
    .select("id, role, parts, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load messages:", error.message);
    throw new Error(error.message);
  }

  return (rows ?? []).map((r) => ({
    id: r.id,
    role: r.role as "user" | "assistant",
    parts: r.parts as Array<{ type: string; text?: string }>,
    created_at: r.created_at,
  }));
}

/**
 * Load recent threads for the sidebar list.
 */
export async function listThreads(): Promise<Thread[]> {
  const token = await getAccessToken();
  if (!token) return [];

  const supabase = createAuthenticatedClient(token);

  const { data, error } = await supabase
    .from("threads")
    .select("id, title, updated_at, created_at")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Failed to list threads:", error.message);
    throw new Error(error.message);
  }

  return (data ?? []) as Thread[];
}

/**
 * Delete a thread.
 */
export async function deleteThread(threadId: string): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;

  const supabase = createAuthenticatedClient(token);

  const { error } = await supabase
    .from("threads")
    .delete()
    .eq("id", threadId);

  if (error) {
    console.error("Failed to delete thread:", error.message);
    return false;
  }

  return true;
}
