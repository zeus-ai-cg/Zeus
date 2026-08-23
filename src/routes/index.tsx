import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Sparkles,
  MessageSquare,
  Languages,
  BookOpen,
  Bug,
  Rocket,
  Shield,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/lib/auth-session";
import heroImg from "@/assets/codemaster-hero.jpg";
import { MarketingLayout } from "@/components/MarketingLayout";
import { SITE_URL } from "@/lib/site";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zeus AI — Your AI Software Engineer" },
      {
        name: "description",
        content:
          "Zeus AI is an AI Software Engineering Workspace: upload your project, chat with it, generate features, review code, and ship changes with AI that understands your whole codebase.",
      },
      { property: "og:title", content: "Zeus AI — Your AI Software Engineer" },
      {
        property: "og:description",
        content:
          "Zeus AI is an AI Software Engineering Workspace: upload your project, chat with it, generate features, review code, and ship changes with AI that understands your whole codebase.",
      },
      { property: "og:url", content: `${SITE_URL}/` },
      { name: "twitter:title", content: "Zeus AI — Your AI Software Engineer" },
      {
        name: "twitter:description",
        content:
          "Upload your project, chat with it, generate features, and ship changes with an AI Software Engineering Workspace.",
      },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              name: "Zeus AI",
              url: `${SITE_URL}/`,
              description:
                "AI Software Engineering Workspace that helps developers analyze, modify, and ship real codebases.",
            },
            {
              "@type": "WebSite",
              name: "Zeus AI",
              url: `${SITE_URL}/`,
              description:
                "Your AI software engineer — upload a project, understand it, and ship changes faster.",
            },
          ],
        }),
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: BookOpen,
    title: "Upload & analyze",
    desc: "Upload a project ZIP and Zeus AI indexes its structure, framework, and dependencies.",
  },
  {
    icon: Bug,
    title: "Modify your project",
    desc: "Describe a change and get a real diff you can review, roll back, and export as a ZIP.",
  },
  {
    icon: Rocket,
    title: "Feature Generator",
    desc: "One-click generation of new features, wired into your existing project structure.",
  },
  {
    icon: Shield,
    title: "AI Code Review",
    desc: "Automated review and a project Health Score that flags risk before you ship.",
  },
  {
    icon: Languages,
    title: "Project Chat",
    desc: "Chat with your codebase directly — ask where something lives or how it works.",
  },
  {
    icon: Sparkles,
    title: "BYOK & Git tools",
    desc: "Bring your own model keys, generate commits and PR descriptions, and stay in control.",
  },
];

const faqs = [
  {
    q: "How many free questions do I get?",
    a: "Every free account gets 15 questions per 24 hours. The counter resets automatically.",
  },
  {
    q: "What's in the Pro plan?",
    a: "5,000 requests/month, higher usage limits across Workspace features, unlimited history, and priority responses.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. One click in Billing — your plan stays active until the period ends, then no further charges.",
  },
  {
    q: "Do you offer refunds?",
    a: "30-day money-back guarantee on Pro. Email Haidersiddique0909@gmail.com.",
  },
];

