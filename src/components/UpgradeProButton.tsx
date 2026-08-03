import { Button, type ButtonProps } from "@/components/ui/button";
import { Sparkles, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { initLemonSqueezy, isLemonSqueezyConfigured, openProCheckout } from "@/lib/lemonsqueezy";
import { isProOrAbove, isUltimate } from "@/lib/plans";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe } from "@/lib/profile.functions";

interface Props extends Omit<ButtonProps, "onClick"> {
  email?: string;
  userId?: string;
  label?: string;
  /** Called after checkout successfully opens (not after payment — that's the webhook's job). */
  onCheckoutOpened?: () => void;
}

export function UpgradeProButton({
  email,
  userId,
  label = "Upgrade to Pro",
  className,
  onCheckoutOpened,
  ...rest
}: Props) {
  const me = useServerFn(getMe);
  const { data: profile, isFetching } = useQuery({
    queryKey: ["me"],
    queryFn: () => me(),
    retry: false,
    refetchOnMount: "always",
  });
  const [checkoutReady, setCheckoutReady] = useState<boolean | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const isPro = !isFetching && isProOrAbove(profile?.plan);
  const ultimate = !isFetching && isUltimate(profile?.plan);
  const qc = useQueryClient();
  const pollRef = useRef<{ interval: ReturnType<typeof setInterval>; timeout: ReturnType<typeof setTimeout> } | null>(
    null,
  );

  // Issue 1 fix — "the authenticated user MUST immediately become pro ...
  // without requiring manual refresh." Checkout opens in a separate tab
  // (src/lib/lemonsqueezy.ts), so once the webhook flips profiles.plan the
  // original tab has no way to know unless something asks again. Poll the
  // shared ["me"] query for a couple of minutes after checkout opens; it
  // stops itself as soon as the plan comes back non-free, or after the
  // window elapses (e.g. the user abandoned checkout).
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current.interval);
        clearTimeout(pollRef.current.timeout);
      }
    };
  }, []);

  function startPostCheckoutPolling() {
    if (pollRef.current) return;
    const interval = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["me"] });
    }, 3000);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      pollRef.current = null;
    }, 120_000);
    pollRef.current = { interval, timeout };
  }

  useEffect(() => {
    if (isPro && pollRef.current) {
      clearInterval(pollRef.current.interval);
      clearTimeout(pollRef.current.timeout);
      pollRef.current = null;
    }
  }, [isPro]);

  useEffect(() => {
    if (!isLemonSqueezyConfigured()) {
      setCheckoutReady(false);
      setCheckoutError("Missing Pro checkout configuration. Check your Lemon Squeezy environment variables.");
      return;
    }

    let cancelled = false;
    initLemonSqueezy("pro")
      .then(() => {
        if (!cancelled) {
          setCheckoutReady(true);
          setCheckoutError(null);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setCheckoutReady(false);
        const message =
          error instanceof Error
            ? error.message
            : "Lemon Squeezy checkout could not be initialized.";
        setCheckoutError(message);
        toast.error("Could not load checkout", {
          description: message,
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleClick() {
    if (!isLemonSqueezyConfigured()) {
      toast.error("Payments not configured yet", {
        description: "Add VITE_LEMONSQUEEZY_PRO_CHECKOUT_URL to enable checkout.",
      });
      return;
    }
    if (checkoutReady === false) {
      toast.error("Checkout is unavailable", {
        description: checkoutError ?? "Lemon Squeezy checkout could not be initialized.",
      });
      return;
    }
    if (!userId) {
      toast.error("Still loading your account", {
        description: "Please wait a moment and try again.",
      });
      return;
    }
    try {
      await openProCheckout({ email, userId });
      onCheckoutOpened?.();
      startPostCheckoutPolling();
    } catch (error: unknown) {
      toast.error("Could not open checkout", {
        description: error instanceof Error ? error.message : "Try again.",
      });
    }
  }

  if (isPro) {
    return (
      <Button
        {...rest}
        disabled
        className={`bg-primary/15 text-primary hover:bg-primary/15 cursor-default ${className ?? ""}`}
      >
        <Check className="size-4 mr-2" /> {ultimate ? "Included in Ultimate" : "You're Pro"}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={handleClick}
        className={`bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow ${className ?? ""}`}
        disabled={checkoutReady !== true}
        {...rest}
      >
        <Sparkles className="size-4 mr-2" /> {label}
      </Button>
      {checkoutReady === false ? (
        <p className="text-[11px] text-destructive text-center">
         {checkoutError ?? "Lemon Squeezy checkout could not be initialized. Check your configuration and try again."}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground text-center">
          Payments are processed through Lemon Squeezy. If checkout fails, reload the page.
        </p>
      )}
    </div>
  );
}
