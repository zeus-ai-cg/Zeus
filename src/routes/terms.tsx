import { createFileRoute } from "@tanstack/react-router";
import { MarketingLayout, PageHero, Prose } from "@/components/MarketingLayout";
import { SITE_URL } from "@/lib/site";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Zeus AI" },
      {
        name: "description",
        content:
          "The terms governing your use of Zeus AI, including acceptable use, subscriptions, and limitations.",
      },
      { property: "og:title", content: "Terms of Service — Zeus AI" },
      {
        property: "og:description",
        content:
          "The terms governing your use of Zeus AI, including acceptable use, subscriptions, and limitations.",
      },
      { property: "og:url", content: `${SITE_URL}/terms` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/terms` }],
  }),
  component: Terms,
});

function Terms() {
  return (
    <MarketingLayout>
      <PageHero eyebrow="Legal" title="Terms of Service" subtitle="Last updated: July 5, 2026" />
      <Prose>
        <h2>1. Acceptance of terms</h2>
        <p>
          By creating an account or otherwise accessing or using Zeus AI ("Zeus AI", "we", "us",
          "the Service"), you agree to be bound by these Terms of Service ("Terms"). If you don't
          agree to these Terms, please don't use the Service.
        </p>

        <h2>2. User accounts and responsibilities</h2>
        <ul>
          <li>You must be at least 13 years old to create an account.</li>
          <li>You must sign in with a valid Google account via our authentication provider.</li>
          <li>
            You are responsible for all activity on your account and for keeping your credentials
            secure.
          </li>
          <li>One account per person; sharing accounts or credentials may result in suspension.</li>
          <li>You are responsible for the accuracy of any information you provide us.</li>
        </ul>

        <h2>3. Acceptable use</h2>
        <p>
          Zeus AI is an educational tool for learning programming and building software. You agree
          to use it lawfully, respectfully, and only for its intended purpose. Specifically, you
          agree <strong>not</strong> to:
        </p>
        <ul>
          <li>
            Use the Service for any illegal purpose, or to generate content that violates applicable
            law or third-party rights.
          </li>
          <li>
            Abuse the AI — including attempting to generate malware, exploit code intended to cause
            harm, or content designed to bypass the safety behavior of the underlying AI model.
          </li>
          <li>
            Use automated scripts, bots, or scrapers to send bulk requests, harvest content, or
            otherwise interact with the Service or its APIs outside of normal, individual human use.
          </li>
          <li>
            Attempt to reverse-engineer, decompile, or extract the source code, prompts, or
            underlying models of the Service.
          </li>
          <li>
            Attempt to bypass, disable, or circumvent rate limits, the Fair Usage Policy (§5),
            authentication, or billing.
          </li>
          <li>
            Harass, abuse, or impersonate other users, or interfere with the operation of the
            Service for others.
          </li>
        </ul>
        <p>
          Violating this section may result in suspension or termination of your account (see §10).
        </p>

        <h2>4. Subscriptions and Zeus AI Pro/Ultimate billing</h2>
        <ul>
          <li>
            Zeus AI offers a free Standard plan (15 questions per 24-hour period), a paid Pro plan,
            and a paid Ultimate plan, billed monthly at the prices shown on our Pricing page.
          </li>
          <li>
            Pro and Ultimate subscriptions are processed and billed by{" "}
            <strong>Lemon Squeezy</strong>, our authorized payment processor and merchant of record.
            We never see or store your full card details.
          </li>
          <li>Subscriptions renew automatically each billing cycle until cancelled.</li>
          <li>
            You can cancel anytime from the in-app Billing page; you keep access until the end of
            the period you've already paid for, and no further charges are made.
          </li>
          <li>
            Applicable taxes may be added based on your billing location, calculated by Lemon
            Squeezy.
          </li>
        </ul>

        <h2>5. Zeus AI Pro Fair Usage Policy</h2>
        <p>
          Pro gives you a very high usage allowance so you can learn and build without worrying
          about counting questions — but it is not an unlimited or unmetered API. To keep the
          Service fast and reliable for every subscriber and to prevent automated abuse, Pro
          accounts are subject to a Fair Usage Policy:
        </p>
        <ul>
          <li>
            Pro accounts may send up to{" "}
            <strong>5,000 AI requests per rolling 30-day billing cycle</strong>.
          </li>
          <li>
            You'll see a friendly in-app notice once you cross 4,500 requests in a cycle, so there
            are no surprises.
          </li>
          <li>
            If you reach the 5,000-request limit, the Service pauses new AI requests until your
            usage resets automatically at the start of your next cycle — your account, subscription,
            and saved data are never affected.
          </li>
          <li>
            These limits exist to stop scripted or bot traffic from a single account monopolizing
            shared AI capacity meant for everyday learning and coding use. Legitimate individual use
            is very unlikely to come close to this limit.
          </li>
          <li>
            If your team or use case genuinely needs a higher limit, contact{" "}
            <a href="mailto:zeus.ai328@gmail.com">zeus.ai328@gmail.com</a> — we're
            happy to discuss it.
          </li>
        </ul>
        <p>
          We may adjust these numbers over time as the Service evolves; changes will be reflected on
          this page.
        </p>

        <h2>6. Refunds</h2>
        <p>
          Refund eligibility for Zeus AI Pro is governed by our <a href="/refund">Refund Policy</a>,
          which forms part of these Terms.
        </p>

        <h2>7. Intellectual property</h2>
        <p>
          We (and our licensors) own the Zeus AI product, brand, website, and underlying software,
          including its design, code, and trademarks. Subject to these Terms and our AI processing
          disclaimer in the <a href="/privacy">Privacy Policy</a>, you retain ownership of the
          prompts you submit and the AI responses generated for your account. You grant us a limited
          license to process, store, and transmit your content solely to operate, maintain, and
          improve the Service. You may not copy, resell, or redistribute the Service itself or its
          underlying software without our written permission.
        </p>

        <h2>8. AI output disclaimer</h2>
        <p>
          Zeus AI's responses are generated by an AI model and may be inaccurate, incomplete,
          biased, or out of date. Always review and test any code or advice before relying on it,
          especially in production or safety-critical contexts. Zeus AI is an educational tool and
          does not constitute professional engineering, legal, medical, or financial advice.
        </p>

        <h2>9. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, Zeus AI and its operators are not liable for any
          indirect, incidental, special, consequential, or exemplary damages, or for any loss of
          profits, data, business, or goodwill arising from your use of the Service. Our total
          aggregate liability for any claim relating to the Service is limited to the amount you
          paid us in the 12 months preceding the claim.
        </p>

        <h2>10. Account termination</h2>
        <p>
          You may delete your account at any time from Settings. We may suspend or terminate
          accounts that violate these Terms — including the Acceptable Use (§3) or Fair Usage Policy
          (§5) — with or without prior notice, at our discretion. On termination, your access ends
          and your data is deleted in accordance with our <a href="/privacy">Privacy Policy</a>.
        </p>

        <h2>11. Changes to the Service and these Terms</h2>
        <p>
          We may add, modify, or discontinue features at any time, and may update these Terms as the
          Service evolves. We'll make reasonable efforts to notify you of material changes.
          Continued use of Zeus AI after a change means you accept the updated Terms.
        </p>

        <h2>12. Governing law</h2>
        <p>
          These Terms are governed by the laws of the operator's jurisdiction, without regard to
          conflict-of-law principles. Any disputes arising from these Terms or the Service will be
          resolved in the competent courts of that jurisdiction, except where local
          consumer-protection law grants you other rights.
        </p>

        <h2>13. Contact</h2>
        <p>
          Questions about these Terms? Email{" "}
          <a href="mailto:zeus.ai328@gmail.com">zeus.ai328@gmail.com</a>.
        </p>
      </Prose>
    </MarketingLayout>
  );
}