function Landing() {
  const { isAuthenticated } = useAuthSession();

  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-hero pointer-events-none" />
        <div className="max-w-6xl mx-auto px-6 pt-20 pb-24 grid lg:grid-cols-2 gap-12 items-center relative">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs text-muted-foreground mb-6">
              <Sparkles className="size-3 text-accent" /> Powered by Google Gemini
            </div>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.05]">
              Your <span className="text-gradient">AI Software Engineer</span>, available 24/7.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-xl">
              Zeus AI is an AI Software Engineering Workspace — upload your project, analyze it,
              generate features, review code, and ship changes with AI that understands your whole
              codebase.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                size="lg"
                className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow"
                asChild
              >
                <Link to={isAuthenticated ? "/dashboard" : "/auth"}>
                  <MessageSquare className="size-4 mr-2" />{" "}
                  {isAuthenticated ? "Open dashboard" : "Start free"}
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/pricing">See pricing</Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span>✓ Free forever plan</span>
              <span>✓ Bring your own keys</span>
              <span>✓ No credit card</span>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-8 bg-gradient-hero blur-3xl pointer-events-none" />
            <img
              src={heroImg}
              alt="Zeus AI"
              width={1536}
              height={1024}
              className="relative rounded-2xl border border-border shadow-elegant"
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Everything you need to ship faster
          </h2>
          <p className="mt-3 text-muted-foreground">
            One workspace across your whole project — from upload to shipped change.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-xl border border-border bg-card/60 p-6 hover:border-primary/50 hover:shadow-glow transition-all"
            >
              <div className="size-10 rounded-lg bg-gradient-primary grid place-items-center mb-4 shadow-glow">
                <f.icon className="size-5 text-primary-foreground" />
              </div>
              <h3 className="font-semibold mb-1">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Honest value band — no fabricated social proof */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <div className="rounded-xl border border-border bg-card/60 p-10 text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Try it on your own project
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            We don't run paid reviews or testimonials. Instead of taking our word
            for it, upload a project and see the diffs, health score, and
            workspace tools yourself — free to start.
          </p>
          <a
            href="/auth"
            className="mt-8 inline-flex items-center justify-center rounded-md bg-gradient-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-glow"
          >
            Start free
          </a>
        </div>
      </section>

      {/* Pricing preview */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Simple, fair pricing</h2>
          <p className="mt-3 text-muted-foreground">Start free. Upgrade when you're ready.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <PricingCard
            name="Free"
            price="$0"
            tagline="Perfect to get started"
            features={[
              "15 questions per 24 hours",
              "Beginner mode",
              "Chat history",
              "Coding explanations",
            ]}
            cta={
              <Button variant="outline" className="w-full" asChild>
                <Link to="/auth">Start free</Link>
              </Button>
            }
          />
          <PricingCard
            name="Pro"
            price="$5"
            period="/ month"
            highlight
            tagline="For serious learners"
            features={[
              "5,000 questions/month",
              "Deep Learning + Research mode",
              "Project Mentor mode",
              "Voice, file & image uploads",
              "Unlimited history",
              "Priority responses",
            ]}
            cta={
              <Button
                className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow"
                asChild
              >
                <Link to="/pricing">Upgrade to Pro</Link>
              </Button>
            }
          />
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 py-20">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Frequently asked questions
          </h2>
        </div>
        <div className="space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="rounded-xl border border-border bg-card/60 p-5 group">
              <summary className="font-medium cursor-pointer flex justify-between items-center">
                {f.q}
                <span className="text-muted-foreground group-open:rotate-45 transition-transform">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link to="/faq" className="text-sm text-primary hover:underline">
            See all FAQs →
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <div className="rounded-2xl border border-border bg-card/60 p-12 shadow-elegant relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-hero pointer-events-none" />
          <div className="relative">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Ready to ship faster?</h2>
            <p className="mt-3 text-muted-foreground">
              Create a free account and upload your first project in seconds.
            </p>
            <Button
              size="lg"
              className="mt-8 bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow"
              asChild
            >
              <Link to={isAuthenticated ? "/dashboard" : "/auth"}>
                <Sparkles className="size-4 mr-2" />{" "}
                {isAuthenticated ? "Open dashboard" : "Get started"}
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}

function PricingCard({
  name,
  price,
  period,
  tagline,
  features,
  cta,
  highlight,
}: {
  name: string;
  price: string;
  period?: string;
  tagline: string;
  features: string[];
  cta: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`relative rounded-2xl border bg-card/60 p-7 ${highlight ? "border-primary/60 shadow-glow" : "border-border"}`}
    >
      {highlight && (
        <div className="absolute -top-3 left-7 text-xs font-semibold px-2.5 py-1 rounded-full bg-gradient-primary text-primary-foreground">
          Most popular
        </div>
      )}
      <h3 className="text-xl font-semibold">{name}</h3>
      <p className="text-sm text-muted-foreground mt-1">{tagline}</p>
      <div className="mt-5 flex items-baseline gap-1">
        <span className="text-4xl font-bold tracking-tight">{price}</span>
        {period && <span className="text-muted-foreground text-sm">{period}</span>}
      </div>
      <ul className="mt-6 space-y-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <Check className="size-4 mt-0.5 text-accent shrink-0" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-7">{cta}</div>
    </div>
  );
}
