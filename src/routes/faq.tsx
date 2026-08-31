import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingLayout, PageHero } from "@/components/MarketingLayout";
import { SITE_URL } from "@/lib/site";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ — Zeus AI" },
      {
        name: "description",
        content:
          "Frequently asked questions about Zeus AI: how it works, pricing, refunds, and support.",
      },
      { property: "og:title", content: "FAQ — Zeus AI" },
      {
        property: "og:description",
        content:
          "Frequently asked questions about Zeus AI: how it works, pricing, refunds, and support.",
      },
      { property: "og:url", content: `${SITE_URL}/faq` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/faq` }],
  }),
  component: FAQ,
});

const FAQS = [
  {
    q: "How does Zeus AI work?",
    a: "Zeus AI is an AI Software Engineering Workspace. You upload a project and it's indexed — structure, entry points, framework and dependencies — then you can chat with your codebase, get AI code review with a Health Score, generate features, and ship real reviewable diffs.",
  },
  {
    q: "How many free questions do I get?",
    a: "Every free account includes 15 questions per 24 hours. The counter resets automatically — no manual action needed. This is enough for most learners to make daily progress.",
  },
  {
    q: "What happens after I use my 15 questions?",
    a: "You can wait for your free quota to reset (within 24 hours), or upgrade to Pro for a much higher monthly limit (5,000 requests/month) plus unlimited Engineer Mode, AI Code Review with Health Score, and the VS Code extension.",
  },
  {
    q: "How do I upgrade to Pro?",
    a: "Open Settings → Billing or visit the Pricing page and click Upgrade to Pro. You'll be guided through secure checkout. Pro access is activated instantly after payment.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel with one click from the Billing dashboard. You keep Pro access until the end of your current billing period, then no further charges.",
  },
  {
    q: "How do refunds work?",
    a: "We offer a 30-day money-back guarantee on first-time Pro subscriptions. Email zeus.ai328@gmail.com within 30 days of your charge. Refunds are processed within 5–10 business days.",
  },
  {
    q: "Is my data safe?",
    a: "Yes. All traffic uses HTTPS, data is encrypted at rest, and we enforce row-level security per account. Bring-your-own API keys are encrypted with AES-256-GCM and only decrypted server-side during a request. We never sell your data. See our Privacy Policy for details.",
  },
  {
    q: "Can I bring my own model?",
    a: "Yes. Zeus AI ships with Google Gemini built in (with Ox Alpha as the fallback), and you can connect your own keys for OpenAI, Anthropic Claude, OpenRouter, Groq, DeepSeek, Mistral, or Ox Alpha from Settings.",
  },
  {
    q: "Does it really understand my project?",
    a: "When you upload a project, Zeus AI indexes it first — structure, entry points, framework and dependencies — so chat, code review and feature generation reason against your actual codebase, not guesses.",
  },
  {
    q: "How do I contact support?",
    a: "Email zeus.ai328@gmail.com or use the form on our Contact page. We respond within 24–48 hours.",
  },
];

function FAQ() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="FAQ"
        title="Frequently asked questions"
        subtitle="Everything you need to know about Zeus AI."
      />
      <section className="max-w-3xl mx-auto px-6 py-16 space-y-3">
        {FAQS.map((f) => (
          <details key={f.q} className="rounded-xl border border-border bg-card/60 p-5 group">
            <summary className="font-medium cursor-pointer flex justify-between items-center gap-4">
              <span>{f.q}</span>
              <span className="text-muted-foreground group-open:rotate-45 transition-transform text-xl">
                +
              </span>
            </summary>
            <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
          </details>
        ))}
        <div className="text-center pt-8 text-sm text-muted-foreground">
          Still have questions?{" "}
          <Link to="/contact" className="text-primary hover:underline">
            Contact us →
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
