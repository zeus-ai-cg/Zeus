import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getInitialSession } from "@/lib/auth-session";
import { getDesktopAuthBridge, isSessionResult } from "@/lib/desktop-auth";
import { mapAuthError } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Code2, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/")({
  head: () => ({
    meta: [
      { title: "Sign in — Zeus AI" },
      {
        name: "description",
        content: "Sign in to Zeus AI to start learning programming with your personal AI mentor.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Desktop: true while the system browser is open for Google sign-in.
  const [desktopWaiting, setDesktopWaiting] = useState(false);

  useEffect(() => {
    getInitialSession().then((session) => {
      if (session?.user) navigate({ to: "/chat", replace: true });
    });
  }, [navigate]);

  // Desktop shell: pick up a session that finished exchanging before the
  // window existed (cold-start deep link) or is pushed back by the main
  // process after the browser flow completes.
  useEffect(() => {
    const desktop = getDesktopAuthBridge();
    if (!desktop) return;

    const apply = async (result: { access_token?: string; error?: string }) => {
      if (result?.error) {
        setDesktopWaiting(false);
        setLoading(false);
        toast.error(result.error);
        return;
      }
      if (!isSessionResult(result)) return;
      const { error } = await supabase.auth.setSession(result);
      setDesktopWaiting(false);
      setLoading(false);
      if (error) {
        toast.error(error.message ?? "Google sign-in failed");
        return;
      }
      toast.success("Welcome back!");
      navigate({ to: "/chat", replace: true });
    };

    desktop.getPendingSession().then((result) => apply(result ?? {}));
    const unsubscribe = desktop.onSessionReady(apply);
    return unsubscribe;
  }, [navigate]);

  // Sign in only. A failed login NEVER creates an account — it just
  // surfaces the real Supabase error.
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      toast.error(mapAuthError(error.message));
      return;
    }

    toast.success("Welcome back!");
    navigate({ to: "/chat", replace: true });
  };

  // Sign up only, reached via the explicit "Create one" link — never
  // triggered automatically from a failed sign-in attempt.
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { display_name: email.split("@")[0] },
      },
    });
    setLoading(false);

    if (error) {
      toast.error(mapAuthError(error.message));
      return;
    }

    // Supabase returns success with an empty `identities` array (no error)
    // when signUp is called for an email that's already registered, so
    // that fact can't be used to probe which emails exist. Surface it as
    // the "already exists" case rather than silently signing them in.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      toast.error("An account with this email already exists. Try signing in instead.");
      setMode("signin");
      return;
    }

    if (data.session) {
      toast.success("Account created! Signing you in…");
      navigate({ to: "/chat", replace: true });
    } else {
      toast.success("Account created! Check your email to confirm, then sign in.");
      setMode("signin");
    }
  };

  const google = async () => {
    // Desktop shell: hand off to the system browser via the main process
    // (PKCE + zeusai:// deep link). The session returns over IPC and the
    // onSessionReady listener above applies it.
    const desktop = getDesktopAuthBridge();
    if (desktop) {
      setLoading(true);
      const result = await desktop.startGoogleOAuth();
      if (result?.error) {
        setLoading(false);
        toast.error(result.error);
        return;
      }
      setLoading(false);
      setDesktopWaiting(true);
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/chat`,
      },
    });
    if (error) {
      setLoading(false);
      toast.error(error.message ?? "Google sign-in failed");
    }
    // Browser will redirect to Google; supabase-js handles the callback on return.
  };

  // Desktop: if the user returns without completing sign-in (or it failed),
  // clear the waiting state so they can retry.
  useEffect(() => {
    if (!desktopWaiting) return;
    const onFocus = () => setDesktopWaiting(false);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [desktopWaiting]);

  // Desktop: the main process rejects a deep link once its PKCE verifier
  // expires (10 min). If the flow never completes by then, stop waiting so
  // the user isn't stuck on "Waiting for browser…" with no way forward.
  useEffect(() => {
    if (!desktopWaiting) return;
    const timer = window.setTimeout(
      () => {
        setDesktopWaiting(false);
        setLoading(false);
        toast.error("Sign-in timed out. Please try again.");
      },
      10 * 60 * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [desktopWaiting]);

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background text-foreground">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-hero relative overflow-hidden">
        <Link to="/" className="flex items-center gap-2 font-semibold relative">
          <div className="size-8 rounded-lg bg-gradient-primary grid place-items-center shadow-glow">
            <Code2 className="size-4 text-primary-foreground" />
          </div>
          ⚡ <span className="text-gradient">Zeus AI</span>
        </Link>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold tracking-tight">
            A patient mentor for every line of code.
          </h2>
          <p className="mt-3 text-muted-foreground">
            From your first <code className="text-accent">print("Hello")</code> to system design —
            one teacher, every language, your pace.
          </p>
        </div>
        <p className="text-xs text-muted-foreground relative">
          © {new Date().getFullYear()} Zeus AI
        </p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8">
            <Link to="/" className="flex items-center gap-2 font-semibold">
              <div className="size-8 rounded-lg bg-gradient-primary grid place-items-center shadow-glow">
                <Code2 className="size-4 text-primary-foreground" />
              </div>
              ⚡ <span className="text-gradient">Zeus AI</span>
            </Link>
          </div>

          <div>
            <h1 className="text-lg font-semibold">
              {mode === "signin" ? "Sign in" : "Create your account"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "signin"
                ? "Welcome back. Enter your details to continue."
                : "Enter your details to get started."}
            </p>
            <form
              onSubmit={mode === "signin" ? handleSignIn : handleSignUp}
              className="mt-6 space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow"
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : mode === "signin" ? (
                  "Sign in"
                ) : (
                  "Create account"
                )}
              </Button>
            </form>
            <p className="mt-4 text-sm text-center text-muted-foreground">
              {mode === "signin" ? (
                <>
                  Don't have an account?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
                  >
                    Create one
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("signin")}
                    className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </div>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>

          <Button
            onClick={google}
            disabled={loading || desktopWaiting}
            variant="outline"
            className="w-full"
          >
            <svg className="size-4 mr-2" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M21.35 11.1h-9.17v2.92h5.51c-.25 1.37-1.6 4.02-5.51 4.02-3.31 0-6.01-2.74-6.01-6.12s2.7-6.12 6.01-6.12c1.89 0 3.15.81 3.87 1.5l2.64-2.55C17.13 3.18 14.86 2 12.18 2 6.94 2 2.7 6.24 2.7 11.5S6.94 21 12.18 21c7.04 0 9.46-4.94 9.46-7.46 0-.5-.05-.87-.13-1.44z"
              />
            </svg>
            {desktopWaiting ? "Waiting for browser…" : "Continue with Google"}
          </Button>

          {desktopWaiting && (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ExternalLink className="size-3.5" />
              Complete sign-in in your browser, then return here.
            </p>
          )}

          <p className="mt-8 text-xs text-center text-muted-foreground">
            By continuing you agree to learn something new today. 🚀
          </p>
        </div>
      </div>
    </div>
  );
}
