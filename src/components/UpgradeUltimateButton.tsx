import { Button, type ButtonProps } from "@/components/ui/button";
import { Rocket, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  initLemonSqueezy,
  isLemonSqueezyConfigured,
  openUltimateCheckout,
} from "@/lib/lemonsqueezy";
import { isUltimate } from "@/lib/plans";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe } from "@/lib/profile.functions";

interface Props extends Omit<ButtonProps, "onClick"> {
  email?: string;
  userId?: string;
  label?: string;
  onCheckoutOpened?: () => void;
}

export function UpgradeUltimateButton({
  email,
  userId,
  label = "Upgrade to Ultimate",
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
  const configured = isLemonSqueezyConfigured("ultimate");
  const alreadyUltimate = !isFetching && isUltimate(profile?.plan);
  // Flash-of-enabled-state guard — see UpgradeProButton for the full note.
  // Without this, an Ultimate subscriber could re-purchase during the brief
  // window before the profile query resolves on a fresh page load.
  const planUnknown = isFetching && !profile;
  const qc = useQueryClient();
  const pollRef = useRef<{ interval: ReturnType<typeof setInterval>; timeout: ReturnType<typeof setTimeout> } | null>(
    null,
  );

  // Issue 1 fix — see the identical comment in UpgradeProButton.tsx.
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
    if (alreadyUltimate && pollRef.current) {
      clearInterval(pollRef.current.interval);
      clearTimeout(pollRef.current.timeout);
      pollRef.current = null;
    }
  }, [alreadyUltimate]);

  useEffect(() => {
    if (!configured) {
      setCheckoutReady(false);
      setCheckoutError("Missing Ultimate checkout configuration. Check your Lemon Squeezy environment variables.");
      return;
    }
    let cancelled = false;
    initLemonSqueezy("ultimate")
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
  }, [configured]);

  async function handleClick() {
    if (!configured) {
      toast.error("Ultimate checkout isn't configured", {
        description: "Set VITE_LEMONSQUEEZY_ULTIMATE_CHECKOUT_URL to enable Ultimate checkout.",
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
      await openUltimateCheckout({ email, userId });
      onCheckoutOpened?.();
      startPostCheckoutPolling();
    } catch (error: unknown) {
      toast.error("Could not open checkout", {
        description: error instanceof Error ? error.message : "Try again.",
      });
    }
  }

  if (planUnknown) {
    return (
      <Button
        {...rest}
        disabled
        className={`bg-primary/15 text-muted-foreground hover:bg-primary/15 cursor-wait ${className ?? ""}`}
      >
        <Rocket className="size-4 mr-2 animate-pulse" /> Checking your plan…
      </Button>
    );
  }

  if (alreadyUltimate) {
    return (
      <Button
        {...rest}
        disabled
        className={`bg-primary/15 text-primary hover:bg-primary/15 cursor-default ${className ?? ""}`}
      >
        <Check className="size-4 mr-2" /> You're Ultimate
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={handleClick}
        className={`bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow ${className ?? ""}`}
        disabled={!configured || checkoutReady !== true}
        {...rest}
      >
        <Rocket className="size-4 mr-2" /> {label}
      </Button>
      {configured && checkoutReady === false && (
        <p className="text-[11px] text-destructive text-center">
         {checkoutError ?? "Lemon Squeezy checkout could not be initialized. Check your configuration and try again."}
        </p>
      )}
    </div>
  );
}
