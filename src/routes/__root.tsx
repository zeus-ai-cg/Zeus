import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { getDesktopAuthBridge } from "@/lib/desktop-auth";
import { resetAuthSessionCache } from "@/lib/auth-session";
import { ThemeProvider } from "@/lib/theme";
import { SITE_URL } from "@/lib/site";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-gradient">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          That route doesn't exist. Let's get you back on track.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-gradient-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },

      // Primary SEO
      { title: "Zeus AI – AI Programming Tutor & Coding Assistant | Learn to Code Faster" },
      {
        name: "description",
        content:
          "Zeus AI is your personal AI programming tutor and coding assistant. Get step-by-step code explanations, instant debugging help, and hands-on guidance to learn to code and build software faster.",
      },
      {
        name: "keywords",
        content:
          "Zeus AI, AI programming tutor, AI coding assistant, learn to code with AI, AI code tutor, AI debugging tool, AI software engineer, coding chatbot, learn programming online, AI for developers, code explanation AI, JavaScript AI tutor, Python AI tutor",
      },
      { name: "author", content: "Zeus AI" },
      { name: "robots", content: "index, follow" },
      { name: "googlebot", content: "index, follow" },
      { name: "theme-color", content: "#0f172a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Zeus AI" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },

      // Google Search Console Verification
      {
        name: "google-site-verification",
        content: "zeqBrAPpht9cGKQQ_ntlucUz_QZz3yloSzrK81EZ4E4",
      },

      // Open Graph
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Zeus AI" },
      { property: "og:url", content: SITE_URL },
      { property: "og:locale", content: "en_US" },
      {
        property: "og:title",
        content: "Zeus AI – AI Programming Tutor & Coding Assistant",
      },
      {
        property: "og:description",
        content:
          "Learn to code faster with Zeus AI — an AI-powered programming tutor that explains concepts, debugs errors, and helps you build real software with confidence.",
      },
      { property: "og:image", content: `${SITE_URL}/og-image.png` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Zeus AI – AI Programming Tutor & Coding Assistant" },

      // Twitter
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:title",
        content: "Zeus AI – AI Programming Tutor & Coding Assistant",
      },
      {
        name: "twitter:description",
        content:
          "Your personal AI programming tutor. Learn to code, debug errors, and understand projects faster with Zeus AI.",
      },
      { name: "twitter:image", content: `${SITE_URL}/og-image.png` },
    ],

    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "canonical", href: SITE_URL },
      // start_url: "/chat" — reopening Zeus AI as an installed/home-screen
      // app launches straight into chat, not the marketing page or Dashboard.
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('zeus-theme')||'dark';var r=document.documentElement;r.classList.remove('dark','light');r.classList.add(t);r.style.colorScheme=t;}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (
        event !== "INITIAL_SESSION" &&
        event !== "SIGNED_IN" &&
        event !== "SIGNED_OUT" &&
        event !== "USER_UPDATED"
      )
        return;
      resetAuthSessionCache();
      router.invalidate();
      queryClient.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router, queryClient]);

  // Desktop shell: the main process completes Google sign-in in the system
  // browser and hands the session back over IPC (zeusai:// deep link). Apply
  // it to the existing Supabase client on ANY page — the same localStorage
  // session the web app uses, so "stay signed in" works identically.
  useEffect(() => {
    const desktop = getDesktopAuthBridge();
    if (!desktop) return;

    let mounted = true;
    const apply = async (result: { access_token?: string } | null) => {
      if (!mounted || !result || typeof result.access_token !== "string") return;
      await supabase.auth.setSession(result as Session);
      // setSession fires SIGNED_IN -> the onAuthStateChange listener above
      // resets caches and invalidates the router automatically.
    };

    desktop.getPendingSession().then(apply);
    const unsubscribe = desktop.onSessionReady(apply);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Outlet />
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
