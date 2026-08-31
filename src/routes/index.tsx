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
  AppWindow,
  Blocks,
  FolderTree,
  Wand2,
  Play,
  Monitor,
  Terminal,
  Diff,
  Gauge,
  GitBranch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/lib/auth-session";
import heroImg from "@/assets/codemaster-hero.jpg";
import { MarketingLayout } from "@/components/MarketingLayout";
import { SITE_URL } from "@/lib/site";
import { useState } from "react";

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

const howItWorks = [
  {
    icon: FolderTree,
    title: "Upload your project",
    desc: "Drop in a project ZIP (or connect from the Workspace) and Zeus AI indexes its structure, framework and dependencies.",
  },
  {
    icon: MessageSquare,
    title: "Chat & analyze",
    desc: "Ask where something lives, how it works, or what's risky — grounded in your actual code.",
  },
  {
    icon: GitBranch,
    title: "Review & ship",
    desc: "Get real diffs, a health score and generated commits you can review, roll back or export.",
  },
];

const featureGenPoints = [
  "New files, routes and logic generated in one click",
  "Wired into your existing project structure",
  "Review the full diff before anything is applied",
  "Roll back and export the result as a ZIP",
];

const capabilities = [
  {
    icon: Gauge,
    title: "Health Score",
    desc: "A project risk score that flags problems before you ship.",
  },
  {
    icon: Diff,
    title: "Real diffs",
    desc: "Review, approve or roll back every change with a clear diff.",
  },
  {
    icon: Terminal,
    title: "Engineer Mode",
    desc: "Deeper, tool-using reasoning for ambitious refactors.",
  },
  {
    icon: GitBranch,
    title: "Git tools",
    desc: "Generate commit messages and PR descriptions from your changes.",
  },
  {
    icon: BookOpen,
    title: "Code review",
    desc: "Automated review of your codebase, framed around what matters.",
  },
  {
    icon: Languages,
    title: "BYOK & multi-model",
    desc: "Bring your own keys and pick the model that fits each task.",
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
              <Sparkles className="size-3 text-accent" /> Built by an indie developer
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

      {/* Real Workspace — wired to a genuine product screenshot */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            One workspace for your whole project
          </h2>
          <p className="mt-3 text-muted-foreground">
            A real screenshot of the Zeus AI workspace — project map, chat, diffs and health score
            in one place.
          </p>
        </div>
        <ScreenshotFrame
          src="/screenshots/workspace.png"
          alt="Zeus AI Workspace"
          caption="The Workspace: upload a project, then analyze, chat and modify it in one view."
        />
      </section>

      {/* How Zeus works with your project */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <div className="grid md:grid-cols-3 gap-4">
          {howItWorks.map((step, i) => (
            <div key={step.title} className="rounded-xl border border-border bg-card/60 p-6">
              <div className="flex items-center gap-3 mb-3">
                <span className="grid size-8 place-items-center rounded-lg bg-gradient-primary text-sm font-bold text-primary-foreground shadow-glow">
                  {i + 1}
                </span>
                <step.icon className="size-5 text-accent" />
              </div>
              <h3 className="font-semibold mb-1">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.desc}</p>
            </div>
          ))}
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

      {/* Feature Generator — real screenshot split section */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs text-muted-foreground mb-6">
              <Wand2 className="size-3 text-accent" /> Feature Generator
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Generate real features, wired into your project
            </h2>
            <p className="mt-4 text-muted-foreground">
              Describe a feature and Zeus AI generates the files, routes and logic in one click —
              then lets you review the diff before anything touches your codebase.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm">
              {featureGenPoints.map((p) => (
                <li key={p} className="flex items-start gap-2">
                  <Check className="size-4 mt-0.5 text-accent shrink-0" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <Button
              className="mt-8 bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow"
              asChild
            >
              <Link to={isAuthenticated ? "/dashboard" : "/auth"}>Try Feature Generator</Link>
            </Button>
          </div>
          <div>
            <ScreenshotFrame
              src="/screenshots/feature-generator.png"
              alt="Zeus AI Feature Generator"
              caption="One-click feature generation, then review before you ship."
            />
          </div>
        </div>
      </section>

      {/* AI engineering capabilities */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Engineer-grade AI, built for real codebases
          </h2>
          <p className="mt-3 text-muted-foreground">
            Beyond chatting — Zeus AI reviews, diffs, maps and ships against your actual project.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {capabilities.map((c) => (
            <div
              key={c.title}
              className="rounded-xl border border-border bg-card/60 p-6 hover:border-primary/50 hover:shadow-glow transition-all"
            >
              <div className="size-10 rounded-lg bg-gradient-primary grid place-items-center mb-4 shadow-glow">
                <c.icon className="size-5 text-primary-foreground" />
              </div>
              <h3 className="font-semibold mb-1">{c.title}</h3>
              <p className="text-sm text-muted-foreground">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Desktop + VS Code */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <div className="grid md:grid-cols-2 gap-5">
          <PlatformCard
            icon={<AppWindow className="size-5 text-primary-foreground" />}
            title="Zeus AI Desktop"
            desc="The full Workspace as a native Windows app — no browser tabs, no setup, updates itself."
            cta={{ label: "Download for free", to: "/download" }}
          />
          <PlatformCard
            icon={<Blocks className="size-5 text-primary-foreground" />}
            title="Zeus AI for VS Code"
            desc="Engineer Mode and chat side by side with your editor. Included with Pro and Ultimate."
            cta={{ label: "Get the extension", to: "/download" }}
          />
        </div>
      </section>

      {/* Demo video — wired to a real recording */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">See it in action</h2>
          <p className="mt-3 text-muted-foreground">
            A short walkthrough of Engineer Mode and project chat on a real codebase.
          </p>
        </div>
        <DemoVideo />
      </section>

      {/* Honest value band — no fabricated social proof */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <div className="rounded-xl border border-border bg-card/60 p-10 text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Try it on your own project
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            We don't run paid reviews or testimonials. Instead of taking our word for it, upload a
            project and see the diffs, health score, and workspace tools yourself — free to start.
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

function ScreenshotFrame({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <figure className="relative">
      <div className="absolute -inset-8 bg-gradient-hero blur-3xl pointer-events-none opacity-60" />
      {failed ? (
        <div className="relative rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
          {errorMessage(alt)}
        </div>
      ) : (
        <>
          <img
            src={src}
            alt={alt}
            loading="lazy"
            onError={() => setFailed(true)}
            className="relative rounded-2xl border border-border shadow-elegant w-full h-auto"
          />
          {caption && (
            <figcaption className="mt-3 text-center text-sm text-muted-foreground">
              {caption}
            </figcaption>
          )}
        </>
      )}
    </figure>
  );
}

function errorMessage(alt: string) {
  return (
    <>
      <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Monitor className="size-6" />
      </div>
      <div className="text-sm font-medium">Screenshot coming soon</div>
      <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
        We&apos;re about to add a real {alt.toLowerCase()} capture here. This space is already wired
        to load it the moment it&apos;s live.
      </p>
    </>
  );
}

function DemoVideo() {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Play className="size-6" />
        </div>
        <div className="text-sm font-medium">Demo video coming soon</div>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
          We&apos;re recording a real walkthrough of Engineer Mode and project chat. This section is
          already wired to play it the moment the file is added.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-border shadow-elegant relative bg-black">
      <video
        src="/videos/20260831-1031-32.9651873.mp4"
        controls
        preload="metadata"
        playsInline
        onError={() => setFailed(true)}
        className="block w-full h-auto max-h-[72vh] object-contain mx-auto"
      />
    </div>
  );
}

function PlatformCard({
  icon,
  title,
  desc,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  cta: { label: string; to: string };
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-7 flex flex-col">
      <div className="size-11 rounded-lg bg-gradient-primary grid place-items-center shadow-glow">
        {icon}
      </div>
      <h3 className="mt-4 text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground flex-1">{desc}</p>
      <Button variant="outline" className="mt-6" asChild>
        <Link to={cta.to}>{cta.label}</Link>
      </Button>
    </div>
  );
}
