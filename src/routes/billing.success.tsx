import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/MarketingLayout";

export const Route = createFileRoute("/billing/success")({
  head: () => ({ meta: [{ title: "Welcome to Pro — Zeus AI" }] }),
  component: Success,
});

function Success() {
  return (
    <MarketingLayout>
      <section className="max-w-2xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex size-16 items-center justify-center rounded-full bg-accent/15 text-accent mb-6">
          <CheckCircle2 className="size-9" />
        </div>
        <h1 className="text-4xl font-bold">You're in. Welcome to ⚡ Zeus AI Pro</h1>
        <p className="mt-4 text-muted-foreground">
          Payment confirmed. Your Pro features are unlocking — unlimited Engineer Mode runs, AI Code
          Review with a project Health Score, the VS Code extension, and priority responses.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button className="bg-gradient-primary text-primary-foreground shadow-glow" asChild>
            <Link to="/chat">Start building</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/billing">View billing</Link>
          </Button>
        </div>
        <p className="mt-10 text-xs text-muted-foreground">
          A receipt has been emailed to you by Lemon Squeezy. It may take up to a minute for Pro to
          appear in your account. Still not showing after a few minutes? Email{" "}
          <a href="mailto:zeus.ai328@gmail.com" className="text-primary hover:underline">
            zeus.ai328@gmail.com
          </a>{" "}
          with your account email and we'll sort it out.
        </p>
      </section>
    </MarketingLayout>
  );
}
