import { createFileRoute } from "@tanstack/react-router";
import { MarketingLayout, PageHero } from "@/components/MarketingLayout";
import { Target, Eye, Heart, Sparkles, Globe, Shield, BookOpen, Users } from "lucide-react";
import { SITE_URL } from "@/lib/site";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Zeus AI" },
      {
        name: "description",
        content:
          "Zeus AI is an AI Software Engineering Workspace on a mission to help developers understand, modify, and ship real codebases faster.",
      },
      { property: "og:title", content: "About — Zeus AI" },
      {
        property: "og:description",
        content:
          "Zeus AI is an AI Software Engineering Workspace on a mission to help developers understand, modify, and ship real codebases faster.",
      },
      { property: "og:url", content: `${SITE_URL}/about` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/about` }],
  }),
  component: About,
});

const values = [
  {
    icon: BookOpen,
    title: "Understanding first",
    desc: "We optimize for a codebase you actually understand, not just code that runs.",
  },
  {
    icon: Globe,
    title: "Accessible to every team",
    desc: "Bring your own project, your own keys — no gatekeeping.",
  },
  {
    icon: Heart,
    title: "Built for real projects",
    desc: "Shipping software is hard. We meet your codebase where it is.",
  },
  {
    icon: Shield,
    title: "Trust & honesty",
    desc: "Transparent pricing, secure data handling, and accurate review feedback.",
  },
];

const features = [
  {
    icon: Sparkles,
    title: "Whole-codebase context",
    desc: "Indexes your project's structure, framework, and dependencies.",
  },
  {
    icon: Users,
    title: "Feature Generator & Review",
    desc: "Generates features and reviews code like a senior engineer would.",
  },
  {
    icon: BookOpen,
    title: "Git & PR tooling",
    desc: "Commits, PR descriptions, and documentation generated from your changes.",
  },
];

function About() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="About us"
        title="An AI software engineer for every team"
        subtitle="Zeus AI is an AI Software Engineering Workspace — built to help developers understand, modify, and ship real codebases faster."
      />

      <section className="max-w-5xl mx-auto px-6 py-16 grid md:grid-cols-2 gap-5">
        <Block icon={<Target className="size-5" />} title="Our mission">
          Make working with real, complex codebases faster and safer — regardless of stack, team
          size, or budget. Every developer deserves an AI engineer they can trust.
        </Block>
        <Block icon={<Eye className="size-5" />} title="Our vision">
          A world where any developer can upload a project, understand it deeply, and ship changes
          with confidence — with an AI software engineer by their side.
        </Block>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-semibold mb-6">What Zeus AI does</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card/60 p-6">
              <div className="size-10 rounded-lg bg-gradient-primary grid place-items-center mb-4 shadow-glow text-primary-foreground">
                <f.icon className="size-5" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-semibold mb-6">Our core values</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {values.map((v) => (
            <div
              key={v.title}
              className="rounded-xl border border-border bg-card/60 p-6 flex gap-4"
            >
              <div className="size-10 rounded-lg bg-gradient-primary grid place-items-center shadow-glow text-primary-foreground shrink-0">
                <v.icon className="size-5" />
              </div>
              <div>
                <h3 className="font-semibold">{v.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{v.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </MarketingLayout>
  );
}

function Block({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-7">
      <div className="size-10 rounded-lg bg-gradient-primary grid place-items-center mb-3 shadow-glow text-primary-foreground">
        {icon}
      </div>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-muted-foreground">{children}</p>
    </div>
  );
}
