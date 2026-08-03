import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getInitialSession } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Code2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
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

// Maps raw Supabase auth error messages to clear, specific, user-facing
// copy. Falls back to the real Supabase message (never a generic
// "Something went wrong") if we don't recognize it, so nothing is hidden.
function mapAuthError(message: string): string {
  const m = message.toLowerCase();

  if (m.includes("invalid login credentials")) {
    // Supabase deliberately returns this same message whether the email
    // doesn't exist or the password is wrong, so it can't be used to probe
    // which accounts exist. We surface it as a single, accurate message
    // rather than guessing (and, critically, never fall back to signup).
    return "Incorrect email or password.";
  }
  if (m.includes("unable to validate email address") || m.includes("invalid email")) {
    return "That email address doesn't look valid.";
  }
  if (
    m.includes("user already registered") ||
    m.includes("already registered") ||
    m.includes("already exists")
  ) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (m.includes("password should be at least") || m.includes("password is too short")) {
    return message; // already specific and actionable as-is
  }
  if (m.includes("email rate limit") || m.includes("rate limit")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (m.includes("email not confirmed")) {
    return "Please confirm your email address before signing in.";
  }

  // Unrecognized error: show Supabase's real message rather than a vague one.
  return message;
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    getInitialSession().then((session) => {
      if (session?.user) navigate({ to: "/chat", replace: true });
    });
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

          <Button onClick={google} disabled={loading} variant="outline" className="w-full">
            <svg className="size-4 mr-2" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M21.35 11.1h-9.17v2.92h5.51c-.25 1.37-1.6 4.02-5.51 4.02-3.31 0-6.01-2.74-6.01-6.12s2.7-6.12 6.01-6.12c1.89 0 3.15.81 3.87 1.5l2.64-2.55C17.13 3.18 14.86 2 12.18 2 6.94 2 2.7 6.24 2.7 11.5S6.94 21 12.18 21c7.04 0 9.46-4.94 9.46-7.46 0-.5-.05-.87-.13-1.44z"
              />
            </svg>
            Continue with Google
          </Button>

          <p className="mt-8 text-xs text-center text-muted-foreground">
            By continuing you agree to learn something new today. 🚀
          </p>
        </div>
      </div>
    </div>
  );
}
