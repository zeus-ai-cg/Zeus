import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { completeOnboarding } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { Check, Code2, Infinity as InfinityIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { UpgradeProButton } from "@/components/UpgradeProButton";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [account, setAccount] = useState<{ email?: string; id?: string }>({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setAccount({ email: data.user?.email ?? undefined, id: data.user?.id });
    });
  }, []);

  const complete = useServerFn(completeOnboarding);
  const mut = useMutation({
    // Marks onboarding as done and routes the user in. It never sets the
    // "pro" plan itself — see completeOnboarding: real Pro access can only
    // come from a verified Lemon Squeezy webhook after actual payment
    // (src/routes/api/webhooks.ts), never from a client call.
    mutationFn: (plan: "free" | "pro") => complete({ data: { plan } }),
    onSuccess: async (_d, plan) => {
      await qc.invalidateQueries();
      toast.success(
        plan === "pro"
          ? "Checkout started — Pro unlocks as soon as payment is confirmed."
          : "Welcome to Zeus AI!",
      );
      navigate({ to: plan === "pro" ? "/billing" : "/chat" });
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-hero pointer-events-none" />
      <div className="relative max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <div className="size-14 mx-auto rounded-2xl bg-gradient-primary grid place-items-center shadow-glow mb-5">
            <Code2 className="size-7 text-primary-foreground" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Welcome to <span className="text-gradient">Zeus AI</span> — Your AI Software Engineer
          </h1>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto text-lg">
            Upload your project, chat with it, generate features, review code, and ship changes with
            an AI Software Engineering Workspace.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <PlanCard
            name="Standard Mode"
            price="Free"
            tagline="Perfect for getting started"
            features={[
              "15 questions every 24 hours",
              "Live question counter (e.g. 7 / 15)",
              "Core coding help across 20+ languages",
              "Project Chat and basic Workspace access",
              "Basic project guidance",
            ]}
          >
            <Button
              onClick={() => mut.mutate("free")}
              disabled={mut.isPending}
              size="lg"
              variant="outline"
              className="w-full mt-7"
            >
              {mut.isPending && mut.variables === "free" ? "Setting up…" : "Continue with Standard"}
            </Button>
          </PlanCard>

          <PlanCard
            name="Pro Mode"
            price="$5"
            priceSuffix="/month"
            tagline="For serious developers & teams"
            highlighted
            features={[
              { text: "5,000 requests / month", icon: <InfinityIcon className="size-3.5" /> },
              "Advanced explanations & deeper analysis mode",
              "Extended code reviews",
              "Large project planning & architecture guidance",
              "Priority responses",
              "Higher Workspace usage limits",
              "Full Feature Generator & Git tooling access",
            ]}
          >
            {/* Real Lemon Squeezy checkout — the only path that can ever result in
                plan = "pro". Marks onboarding complete once checkout opens
                so the user isn't dropped back on this screen. */}
            <UpgradeProButton
              className="w-full mt-7"
              email={account.email}
              userId={account.id}
              label="Upgrade to Pro"
              onCheckoutOpened={() => mut.mutate("pro")}
            />
          </PlanCard>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          You can switch plans anytime from Settings.
        </p>
      </div>
    </div>
  );
}

type Feature = string | { text: string; icon?: React.ReactNode };

function PlanCard({
  name,
  price,
  priceSuffix,
  tagline,
  features,
  highlighted,
  children,
}: {
  name: string;
  price: string;
  priceSuffix?: string;
  tagline: string;
  features: Feature[];
  highlighted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative rounded-2xl border p-7 backdrop-blur-sm transition-all ${
        highlighted ? "border-primary/60 bg-card/80 shadow-elegant" : "border-border bg-card/60"
      }`}
    >
      {highlighted && (
        <div className="absolute -top-3 right-6 rounded-full bg-gradient-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground shadow-glow">
          Most popular
        </div>
      )}
      <h3 className="text-xl font-semibold">{name}</h3>
      <p className="text-sm text-muted-foreground mt-1">{tagline}</p>
      <div className="mt-5 flex items-baseline gap-1">
        <span className="text-4xl font-bold tracking-tight">{price}</span>
        {priceSuffix && <span className="text-muted-foreground">{priceSuffix}</span>}
      </div>
      <ul className="mt-6 space-y-2.5">
        {features.map((f, i) => {
          const text = typeof f === "string" ? f : f.text;
          const icon = typeof f === "object" && f.icon ? f.icon : <Check className="size-3.5" />;
          return (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <span className="mt-0.5 size-5 rounded-full bg-primary/15 text-primary grid place-items-center shrink-0">
                {icon}
              </span>
              <span>{text}</span>
            </li>
          );
        })}
      </ul>
      {children}
    </div>
  );
}
