import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Current Supabase auth user's id/email, for wiring into Lemon Squeezy checkout
 * (`openProCheckout` / `UpgradeProButton`) as `customData.user_id`.
 *
 * `profiles` has no `email` column, so this can't come from getMe(); it has
 * to come from the auth session itself — same approach already used in
 * src/routes/_authenticated/onboarding.tsx. Centralized here so every
 * <UpgradeProButton /> call site can share it instead of re-implementing
 * the same auth-session effect.
 */
export function useAuthAccount() {
  const [account, setAccount] = useState<{ id?: string; email?: string }>({});

  useEffect(() => {
    let cancelled = false;

    const syncAccount = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      setAccount({ id: session?.user?.id, email: session?.user?.email ?? undefined });
    };

    void syncAccount();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setAccount({ id: session?.user?.id, email: session?.user?.email ?? undefined });
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return account;
}
