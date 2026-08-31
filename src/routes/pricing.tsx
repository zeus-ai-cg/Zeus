import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingLayout, PageHero } from "@/components/MarketingLayout";
import { UpgradeProButton } from "@/components/UpgradeProButton";
import { UpgradeUltimateButton } from "@/components/UpgradeUltimateButton";
import { SITE_URL } from "@/lib/site";
import { useAuthAccount } from "@/hooks/use-auth-account";
import { getMe } from "@/lib/profile.functions";
import { isProOrAbove, isUltimate } from "@/lib/plans";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Zeus AI" },
      {
        name: "description",
        content:
          "Simple, transparent pricing. Free forever plan, Pro at $5/month for 5,000 requests/month, and Ultimate at $10/month with no Fair Usage Policy.",
      },
      { property: "og:title", content: "Pricing — Zeus AI" },
      {
        property: "og:description",
        content:
          "Simple, transparent pricing. Free forever plan, Pro at $5/month for 5,000 requests/month, and Ultimate at $10/month with no Fair Usage Policy.",
      },
      { property: "og:url", content: `${SITE_URL}/pricing` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/pricing` }],
  }),
  component: Pricing,
});

const FREE = ["15 questions", "Reset every 24 hours"];

const PRO = [
  "5,000 requests / month",
  "Unlimited Engineer Mode runs",
  "AI Code Review + Health Score",
  "VS Code extension included",
  "Priority Responses",
];

const ULTIMATE = [
  "Everything in Pro",
  "No Fair Usage Policy — truly unlimited requests",
  "Unlimited Zeus Project Engineer runs",
  "Unlimited Zeus Credits",
  "Earliest access to new Engineer tools",
  "Priority support",
];

function Pricing() {
  const me = useServerFn(getMe);
  const { data: profile } = useQuery({
    queryKey: ["me"],
    queryFn: () => me(),
    retry: false,
    refetchOnMount: "always",
  });
  const account = useAuthAccount();
  const plan = profile?.plan ?? "free";
  const isProUser = isProOrAbove(plan);
  const isUltimateUser = isUltimate(plan);

  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Pricing"
        title="Simple, fair pricing"
        subtitle="Start free. Upgrade only when you need more. Cancel anytime — no hidden fees."
      />

      <section className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-border bg-card/60 p-8">
          <h3 className="text-2xl font-semibold">Free</h3>
          <p className="text-sm text-muted-foreground mt-1">Perfect for trying Zeus AI</p>
          <div className="mt-6 flex items-baseline gap-1">
            <span className="text-5xl font-bold">$0</span>
            <span className="text-muted-foreground">forever</span>
          </div>
          <ul className="mt-7 space-y-2.5">
            {FREE.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check className="size-4 mt-0.5 text-accent shrink-0" /> {f}
              </li>
            ))}
          </ul>
          <Button variant="outline" className="w-full mt-8" asChild>
            <Link to="/auth">Get started free</Link>
          </Button>
        </div>

        <div className="relative rounded-2xl border border-primary/60 bg-card/80 p-8 shadow-glow">
          <div className="absolute -top-3 left-8 text-xs font-semibold px-2.5 py-1 rounded-full bg-gradient-primary text-primary-foreground">
            Most popular
          </div>
          <h3 className="text-2xl font-semibold">Pro</h3>
          <p className="text-sm text-muted-foreground mt-1">
            For teams shipping real codebases
          </p>{" "}
          <div className="mt-6 flex items-baseline gap-1">
            <span className="text-5xl font-bold">$5</span>
            <span className="text-muted-foreground">/ month</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Monthly billing · Cancel anytime</p>
          <ul className="mt-7 space-y-2.5">
            {PRO.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check className="size-4 mt-0.5 text-accent shrink-0" /> {f}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <UpgradeProButton className="w-full" email={account.email} userId={account.id} />
          </div>
          {(isProUser || isUltimateUser) && (
            <p className="mt-3 text-center text-sm text-muted-foreground">
              {isUltimateUser
                ? "You already have full Ultimate access."
                : "You're currently on Pro."}
            </p>
          )}
        </div>

        <div className="relative rounded-2xl border border-amber-500/50 bg-card/80 p-8">
          <div className="absolute -top-3 left-8 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500 text-black">
            ⚡ Zero limits
          </div>
          <h3 className="text-2xl font-semibold">Ultimate</h3>
          <p className="text-sm text-muted-foreground mt-1">For teams shipping full products</p>
          <div className="mt-6 flex items-baseline gap-1">
            <span className="text-5xl font-bold">$10</span>
            <span className="text-muted-foreground">/ month</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Monthly billing · Cancel anytime</p>
          <ul className="mt-7 space-y-2.5">
            {ULTIMATE.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check className="size-4 mt-0.5 text-amber-500 shrink-0" /> {f}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <UpgradeUltimateButton
              className="w-full bg-amber-500 hover:bg-amber-400 text-black shadow-none"
              email={account.email}
              userId={account.id}
            />
          </div>
          {isUltimateUser && (
            <p className="mt-3 text-center text-sm text-muted-foreground">
              You're on Ultimate and have full access.
            </p>
          )}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-10 text-center">
        <h2 className="text-2xl font-semibold">What's included with Pro?</h2>
        <p className="mt-3 text-muted-foreground">
          Every Pro subscription includes a generous 5,000-requests-a-month allowance (our{" "}
          <Link to="/terms" className="text-primary hover:underline">
            Fair Usage Policy
          </Link>
          ), unlimited Engineer Mode runs, AI Code Review with a project Health Score, the VS Code
          extension, and priority responses. We bill monthly via Lemon Squeezy — your subscription
          renews automatically each month and can be cancelled instantly from your billing
          dashboard. Subscription stops at the end of the current period; no further charges.
        </p>
        <div className="mt-6 flex justify-center gap-3 flex-wrap text-sm">
          <Link to="/refund" className="text-primary hover:underline">
            30-day money-back guarantee →
          </Link>
          <span className="text-muted-foreground">·</span>
          <Link to="/terms" className="text-muted-foreground hover:text-foreground">
            Terms
          </Link>
          <span className="text-muted-foreground">·</span>
          <Link to="/contact" className="text-muted-foreground hover:text-foreground">
            Questions? Contact us
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
