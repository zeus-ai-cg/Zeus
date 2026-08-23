import { createFileRoute } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import {
  AppWindow,
  Blocks,
  Check,
  Download,
  Loader2,
  Lock,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { MarketingLayout, PageHero } from "@/components/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { getMe } from "@/lib/profile.functions";
import { isDesktopShell } from "@/lib/desktop-auth";
import { normalizePlan, isProOrAbove, PLAN_LABELS } from "@/lib/plans";
import { SITE_URL } from "@/lib/site";
import { toast } from "sonner";

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Download Zeus AI — Desktop App & VS Code Extension" },
      {
        name: "description",
        content:
          "Get the Zeus AI desktop app for Windows (free for everyone) and the Zeus AI VS Code extension (included with Pro and Ultimate). Both update automatically.",
      },
      { property: "og:title", content: "Download Zeus AI" },
      {
        property: "og:description",
        content:
          "Zeus AI desktop app and VS Code extension — one-click downloads with automatic updates.",
      },
      { property: "og:url", content: `${SITE_URL}/download` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/download` }],
  }),
  component: DownloadPage,
});

const getReleaseInfo = createServerFn({ method: "GET" }).handler(async () => ({
  desktopVersion: process.env.ZEUS_DESKTOP_VERSION ?? "",
  vsixVersion: process.env.ZEUS_VSIX_VERSION ?? "",
}));

function DownloadPage() {
  const releaseFn = useServerFn(getReleaseInfo);
  const meFn = useServerFn(getMe);

  // Inside the desktop shell the download page is pointless — the user is
  // ALREADY on the desktop app. Swap the whole page for a friendly notice.
  // The bridge only exists after hydration, so default false (SSR-safe).
  const [onDesktop, setOnDesktop] = useState(false);
  useEffect(() => {
    if (isDesktopShell()) setOnDesktop(true);
  }, []);

  const { data: release } = useQuery({
    queryKey: ["release-info"],
    queryFn: () => releaseFn(),
  });

  // Anonymous visitors have no Bearer token, so getMe throws — treat that as
  // "signed out". Any other shape means we know the caller's plan tier.
  const { data: profile, isLoading: planLoading } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await meFn();
      } catch {
        return null;
      }
    },
  });

  if (onDesktop) {
    return (
      <MarketingLayout>
        <section className="max-w-2xl mx-auto px-6 py-24 text-center">
          <div className="rounded-2xl border border-border bg-card/60 p-10">
            <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <AppWindow className="size-7" />
            </div>
            <h1 className="text-2xl font-bold">You're already using the Zeus AI Desktop app</h1>
            <p className="mt-3 text-muted-foreground">
              Downloads live here on the web — but you're inside the desktop app right now, and it
              keeps itself up to date automatically. Nothing to install.
            </p>
            <a
              href="/chat"
              className="mt-6 inline-flex items-center justify-center rounded-md bg-gradient-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-glow transition-transform hover:opacity-90 active:scale-[0.98]"
            >
              Open your workspace
            </a>
          </div>
        </section>
      </MarketingLayout>
    );
  }

  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Downloads"
        title="Get Zeus AI everywhere"
        subtitle="The desktop app is free for everyone. The VS Code extension ships with Pro and Ultimate. Both keep themselves up to date automatically."
      />

      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-2 gap-8">
          <DesktopCard version={release?.desktopVersion ?? ""} />
          <ExtensionCard
            version={release?.vsixVersion ?? ""}
            plan={profile ? normalizePlan(profile.plan) : null}
            loading={planLoading}
          />
        </div>

        <AutoUpdateStrip />
        <InstallGuide vsixVersion={release?.vsixVersion ?? ""} />
      </section>
    </MarketingLayout>
  );
}

function CardShell({
  icon,
  title,
  badge,
  version,
  description,
  features,
  children,
}: {
  icon: ReactNode;
  title: string;
  badge: string;
  version: string;
  description: string;
  features: string[];
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-8 flex flex-col">
      <div className="flex items-start justify-between">
        <div className="size-11 rounded-lg bg-gradient-primary grid place-items-center shadow-glow">
          {icon}
        </div>
        <Badge variant="secondary">{badge}</Badge>
      </div>
      <h2 className="mt-5 text-xl font-bold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{version}</p>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{description}</p>
      <ul className="mt-5 space-y-2.5 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Check className="size-4 mt-0.5 shrink-0 text-accent" />
            <span className="text-muted-foreground">{f}</span>
          </li>
        ))}
      </ul>
      <div className="flex-1 min-h-6" />
      {children}
    </div>
  );
}

function DesktopCard({ version }: { version: string }) {
  return (
    <CardShell
      icon={<AppWindow className="size-5 text-primary-foreground" />}
      title="Zeus AI Desktop"
      badge="Free · All plans"
      version={version ? `Windows 10/11 · v${version}` : "Windows 10/11"}
      description="The full AI Software Engineering Workspace as a native Windows app — chat, Engineer Mode, project context, snippets and workspace tools in one dedicated window. No browser tabs, no setup."
      features={[
        "One-click installer — no admin rights required",
        "Your plan, threads and usage stay in sync with the web app",
        "Runs alongside VS Code without slowing your editor",
        "Updates itself silently in the background",
      ]}
    >
      <div className="mt-6 space-y-3">
        <Button
          size="lg"
          className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow"
          asChild
        >
          <a href="/api/download/desktop">
            <Download className="size-4 mr-2" />
            Download for Windows (.exe)
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">
          Free forever plan included — no credit card needed.
        </p>
      </div>
    </CardShell>
  );
}

type ExtensionState = "idle" | "working";

function ExtensionCard({
  version,
  plan,
  loading,
}: {
  version: string;
  plan: ReturnType<typeof normalizePlan> | null;
  loading: boolean;
}) {
  const [state, setState] = useState<ExtensionState>("idle");

  async function downloadVsix() {
    setState("working");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        toast.error("Please sign in first.");
        setState("idle");
        return;
      }
      // Ask for JSON so the route hands back the artifact URL instead of a
      // 302 — following that redirect via fetch trips Supabase Storage CORS
      // and the old fallback re-hit this endpoint without the token.
      const res = await fetch("/api/download/vsix", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (res.status === 403 || res.status === 401) {
        toast.error("The VS Code extension is included with Pro and Ultimate plans.");
        setState("idle");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as { url?: string };
      if (!payload.url) throw new Error("no url");
      window.location.href = payload.url;
      toast.success("Extension download started — see install steps below.");
      setState("idle");
    } catch {
      toast.error("Couldn't start the download. Please try again.");
      setState("idle");
    }
  }

  const entitled = plan ? isProOrAbove(plan) : false;

  return (
    <CardShell
      icon={<Blocks className="size-5 text-primary-foreground" />}
      title="Zeus AI for VS Code"
      badge={
        plan === "ultimate" ? `${PLAN_LABELS[plan]} included` : "Pro & Ultimate exclusive"
      }
      version={version ? `Universal VSIX · v${version}` : "Universal VSIX"}
      description="Bring Zeus AI straight into your editor — Engineer Mode, project context, snippets and chat side by side with your code. Works standalone or together with the desktop app."
      features={[
        "Architect-grade answers without leaving the editor",
        "Shares your plan, limits and thread history with the web app",
        "Checks for updates on startup and nudges you when a new build ships",
        "New releases land for Pro & Ultimate first",
      ]}
    >
      <div className="mt-6 space-y-3">
        {loading ? (
          <Button size="lg" variant="outline" className="w-full" disabled>
            <Loader2 className="size-4 mr-2 animate-spin" /> Checking your plan…
          </Button>
        ) : entitled ? (
          <Button
            size="lg"
            className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow"
            onClick={downloadVsix}
            disabled={state === "working"}
          >
            {state === "working" ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <Download className="size-4 mr-2" />
            )}
            {state === "working" ? "Preparing…" : "Download extension (.vsix)"}
          </Button>
        ) : plan ? (
          <>
            <Button size="lg" variant="outline" className="w-full" disabled>
              <Lock className="size-4 mr-2" /> Available on Pro
            </Button>
            <p className="text-xs text-muted-foreground">
              Your current plan is {PLAN_LABELS[plan]}. Upgrade to unlock the extension — the
              desktop app stays free either way.
            </p>
          </>
        ) : (
          <>
            <Button size="lg" variant="outline" className="w-full" asChild>
              <a href="/auth">Sign in to check eligibility</a>
            </Button>
            <p className="text-xs text-muted-foreground">
              The extension is part of Pro &amp; Ultimate. Sign in and we&apos;ll check your plan
              instantly.
            </p>
          </>
        )}
      </div>
    </CardShell>
  );
}

function AutoUpdateStrip() {
  return (
    <div className="mt-12 rounded-xl border border-border bg-card/30 p-6 md:p-8">
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-lg bg-accent/15 grid place-items-center">
          <RefreshCw className="size-4 text-accent" />
        </div>
        <div>
          <h3 className="font-semibold tracking-tight">Automatic updates, zero effort</h3>
          <p className="text-sm text-muted-foreground">
            You never have to hunt for installers again.
          </p>
        </div>
      </div>
      <div className="mt-5 grid md:grid-cols-2 gap-6 text-sm">
        <ul className="space-y-2 text-muted-foreground">
          <li className="flex items-start gap-2.5">
            <Sparkles className="size-4 mt-0.5 shrink-0 text-accent" />
            Desktop app checks our update feed on launch and applies new versions in the
            background.
          </li>
          <li className="flex items-start gap-2.5">
            <Sparkles className="size-4 mt-0.5 shrink-0 text-accent" />
            Security fixes ship the moment they&apos;re ready — no manual reinstalls.
          </li>
        </ul>
        <ul className="space-y-2 text-muted-foreground">
          <li className="flex items-start gap-2.5">
            <Sparkles className="size-4 mt-0.5 shrink-0 text-accent" />
            VS Code extension checks its own feed at startup and tells you when a fresh build is
            out.
          </li>
          <li className="flex items-start gap-2.5">
            <Sparkles className="size-4 mt-0.5 shrink-0 text-accent" />
            One click takes you back here, always to the latest verified release.
          </li>
        </ul>
      </div>
    </div>
  );
}

function InstallGuide({ vsixVersion }: { vsixVersion: string }) {
  return (
    <div id="install" className="mt-12 max-w-3xl mx-auto scroll-mt-24">
      <h3 className="text-lg font-bold tracking-tight">Installation guide</h3>
      <div className="mt-4 space-y-6 text-sm">
        <div>
          <h4 className="font-semibold">Desktop app</h4>
          <ol className="mt-2 list-decimal list-inside space-y-1.5 text-muted-foreground">
            <li>Click “Download for Windows” above.</li>
            <li>Run Zeus-AI-Setup.exe and follow the wizard.</li>
            <li>Sign in with your Zeus AI account — you’re done.</li>
          </ol>
        </div>
        <div>
          <h4 className="font-semibold">VS Code extension</h4>
          <ol className="mt-2 list-decimal list-inside space-y-1.5 text-muted-foreground">
            <li>Download the .vsix file (Pro &amp; Ultimate).</li>
            <li>
              Open a terminal and run:
              <pre className="mt-2 rounded-md border border-border bg-background px-4 py-2.5 text-xs overflow-x-auto">
                code --install-extension{" "}
                {vsixVersion ? `zeus-ai-${vsixVersion}.vsix` : "zeus-ai-x.y.z.vsix"}
              </pre>
            </li>
            <li>Reload VS Code, open the Command Palette and run “Zeus AI: Sign In”.</li>
          </ol>
        </div>
      </div>
      <p className="mt-8 text-xs text-muted-foreground">
        By downloading you agree to our{" "}
        <a href="/terms" className="text-primary underline-offset-2 hover:underline">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="/privacy" className="text-primary underline-offset-2 hover:underline">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}
