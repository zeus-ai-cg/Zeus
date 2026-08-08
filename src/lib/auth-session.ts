import type { QueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getDesktopAuthBridge } from "@/lib/desktop-auth";

let initialSessionPromise: Promise<Session | null> | null = null;

function clearSupabaseAuthStorage() {
  if (typeof window === "undefined") return;

  const keysToRemove: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith("sb-")) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => window.localStorage.removeItem(key));
}

export function resetAuthSessionCache() {
  initialSessionPromise = null;
}

export async function getInitialSession(): Promise<Session | null> {
  if (initialSessionPromise) return initialSessionPromise;

  // supabase.auth.getSession() already waits for the client's internal
  // initialization (reading the persisted session from storage) before
  // resolving, so it reliably returns the current session on both the
  // server and the client without needing an onAuthStateChange
  // subscription. Deliberately NOT using onAuthStateChange here: opening a
  // new subscription fires an immediate INITIAL_SESSION event with
  // whatever the client's in-memory session happens to be at that exact
  // instant, which — if this function is called again while a sign-out is
  // still in flight — can race and resolve with a stale, still-logged-in
  // session (see signOutAndClearAuth below).
  initialSessionPromise = supabase.auth.getSession().then(({ data }) => data.session ?? null);

  return initialSessionPromise;
}

export async function signOutAndClearAuth(queryClient?: QueryClient | null) {
  if (typeof window === "undefined") return;

  resetAuthSessionCache();
  await queryClient?.cancelQueries();
  queryClient?.clear();

  const { error } = await supabase.auth.signOut();
  if (error) throw error;

  clearSupabaseAuthStorage();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) {
    await supabase.auth.signOut();
    clearSupabaseAuthStorage();
  }

  // Desktop: invalidate any stashed OAuth session in the main process so it
  // can't be silently re-applied on a later visit to /auth.
  getDesktopAuthBridge()?.clearPendingSession();
}

export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const syncSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(session);
      setIsLoading(false);
    };

    void syncSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    user: session?.user ?? null,
    isAuthenticated: Boolean(session?.user),
    isLoading,
  };
}
