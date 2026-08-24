// OAuth hash-session recovery.
//
// Sometimes the Supabase OAuth callback arrives as an implicit-flow URL
// fragment (#access_token=...&refresh_token=...) but supabase-js loses the
// race against the router and never converts it into a stored session. The
// result: the user LOOKS logged out everywhere even though a perfectly valid
// token is sitting in the address bar. This module deterministically picks up
// that fragment, stores the session, and scrubs the tokens from the URL.
//
// Runs once per page load; a no-op on every normal visit.

import { supabase } from "@/integrations/supabase/client";

let attempted = false;

export async function recoverOAuthHashSession(): Promise<void> {
  if (attempted || typeof window === "undefined") return;
  attempted = true;

  const hash = window.location.hash;
  if (!hash || !hash.includes("access_token=")) return;

  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  // Scrub the fragment FIRST — tokens must never linger in a shareable URL,
  // whether or not the session below succeeds.
  window.history.replaceState(null, "", window.location.pathname + window.location.search);

  if (!accessToken || !refreshToken) return;

  try {
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) {
      console.error("[oauth-recovery] setSession failed", error.message);
      return;
    }
    console.info("[oauth-recovery] recovered session from URL fragment");
  } catch (error) {
    console.error("[oauth-recovery] unexpected failure", error);
  }
}
