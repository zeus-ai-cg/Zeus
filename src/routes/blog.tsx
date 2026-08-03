import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingLayout, PageHero } from "@/components/MarketingLayout";
import { ArrowRight } from "lucide-react";
import { SITE_URL } from "@/lib/site";

export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Blog — Zeus AI" },
      {
        name: "description",
        content: "Tutorials, learning guides, and product updates from the Zeus AI team.",
      },
      { property: "og:title", content: "Blog — Zeus AI" },
      {
        property: "og:description",
        content: "Tutorials, learning guides, and product updates from the Zeus AI team.",
      },
      { property: "og:url", content: `${SITE_URL}/blog` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/blog` }],
  }),
  component: Blog,
});

const POSTS = [
  {
    slug: "learn-python-from-zero",
    title: "How to learn Python from absolute zero",
    date: "Jun 2026",
    excerpt:
      "A structured 6-week roadmap for complete beginners, designed around the way the brain actually learns.",
  },
  {
    slug: "debugging-mindset",
    title: "The debugging mindset every junior dev needs",
    date: "May 2026",
    excerpt:
      "Why reading errors carefully is the single most important skill — and how to train it.",
  },
  {
    slug: "system-design-interviews",
    title: "System design interviews: a starter framework",
    date: "Apr 2026",
    excerpt:
      "A practical 5-step approach to any system design question, from URL shorteners to social feeds.",
  },
  {
    slug: "ai-pair-programming",
    title: "Pair programming with an AI mentor",
    date: "Mar 2026",
    excerpt:
      "How to get the most out of Zeus AI: prompts, modes, and habits that compound over time.",
  },
];

function Blog() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Blog"
        title="Learn, build, ship."
        subtitle="Tutorials, deep dives, and product updates from the Zeus AI team."
      />
      <section className="max-w-4xl mx-auto px-6 py-16 grid sm:grid-cols-2 gap-5">
        {POSTS.map((p) => (
          <article
            key={p.slug}
            className="rounded-xl border border-border bg-card/60 p-6 hover:border-primary/50 transition-colors"
          >
            <div className="text-xs text-muted-foreground">{p.date}</div>
            <h2 className="mt-2 text-lg font-semibold">{p.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{p.excerpt}</p>
            <div className="mt-4 text-sm text-primary inline-flex items-center gap-1 opacity-70">
              Coming soon <ArrowRight className="size-3.5" />
            </div>
          </article>
        ))}
      </section>
      <section className="max-w-3xl mx-auto px-6 pb-20 text-center text-sm text-muted-foreground">
        Want a topic covered?{" "}
        <Link to="/contact" className="text-primary hover:underline">
          Suggest one →
        </Link>
      </section>
    </MarketingLayout>
  );
}
