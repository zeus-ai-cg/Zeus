import * as vscode from "vscode";

/**
 * Central configuration for the Zeus AI VS Code extension.
 *
 * Phase 1 (auth) talks directly to Supabase; the `apiBaseUrl` is reserved
 * for later phases (chat / Engineer) where the extension talks to the Zeus
 * backend. All AI provider keys stay server-side on the Zeus backend — the
 * extension never contains, reads, or sends provider API keys.
 */

const CONFIG_SECTION = "zeus";

export interface ZeusConfig {
  /** Zeus backend API base URL (used by later phases, not Phase 1 auth). */
  apiBaseUrl: string;
  /** Public Supabase project URL used for authentication. */
  supabaseUrl: string;
  /** Public Supabase publishable (anon) key — NOT a secret. */
  supabaseAnonKey: string;
  /** Respect .gitignore when scanning workspace files (default true). */
  respectGitignore: boolean;
  /** Extra privacy glob patterns provided by the user (always blocked). */
  extraBlockedPatterns: string[];
  /** Context limits for project analysis / code actions. */
  contextMaxFiles: number;
  contextMaxFileKB: number;
  contextMaxTotalKB: number;
}

// Verified Zeus production domain — the extension talks to this for chat/Engineer.
const DEFAULT_API_BASE_URL = "https://zeusai.website";

// These are the public values from the Zeus web app's client bundle
// (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY). They are safe to ship
// — the publishable key only ever acts under Supabase Row Level Security.
// The service-role key must NEVER appear here.
const DEFAULT_SUPABASE_URL = "https://ohgvjmrgaperrfhcrgld.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_OtYxTkSfv4b0_ReArXZVtQ_t4nZH9Km";

export function getConfig(): ZeusConfig {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    apiBaseUrl: cfg.get<string>("apiBaseUrl") ?? DEFAULT_API_BASE_URL,
    supabaseUrl: cfg.get<string>("supabaseUrl") ?? DEFAULT_SUPABASE_URL,
    supabaseAnonKey: cfg.get<string>("supabaseAnonKey") ?? DEFAULT_SUPABASE_ANON_KEY,
    respectGitignore: cfg.get<boolean>("privacy.respectGitignore") ?? true,
    extraBlockedPatterns: cfg.get<string[]>("privacy.extraBlockedPatterns") ?? [],
    contextMaxFiles: cfg.get<number>("context.maxFiles") ?? 300,
    contextMaxFileKB: cfg.get<number>("context.maxFileKB") ?? 64,
    contextMaxTotalKB: cfg.get<number>("context.maxTotalKB") ?? 512,
  };
}
