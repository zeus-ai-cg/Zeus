import { createFileRoute } from "@tanstack/react-router";
import { MarketingLayout, PageHero, Prose } from "@/components/MarketingLayout";
import { SITE_URL } from "@/lib/site";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Zeus AI" },
      {
        name: "description",
        content:
          "How Zeus AI collects, uses, and protects your data. GDPR-friendly, transparent, and built with privacy by design.",
      },
      { property: "og:title", content: "Privacy Policy — Zeus AI" },
      {
        property: "og:description",
        content:
          "How Zeus AI collects, uses, and protects your data. GDPR-friendly, transparent, and built with privacy by design.",
      },
      { property: "og:url", content: `${SITE_URL}/privacy` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/privacy` }],
  }),
  component: Privacy,
});

function Privacy() {
  const updated = "August 31, 2026";
  return (
    <MarketingLayout>
      <PageHero eyebrow="Legal" title="Privacy Policy" subtitle={`Last updated: ${updated}`} />
      <Prose>
        <p>
          Zeus AI ("Zeus AI", "we", "us", "our") provides an AI Software Engineering Workspace. This
          Privacy Policy explains what information we collect when you use Zeus AI, why we collect
          it, how it's protected, who we share it with, and the rights you have over it. By using
          Zeus AI you agree to the practices described here.
        </p>

        <h2>1. Information we collect</h2>
        <h3>1.1 Account information</h3>
        <ul>
          <li>
            Your email address, associated with your account via Google Authentication (Sign in with
            Google, handled by Supabase Auth).
          </li>
          <li>
            Your display name, and any optional profile fields you choose to add (full name, age,
            nationality, avatar image).
          </li>
          <li>Your subscription plan (Free, Pro, or Ultimate) and billing status.</li>
        </ul>
        <h3>1.2 Conversation history</h3>
        <ul>
          <li>
            The messages, prompts, and questions you send to Zeus AI, and the AI's responses, stored
            so you can revisit past conversations ("threads").
          </li>
          <li>Saved code snippets you explicitly choose to bookmark.</li>
        </ul>
        <h3>1.3 Uploaded images and files</h3>
        <ul>
          <li>
            Images (e.g. screenshots of code, error messages, or UI mockups), project ZIPs, and
            text/code/PDF files you attach to a conversation or upload to the Workspace. These are
            sent to the AI provider processing your request so the AI can read and respond to them,
            and the resulting conversation (including the attachment) is stored in your account in
            the same way as text messages.
          </li>
        </ul>
        <h3>1.4 Usage data and analytics</h3>
        <ul>
          <li>
            Request counts and timestamps, used to enforce the free-plan limit (15 questions / 24
            hours) and the Zeus AI Pro Fair Usage Policy (see our{" "}
            <a href="/terms">Terms of Service</a>).
          </li>
          <li>
            Workspace activity such as your chosen model provider and project usage — used only to
            power in-app features like your dashboard.
          </li>
          <li>
            Basic technical metadata (e.g. request timestamps, coarse error logs) used for security,
            debugging, and abuse prevention. We do not use third-party advertising trackers or sell
            any usage data.
          </li>
        </ul>

        <h2>2. AI processing disclaimer</h2>
        <p>
          When you send a message, Zeus AI forwards your conversation (including any attached
          images, files, or uploaded project data) to an AI provider to generate a response. By
          default this is Google's Gemini API, with Ox Alpha used as the fallback provider. If you
          connect your own model keys (Bring Your Own Key), your request is sent to whichever
          provider you selected. Each provider processes your content solely to return an answer to
          your prompt; see that provider's own privacy terms for how it handles API data.
          AI-generated responses may be inaccurate or incomplete — always verify anything important,
          especially code you plan to run or rely on. Zeus AI does not use your conversations to
          train third-party foundation models.
        </p>

        <h2>3. Cookies and local storage</h2>
        <p>
          We use strictly-necessary cookies and browser storage for authentication (maintaining your
          Supabase login session) and for lightweight UI preferences (like your light/dark theme
          choice), stored in your browser's local storage. We do not use third-party advertising or
          cross-site tracking cookies.
        </p>

        <h2>4. How we protect your data</h2>
        <ul>
          <li>All traffic is served over HTTPS/TLS.</li>
          <li>
            Data is encrypted at rest by our infrastructure providers (Supabase/Postgres, Vercel).
          </li>
          <li>
            Row Level Security (RLS) policies in our database ensure your profile, conversations,
            and files are only ever readable by your own account.
          </li>
          <li>
            API keys and secrets are stored as environment variables in our hosting provider, never
            committed to source code.
          </li>
          <li>
            Bring-your-own (BYOK) model keys are encrypted at rest with AES-256-GCM and decrypted
            only in server memory for the duration of a request; we store only the last four digits
            of each key, and the raw key is never returned to your browser.
          </li>
          <li>Access to production data is limited to what's operationally necessary.</li>
        </ul>

        <h2>5. Third-party services we use</h2>
        <p>We share the minimum data necessary with the following providers to operate Zeus AI:</p>
        <ul>
          <li>
            <strong>Supabase</strong> — database, authentication, and storage. Hosts your account,
            profile, and conversation data.
          </li>
          <li>
            <strong>Google</strong> — Google Sign-In (authentication) and the Gemini API (the
            default AI model that generates responses to your prompts, including analyzing any
            images/files you attach). We also use Ox Alpha as a fallback provider.
          </li>
          <li>
            <strong>Bring-your-own providers</strong> — if you add your own keys, requests may
            additionally be routed to OpenAI, Anthropic Claude, OpenRouter, Groq, DeepSeek, Mistral,
            or Ox Alpha according to the provider you select.
          </li>
          <li>
            <strong>Lemon Squeezy</strong> — our payment processor for Zeus AI Pro and Ultimate
            subscriptions. Lemon Squeezy handles your payment details directly; we never see or
            store your full card number.
          </li>
          <li>
            <strong>Vercel</strong> — application hosting for zeusai's website and API.
          </li>
        </ul>
        <p>We do not sell your personal data to anyone, for any purpose.</p>

        <h2>6. Data retention</h2>
        <p>
          We retain your account and conversation data for as long as your account is active, so
          your chat history remains available to you. If you delete your account, we delete your
          personal data — profile, threads, messages, and saved snippets — within 30 days, except
          where a short retention is required for legal, tax, fraud-prevention, or billing-record
          purposes.
        </p>

        <h2>7. Data deletion requests</h2>
        <p>
          You can request deletion of your account and associated data at any time from{" "}
          <strong>Settings → Delete account</strong>, or by emailing{" "}
          <a href="mailto:zeus.ai328@gmail.com">zeus.ai328@gmail.com</a> with the subject line "Data
          deletion request" from the email address on your account. We will confirm and process the
          request within 30 days.
        </p>

        <h2>8. Your rights</h2>
        <p>
          Depending on your location (including under GDPR, UK GDPR, and similar laws), you have the
          right to:
        </p>
        <ul>
          <li>
            <strong>Access</strong> — request a copy of the personal data we hold about you.
          </li>
          <li>
            <strong>Correction</strong> — fix inaccurate or incomplete data, most of which you can
            edit yourself in Settings.
          </li>
          <li>
            <strong>Deletion</strong> — request full account and data deletion (see §7).
          </li>
          <li>
            <strong>Portability</strong> — request your data in a machine-readable format.
          </li>
          <li>
            <strong>Objection / restriction</strong> — object to or ask us to limit certain
            non-essential processing.
          </li>
        </ul>
        <p>
          To exercise any of these rights, email{" "}
          <a href="mailto:zeus.ai328@gmail.com">zeus.ai328@gmail.com</a>. We respond within 30 days.
        </p>

        <h2>9. Children's privacy</h2>
        <p>
          Zeus AI is not directed at children under 13, and we do not knowingly collect personal
          data from children under 13.
        </p>

        <h2>10. International data transfers</h2>
        <p>
          Our infrastructure providers (Supabase, Google, Lemon Squeezy, Vercel) may process data in
          regions other than your own. Where required, we rely on Standard Contractual Clauses or
          equivalent safeguards for such transfers.
        </p>

        <h2>11. Changes to this policy</h2>
        <p>
          We may update this Privacy Policy as Zeus AI evolves. We'll update the "Last updated" date
          above, and for material changes we'll make a reasonable effort to notify you by email or
          in-app notice. Continuing to use Zeus AI after a change means you accept the updated
          policy.
        </p>

        <h2>12. Contact</h2>
        <p>
          Questions about this policy or your data? Email{" "}
          <a href="mailto:zeus.ai328@gmail.com">zeus.ai328@gmail.com</a>.
        </p>
      </Prose>
    </MarketingLayout>
  );
}
