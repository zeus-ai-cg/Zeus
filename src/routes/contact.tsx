import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, Briefcase, Clock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MarketingLayout, PageHero } from "@/components/MarketingLayout";
import { toast } from "sonner";
import { SITE_URL } from "@/lib/site";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — Zeus AI" },
      {
        name: "description",
        content:
          "Get in touch with the Zeus AI team. Support and business inquiries answered within 24–48 hours.",
      },
      { property: "og:title", content: "Contact — Zeus AI" },
      {
        property: "og:description",
        content:
          "Get in touch with the Zeus AI team. Support and business inquiries answered within 24–48 hours.",
      },
      { property: "og:url", content: `${SITE_URL}/contact` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/contact` }],
  }),
  component: Contact,
});

function Contact() {
  const [sending, setSending] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSending(true);
    const form = new FormData(e.currentTarget);
    const subject = encodeURIComponent(`[Zeus AI] ${form.get("subject") ?? "Contact"}`);
    const body = encodeURIComponent(
      `Name: ${form.get("name")}\nEmail: ${form.get("email")}\n\n${form.get("message")}`,
    );
    window.location.href = `mailto:Haidersiddique0909@gmail.com?subject=${subject}&body=${body}`;
    setTimeout(() => {
      setSending(false);
      toast.success("Opening your email client…");
    }, 400);
  };

  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Contact"
        title="We'd love to hear from you"
        subtitle="Reach out with questions, feedback, or partnership ideas. We respond within 24–48 hours."
      />

      <section className="max-w-5xl mx-auto px-6 py-16 grid md:grid-cols-3 gap-5">
        <InfoCard
          icon={<Mail className="size-5" />}
          title="Support"
          value="Haidersiddique0909@gmail.com"
          href="mailto:Haidersiddique0909@gmail.com"
        />
        <InfoCard
          icon={<Briefcase className="size-5" />}
          title="Business"
          value="Haidersiddique0909@gmail.com"
          href="mailto:Haidersiddique0909@gmail.com"
        />
        <InfoCard icon={<Clock className="size-5" />} title="Response time" value="24–48 hours" />
      </section>

      <section className="max-w-2xl mx-auto px-6 pb-20">
        <div className="rounded-2xl border border-border bg-card/60 p-8">
          <h2 className="text-xl font-semibold">Send us a message</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Fill out the form and we'll get back to you shortly.
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Name">
                <Input name="name" required maxLength={100} placeholder="Jane Doe" />
              </Field>
              <Field label="Email">
                <Input
                  name="email"
                  type="email"
                  required
                  maxLength={255}
                  placeholder="you@example.com"
                />
              </Field>
            </div>
            <Field label="Subject">
              <Input name="subject" required maxLength={150} placeholder="How can we help?" />
            </Field>
            <Field label="Message">
              <Textarea
                name="message"
                required
                maxLength={2000}
                rows={6}
                placeholder="Tell us a bit about what you need…"
              />
            </Field>
            <Button
              type="submit"
              disabled={sending}
              className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow"
            >
              <Send className="size-4 mr-2" /> {sending ? "Sending…" : "Send message"}
            </Button>
          </form>
        </div>
        <p className="text-center text-sm text-muted-foreground mt-6">
          For common questions, check our{" "}
          <a href="/faq" className="text-primary hover:underline">
            FAQ
          </a>{" "}
          first.
        </p>
      </section>
    </MarketingLayout>
  );
}

function InfoCard({
  icon,
  title,
  value,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  href?: string;
}) {
  const Body = (
    <div className="rounded-xl border border-border bg-card/60 p-6 hover:border-primary/50 transition-colors">
      <div className="size-10 rounded-lg bg-gradient-primary grid place-items-center mb-3 shadow-glow text-primary-foreground">
        {icon}
      </div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
  return href ? <a href={href}>{Body}</a> : Body;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block text-sm">{label}</Label>
      {children}
    </div>
  );
}
