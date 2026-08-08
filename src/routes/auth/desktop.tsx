import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { mapAuthError } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Code2, Loader2 } from "lucide-react";

// Dedicated desktop handoff page.
//
// The Electron app opens the system browser here (instead of dropping the
// user straight into Google) so the user can explicitly authorize THIS
// device. This page:
//   - reuses the browser's existing Supabase session to detect "already
//     signed in" and requires an explicit device confirmation (CASE A),
//   - or lets the user sign in with email/password OR Google through the
//     existing Supabase client (CASE C),
//   - and only then redirects into the existing Supabase Google PKCE flow,
//     echoing the code_challenge the desktop main process generated. The
//     one-time code that Supabase redirects to zeusai://auth/callback is
//     exchanged by the desktop, never by this page. The confirmed account's
//     email is passed as login_hint so the same account is preselected.
//
// Normal web users never land here — it is only ever linked from the
// desktop app's OAuth entry point.

export const Route = createFileRoute("/auth/desktop")({
  head: () => ({
    meta: [
      { title: "Sign in to Zeus AI Desktop — Zeus AI" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DesktopAuthPage,
});

const DESKTOP_CALLBACK_URL = "zeusai://auth/callback";
const DESKTOP_CANCEL_URL = "zeusai://auth/cancel";

function getSupabaseAuthBase(): string {
  // Same resolution as src/integrations/supabase/client.ts (VITE_ var is
  // inlined at build time; process.env only matters for SSR).
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || process.env.SUPABASE_URL;
  return (url ?? "").replace(/\/+$/, "");
}

// Rebuilds the exact authorize URL the desktop main process used to open
// directly — but with the code_challenge the desktop generated, so its
// verifier (which never leaves the Electron main process) can exchange the
// returned code. redirect_to is fixed to the desktop deep link, never taken
// from the URL. When a confirmed account email is known (CASE A / confirmed
// password sign-in), it is passed as login_hint so Google preselects that
// SAME account — a different account is never silently selected. GoTrue
// forwards these params to the provider's auth URL.
function buildAuthorizeUrl(challenge: string, loginHint?: string): string {
  const params = new URLSearchParams({
    provider: "google",
    redirect_to: DESKTOP_CALLBACK_URL,
    code_challenge: challenge,
    code_challenge_method: "S256",
    scopes: "email profile",
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `${getSupabaseAuthBase()}/auth/v1/authorize?${params.toString()}`;
}

type Stage =
  | "loading"
  | "confirm-existing" // browser already signed in (CASE A)
  | "sign-in" // browser not signed in (CASE C)
  | "confirm-new" // valid password sign-in — confirm device handoff
  | "redirecting" // heading into the Google PKCE flow
  | "cancelled" // user declined (CASE B)
  | "invalid"; // incomplete/expired desktop flow link

function DesktopAuthPage() {
  const [stage, setStage] = useState<Stage>("loading");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [signedInEmail, setSignedInEmail] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signInError, setSignInError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Read the desktop flow context (a public PKCE code_challenge) and detect
  // the browser's existing Supabase session. Runs client-side only — nothing
  // meaningful happens during SSR.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeChallenge = params.get("code_challenge") ?? "";
    const method = params.get("code_challenge_method") ?? "";

    if (!codeChallenge || method !== "S256") {
      setStage("invalid");
      return;
    }
    setChallenge(codeChallenge);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        const user = data.session?.user;
        if (user?.email) {
          setSignedInEmail(user.email);
          setStage("confirm-existing");
        } else {
          setStage("sign-in");
        }
      })
      .catch(() => setStage("sign-in"));
  }, []);

  // CASE A — user confirms an already-signed-in browser session.
  const startDeviceHandoff = async () => {
    if (!challenge) return;
    // Confirm the existing session is still valid before authorizing this
    // device for that account.
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setStage("sign-in");
      return;
    }
    setStage("redirecting");
    // login_hint keeps Google on the account the user just confirmed.
    window.location.assign(buildAuthorizeUrl(challenge, signedInEmail));
  };

  // CASE C — user signs in with email/password through the existing Supabase
  // client. Invalid credentials never redirect anywhere or touch the desktop.
  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setSignInError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setSignInError(mapAuthError(error.message));
      return;
    }
    setSignedInEmail(email);
    setStage("confirm-new");
  };

  const confirmNewSignIn = () => {
    if (!challenge) return;
    setStage("redirecting");
    window.location.assign(buildAuthorizeUrl(challenge, signedInEmail));
  };

  // CASE C — browser not signed in: let the user authenticate directly with
  // Google (the existing Supabase Google flow) using the pending PKCE
  // challenge. No login_hint — no account is known yet.
  const handleGoogle = () => {
    if (!challenge || busy) return;
    setStage("redirecting");
    window.location.assign(buildAuthorizeUrl(challenge));
  };

  // CASE B — user declines. Show the cancellation page and best-effort close
  // the tab (browsers only honor window.close() for script-opened tabs, so
  // the page also offers the zeusai://auth/cancel deep link).
  const cancel = () => {
    setStage("cancelled");
    // Best-effort: browsers only honor window.close() for script-opened
    // tabs, so the cancellation page's zeusai://auth/cancel link is the
    // reliable path back to the desktop.
    window.close();
  };

  const renderBrand = () => (
    <div className="flex items-center justify-center gap-2 font-semibold">
      <div className="size-9 rounded-lg bg-gradient-primary grid place-items-center shadow-glow">
        <Code2 className="size-4 text-primary-foreground" />
      </div>
      <span>
        ⚡ <span className="text-gradient">Zeus AI</span>
      </span>
    </div>
  );

  const renderCardBody = () => {
    switch (stage) {
      case "loading":
        return (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            <p className="mt-3 text-sm">Checking your session…</p>
          </div>
        );

      case "confirm-existing":
        return (
          <div className="text-center">
            <h1 className="text-lg font-semibold">Continue signing in to Zeus AI Desktop?</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              You're currently signed in to Zeus AI as
            </p>
            <p className="mt-1 font-medium text-foreground break-all">{signedInEmail}</p>
            <p className="mt-3 text-sm text-muted-foreground">
              Do you want to continue with this account on Zeus AI Desktop?
            </p>
            <div className="mt-6 space-y-2">
              <Button
                onClick={startDeviceHandoff}
                className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow"
              >
                Continue on this device
              </Button>
              <Button variant="outline" className="w-full" onClick={cancel}>
                Cancel
              </Button>
            </div>
          </div>
        );

      case "sign-in":
        return (
          <div>
            <h1 className="text-lg font-semibold text-center">Sign in to Zeus AI Desktop</h1>
            <p className="mt-1 text-sm text-muted-foreground text-center">
              Enter your details to continue on this device.
            </p>
            <form onSubmit={handlePasswordSignIn} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="desktop-email">Email</Label>
                <Input
                  id="desktop-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desktop-password">Password</Label>
                <Input
                  id="desktop-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {signInError && (
                <p className="text-sm text-destructive" role="alert">
                  {signInError}
                </p>
              )}
              <Button
                type="submit"
                disabled={busy}
                className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
              </Button>
            </form>
            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
            </div>
            <Button onClick={handleGoogle} disabled={busy} variant="outline" className="w-full">
              <svg className="size-4 mr-2" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M21.35 11.1h-9.17v2.92h5.51c-.25 1.37-1.6 4.02-5.51 4.02-3.31 0-6.01-2.74-6.01-6.12s2.7-6.12 6.01-6.12c1.89 0 3.15.81 3.87 1.5l2.64-2.55C17.13 3.18 14.86 2 12.18 2 6.94 2 2.7 6.24 2.7 11.5S6.94 21 12.18 21c7.04 0 9.46-4.94 9.46-7.46 0-.5-.05-.87-.13-1.44z"
                />
              </svg>
              Continue with Google
            </Button>
            <p className="mt-4 text-xs text-center text-muted-foreground">
              New to Zeus AI?{" "}
              <Link
                to="/auth"
                className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
              >
                Create an account
              </Link>
            </p>
          </div>
        );

      case "confirm-new":
        return (
          <div className="text-center">
            <h1 className="text-lg font-semibold">Continue signing in to Zeus AI Desktop?</h1>
            <p className="mt-3 text-sm text-muted-foreground">Signed in as</p>
            <p className="mt-1 font-medium text-foreground break-all">{signedInEmail}</p>
            <p className="mt-3 text-sm text-muted-foreground">
              Zeus AI Desktop will be signed in to this account.
            </p>
            <div className="mt-6 space-y-2">
              <Button
                onClick={confirmNewSignIn}
                className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow"
              >
                Continue
              </Button>
              <Button variant="outline" className="w-full" onClick={cancel}>
                Cancel
              </Button>
            </div>
          </div>
        );

      case "redirecting":
        return (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Loader2 className="size-6 animate-spin text-primary" />
            <p className="mt-3 text-sm font-medium">Completing sign-in…</p>
            <p className="mt-1 text-xs text-muted-foreground">
              You'll be returned to Zeus AI Desktop automatically.
            </p>
          </div>
        );

      case "cancelled":
        return (
          <div className="text-center">
            <h1 className="text-lg font-semibold">Sign-in was declined</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Zeus AI Desktop will not be signed in. You can close this tab, or return to the
              desktop app.
            </p>
            <a
              href={DESKTOP_CANCEL_URL}
              className="mt-6 inline-flex w-full items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent/50 transition-colors"
            >
              Return to Zeus AI Desktop
            </a>
          </div>
        );

      case "invalid":
      default:
        return (
          <div className="text-center">
            <h1 className="text-lg font-semibold">Link invalid</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              This link is incomplete or expired. Please start again from Zeus AI Desktop.
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex w-full items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent/50 transition-colors"
            >
              Go to Zeus AI
            </Link>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-hero pointer-events-none" />
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8">{renderBrand()}</div>
          <div className="rounded-2xl border border-border bg-card/70 p-8 shadow-elegant backdrop-blur">
            {renderCardBody()}
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            This page only authorizes Zeus AI Desktop on this device.
          </p>
        </div>
      </div>
    </div>
  );
}
