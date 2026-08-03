import { createFileRoute, Link } from "@tanstack/react-router";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/MarketingLayout";

export const Route = createFileRoute("/billing/cancel")({
  head: () => ({ meta: [{ title: "Checkout cancelled — Zeus AI" }] }),
  component: Cancel,
});

function Cancel() {
  return (
    <MarketingLayout>
      <section className="max-w-2xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground mb-6">
          <XCircle className="size-9" />
        </div>
        <h1 className="text-4xl font-bold">Checkout cancelled</h1>
        <p className="mt-4 text-muted-foreground">
          No charge was made. You can keep using Zeus AI on the Free plan, or try upgrading again
          whenever you're ready.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button className="bg-gradient-primary text-primary-foreground" asChild>
            <Link to="/pricing">Back to pricing</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/chat">Keep using Free</Link>
          </Button>
        </div>
      </section>
    </MarketingLayout>
  );
}
