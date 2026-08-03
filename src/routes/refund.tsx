import { createFileRoute } from "@tanstack/react-router";
import { MarketingLayout, PageHero, Prose } from "@/components/MarketingLayout";
import { ShieldCheck, Clock, CreditCard, Mail } from "lucide-react";
import { SITE_URL } from "@/lib/site";

export const Route = createFileRoute("/refund")({
  head: () => ({
    meta: [
      { title: "Refund Policy — Zeus AI" },
      {
        name: "description",
        content:
          "Our 30-day money-back guarantee. Cancel anytime, no hidden fees. Refunds processed within 5–10 business days.",
      },
      { property: "og:title", content: "Refund Policy — Zeus AI" },
      {
        property: "og:description",
        content:
          "Our 30-day money-back guarantee. Cancel anytime, no hidden fees. Refunds processed within 5–10 business days.",
      },
      { property: "og:url", content: `${SITE_URL}/refund` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/refund` }],
  }),
  component: Refund,
});

function Refund() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Legal"
        title="Refund Policy"
        subtitle="We stand behind Zeus AI Pro with a 30-day money-back guarantee."
      />

      <section className="max-w-5xl mx-auto px-6 py-12 grid md:grid-cols-2 gap-5">
        <Highlight
          icon={<ShieldCheck className="size-5" />}
          title="30-day money-back guarantee"
          desc="If Zeus AI Pro isn't for you, email us within 30 days of your first Pro charge for a full refund — no questions asked."
        />
        <Highlight
          icon={<Clock className="size-5" />}
          title="Processed in 5–10 business days"
          desc="Refunds are returned to your original payment method via Lemon Squeezy, our payment processor."
        />
        <Highlight
          icon={<CreditCard className="size-5" />}
          title="No hidden fees"
          desc="Transparent monthly pricing. Cancel anytime and future billing stops immediately."
        />
        <Highlight
          icon={<Mail className="size-5" />}
          title="Request via email"
          desc="Send your request to Haidersiddique0909@gmail.com with your account email and reason (optional)."
        />
      </section>

      <Prose>
        <h2>Subscription cancellation</h2>
        <p>
          You can cancel your Zeus AI Pro subscription at any time from the in-app{" "}
          <strong>Billing</strong> page. After cancelling, you keep Pro access (including the higher
          Fair Usage Policy limits described in our <a href="/terms">Terms of Service</a>) until the
          end of the billing period you've already paid for, and no further charges are made.
          Cancelling does not delete your account or conversation history.
        </p>

        <h2>How to request a refund</h2>
        <ol>
          <li>
            Email <a href="mailto:Haidersiddique0909@gmail.com">Haidersiddique0909@gmail.com</a>{" "}
            from the address tied to your account.
          </li>
          <li>
            Include the subject line "Refund request" and, if you can, your reason (this helps us
            improve, but is optional).
          </li>
          <li>
            We'll confirm within 24–48 hours and submit the refund to Lemon Squeezy, our payment
            processor.
          </li>
          <li>
            Refunds typically appear on your statement within 5–10 business days, depending on your
            bank or card issuer.
          </li>
        </ol>

        <h2>Eligible refunds</h2>
        <ul>
          <li>
            The 30-day money-back guarantee applies to your <strong>first-time</strong> Zeus AI Pro
            subscription charge.
          </li>
          <li>
            Requests made within 30 days of that first charge are honored automatically, no
            questions asked.
          </li>
          <li>
            Refund requests for subsequent monthly renewals are evaluated case-by-case — reach out
            and we'll do our best to help.
          </li>
        </ul>

        <h2>Non-refundable situations</h2>
        <ul>
          <li>
            Requests made more than 30 days after your first Pro charge (for that initial-guarantee
            window) — later renewals are still handled case-by-case as above.
          </li>
          <li>
            Accounts terminated for violating our <a href="/terms">Terms of Service</a> (e.g. abuse,
            fraud, or Fair Usage Policy violations) are not eligible for a refund of the current
            billing period.
          </li>
          <li>
            Partial-month usage is not prorated for refund outside of the 30-day guarantee window —
            cancelling simply stops future renewals.
          </li>
        </ul>

        <h2>Processing time</h2>
        <p>
          Once we approve a refund, we submit it to Lemon Squeezy immediately. Lemon Squeezy
          typically returns funds to your original payment method within{" "}
          <strong>5–10 business days</strong>, though your bank or card issuer may take a few extra
          days to reflect it on your statement.
        </p>

        <h2>Lemon Squeezy payment handling</h2>
        <p>
          All Zeus AI Pro and Ultimate purchases are processed by <strong>Lemon Squeezy</strong>,
          our payment processor and merchant of record, over encrypted connections. Lemon Squeezy
          handles card processing, tax calculation, and receipts — we never see or store your full
          card number. Refunds are issued back through Lemon Squeezy to your original payment
          method.
        </p>

        <h2>Need help?</h2>
        <p>
          Questions before you subscribe, or about an existing charge? Visit our{" "}
          <a href="/faq">FAQ</a>, or email{" "}
          <a href="mailto:Haidersiddique0909@gmail.com">Haidersiddique0909@gmail.com</a>.
        </p>
      </Prose>
    </MarketingLayout>
  );
}

function Highlight({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-6 flex gap-4">
      <div className="size-10 rounded-lg bg-gradient-primary grid place-items-center shadow-glow text-primary-foreground shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground mt-1">{desc}</p>
      </div>
    </div>
  );
}
