import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe, cancelSubscription } from "@/lib/profile.functions";
import { PageHeader } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Crown } from "lucide-react";
import { toast } from "sonner";
import { UpgradeProButton } from "@/components/UpgradeProButton";
import { UpgradeUltimateButton } from "@/components/UpgradeUltimateButton";
import { isProOrAbove, isUltimate } from "@/lib/plans";
import { useAuthAccount } from "@/hooks/use-auth-account";

export const Route = createFileRoute("/_authenticated/upgrade")({
  component: Upgrade,
});

function Upgrade() {
  const qc = useQueryClient();
  const me = useServerFn(getMe);
  const cancelFn = useServerFn(cancelSubscription);
  const { data: profile } = useQuery({ queryKey: ["me"], queryFn: () => me() });
  // profiles has no email column, so the checkout's customData needs the
  // auth session's id/email (see src/hooks/use-auth-account.ts).
  const account = useAuthAccount();

  const mut = useMutation({
    mutationFn: () => cancelFn(),
    onSuccess: async () => {
      await qc.invalidateQueries();
      toast.success("Switched to Standard.");
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't cancel your subscription."),
  });

  const isPro = isProOrAbove(profile?.plan);
  const ultimate = isUltimate(profile?.plan);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <PageHeader
          title="Upgrade to Pro"
          subtitle="Unlock unlimited learning, deeper code reviews, and personalized roadmaps."
        />

        <div className="grid md:grid-cols-3 gap-5 mt-8">
          <div className="rounded-2xl border border-border bg-card/60 p-6">
            <h3 className="text-lg font-semibold">Standard</h3>
            <p className="text-sm text-muted-foreground">Great for getting started.</p>
            <div className="mt-4 text-3xl font-bold">Free</div>
            <ul className="mt-5 space-y-2 text-sm">
              {[
                "15 questions / 24 hours",
                "Core coding help",
                "Beginner explanations",
                "Basic project guidance",
              ].map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="size-4 text-primary mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            {isPro && (
              <Button
                variant="outline"
                className="w-full mt-6"
                disabled={mut.isPending}
                onClick={() => mut.mutate()}
              >
                Switch to Standard
              </Button>
            )}
          </div>

          <div className="rounded-2xl border border-primary/60 bg-card/80 p-6 shadow-elegant relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-hero pointer-events-none" />
            <div className="relative">
              <div className="flex items-center gap-2">
                <Crown className="size-5 text-accent" />
                <h3 className="text-lg font-semibold">Pro</h3>
              </div>
              <p className="text-sm text-muted-foreground">For serious learners and engineers.</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold">$5</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <ul className="mt-5 space-y-2 text-sm">
                {[
                  "5,000 questions / month",
                  "Advanced explanations & deep learning mode",
                  "Extended code reviews",
                  "Large project planning & architecture",
                  "Priority responses",
                  "Advanced interview preparation",
                  "Personalized learning roadmaps",
                ].map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="size-4 text-primary mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              {isPro ? (
                <div className="mt-6 rounded-lg bg-primary/15 text-primary text-sm font-medium px-4 py-3 text-center">
                  ✓ {ultimate ? "Included in Ultimate" : "You're on Pro"}
                </div>
              ) : (
                <UpgradeProButton
                  className="w-full mt-6"
                  email={account.email}
                  userId={account.id}
                />
              )}
              <p className="text-[11px] text-muted-foreground text-center mt-3">
                Payments are processed through Lemon Squeezy. If checkout fails, check your Lemon
                Squeezy configuration and reload the page.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-500/50 bg-card/80 p-6 relative overflow-hidden">
            <div className="relative">
              <div className="flex items-center gap-2">
                <Crown className="size-5 text-amber-500" />
                <h3 className="text-lg font-semibold">Ultimate</h3>
              </div>
              <p className="text-sm text-muted-foreground">For teams shipping full products.</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold">$10</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <ul className="mt-5 space-y-2 text-sm">
                {[
                  "Everything in Pro",
                  "No Fair Usage Policy — truly unlimited requests",
                  "Unlimited Zeus Project Engineer runs",
                  "Unlimited Zeus Credits",
                  "Earliest access to new Engineer tools",
                  "Priority support",
                ].map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="size-4 text-amber-500 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              {ultimate ? (
                <div className="mt-6 rounded-lg bg-amber-500/15 text-amber-500 text-sm font-medium px-4 py-3 text-center">
                  ✓ You're on Ultimate
                </div>
              ) : (
                <UpgradeUltimateButton
                  className="w-full mt-6 bg-amber-500 hover:bg-amber-400 text-black shadow-none"
                  email={account.email}
                  userId={account.id}
                />
              )}
              <p className="text-[11px] text-muted-foreground text-center mt-3">
                Payments are processed through Lemon Squeezy. If checkout fails, check your Lemon
                Squeezy configuration and reload the page.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
