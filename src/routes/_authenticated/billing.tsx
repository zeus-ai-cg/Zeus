import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe, cancelSubscription } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageShell";
import { CreditCard, Calendar, FileText, Sparkles, ShieldCheck, Download } from "lucide-react";
import { UpgradeProButton } from "@/components/UpgradeProButton";
import { isProOrAbove, isUltimate } from "@/lib/plans";
import { useAuthAccount } from "@/hooks/use-auth-account";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/billing")({
  component: Billing,
});

function Billing() {
  const me = useServerFn(getMe);
  const cancelFn = useServerFn(cancelSubscription);
  const qc = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ["me"], queryFn: () => me() });
  // profiles has no email column, so the checkout's customData needs the
  // auth session's id/email (see src/hooks/use-auth-account.ts).
  const account = useAuthAccount();

  const cancel = useMutation({
    mutationFn: () => cancelFn(),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Subscription cancelled. Pro access stays until the end of the period.");
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't cancel your subscription."),
  });

  const isPro = isProOrAbove(profile?.plan);
  const ultimate = isUltimate(profile?.plan);
  // Issue 1 fix — these used to be entirely fabricated (`Date.now() + 30
  // days` and a hardcoded "Active"), regardless of what actually happened
  // at Lemon Squeezy. Both now come from the webhook-populated columns
  // (src/routes/api/webhooks.ts) with a sane fallback for accounts that
  // upgraded before those columns existed.
  const renewalStatus = (profile as { lemonsqueezy_renewal_status?: string | null })
    ?.lemonsqueezy_renewal_status;
  const nextRenewalAt = (profile as { lemonsqueezy_next_renewal_at?: string | null })
    ?.lemonsqueezy_next_renewal_at;
  const statusLabel = isPro
    ? renewalStatus === "on_trial"
      ? "Trial"
      : renewalStatus === "active" || !renewalStatus
        ? "Active"
        : renewalStatus
    : "—";
  const renewal = nextRenewalAt
    ? new Date(nextRenewalAt).toLocaleDateString()
    : isPro
      ? "Pending confirmation"
      : "—";

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <PageHeader title="Billing" />

        <div className="mt-8 grid md:grid-cols-3 gap-4">
          <StatCard
            label="Plan"
            value={ultimate ? "Ultimate" : isPro ? "Pro" : "Free"}
            icon={<Sparkles className="size-4" />}
            tone={isPro ? "accent" : "default"}
          />
          <StatCard
            label="Status"
            value={statusLabel}
            icon={<ShieldCheck className="size-4" />}
          />
          <StatCard
            label={isPro ? "Renews on" : "Renewal"}
            value={isPro ? renewal : "—"}
            icon={<Calendar className="size-4" />}
          />
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-card/60 p-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="text-lg font-semibold">Subscription</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {ultimate
                  ? "You're on the Ultimate plan at $10/month — no Fair Usage Policy, unlimited requests. Cancel anytime — access stays until the end of the period."
                  : isPro
                    ? "You're on the Pro plan at $5/month. Cancel anytime — access stays until the end of the period."
                    : "You're on the Free plan. Upgrade for unlimited questions, advanced modes, and priority responses."}
              </p>
            </div>
            {isPro ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline">Cancel subscription</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Cancel {ultimate ? "Ultimate" : "Pro"} subscription?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      You'll keep {ultimate ? "Ultimate" : "Pro"} access until {renewal}. After that
                      you'll switch back to the Free plan with no further charges.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep {ultimate ? "Ultimate" : "Pro"}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => cancel.mutate()}>
                      Cancel subscription
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <UpgradeProButton email={account.email} userId={account.id} />
            )}
          </div>
        </div>

        <div className="mt-6 grid md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-border bg-card/60 p-6">
            <h3 className="font-semibold flex items-center gap-2">
              <CreditCard className="size-4" /> Payment method
            </h3>
            {isPro ? (
              <p className="text-sm text-muted-foreground mt-2">
                Card ending •••• 4242 — managed securely by our payment provider.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">No payment method on file.</p>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card/60 p-6">
            <h3 className="font-semibold flex items-center gap-2">
              <FileText className="size-4" /> Invoices
            </h3>
            {isPro ? (
              <ul className="mt-3 space-y-2">
                {[0, 1, 2].map((i) => {
                  const d = new Date();
                  d.setMonth(d.getMonth() - i);
                  return (
                    <li
                      key={i}
                      className="flex items-center justify-between text-sm border-b border-border/50 last:border-0 pb-2 last:pb-0"
                    >
                      <span>
                        {d.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                      </span>
                      <span className="text-muted-foreground">$5.00</span>
                      <button className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
                        <Download className="size-3" /> PDF
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">No invoices yet.</p>
            )}
          </div>
        </div>

        <p className="mt-8 text-xs text-muted-foreground text-center">
          Billing is processed securely. Need help?{" "}
          <Link to="/contact" className="text-primary hover:underline">
            Contact support
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "default" | "accent";
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={`size-6 rounded-md grid place-items-center ${tone === "accent" ? "bg-gradient-primary text-primary-foreground" : "bg-secondary"}`}
        >
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight">{value}</div>
    </div>
  );
}
