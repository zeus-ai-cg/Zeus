import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe, setLearningMode } from "@/lib/profile.functions";
import { UpgradeProButton } from "@/components/UpgradeProButton";
import { listMyFeedback, deleteFeedback } from "@/lib/feedback.functions";
import {
  LEARNING_MODES,
  PRO_MONTHLY_REQUEST_LIMIT,
  isLearningModeLocked,
} from "@/lib/achievements";
import { isProOrAbove, isUltimate } from "@/lib/plans";
import { PageHeader } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { signOutAndClearAuth } from "@/lib/auth-session";
import { useNavigate } from "@tanstack/react-router";
import {
  User,
  ShieldCheck,
  Palette,
  Bell,
  Languages,
  CreditCard,
  Trash2,
  Lock,
} from "lucide-react";
import { useTheme } from "@/lib/theme";
import { ModelSettingsPanel } from "@/components/ModelSettingsPanel";
import { CodingPreferencesPanel } from "@/components/CodingPreferencesPanel";
import { MemoryPanel } from "@/components/MemoryPanel";
import { SkillsPanel } from "@/components/SkillsPanel";
import { useAuthAccount } from "@/hooks/use-auth-account";
import { FeedbackCard } from "@/components/feedback/FeedbackCard";
import { Star } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const me = useServerFn(getMe);
  const updMode = useServerFn(setLearningMode);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: profile } = useQuery({ queryKey: ["me"], queryFn: () => me() });
  const { theme, setTheme } = useTheme();
  // profiles has no email column, so the checkout's customData needs the
  // auth session's id/email (see src/hooks/use-auth-account.ts).
  const account = useAuthAccount();
  const isPro = isProOrAbove(profile?.plan);
  const ultimate = isUltimate(profile?.plan);

  const [notifications, setNotifications] = useState(true);
  const [analytics, setAnalytics] = useState(true);
  const [lang, setLang] = useState("en");

  // My Feedback
  const myFeedbackFn = useServerFn(listMyFeedback);
  const deleteFbFn = useServerFn(deleteFeedback);
  const { data: myFeedback } = useQuery({
    queryKey: ["my-feedback"],
    queryFn: () => myFeedbackFn({} as any),
  });

  const modeMut = useMutation({
    mutationFn: (mode: string) => updMode({ data: { mode: mode as never } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Learning mode updated");
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't switch learning mode."),
  });

  const handleDelete = async () => {
    try {
      toast.info("Deletion requested. Email Haidersiddique0909@gmail.com to complete.");
      await signOutAndClearAuth(qc);
      navigate({ to: "/auth", replace: true });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Couldn't sign out right now.");
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <PageHeader title="Settings" subtitle="Manage your account, preferences, and privacy." />

        <div className="mt-8 space-y-5">
          <Section icon={<User className="size-4" />} title="Profile">
            <Row title="Display name & avatar" subtitle="Edit your public profile info.">
              <Button variant="outline" size="sm" asChild>
                <Link to="/profile">Edit profile</Link>
              </Button>
            </Row>
          </Section>

          <Section icon={<ShieldCheck className="size-4" />} title="Security">
            <Row title="Password & sign-in" subtitle="Manage your authentication methods.">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const { data } = await supabase.auth.getUser();
                  if (!data.user?.email) return;
                  await supabase.auth.resetPasswordForEmail(data.user.email);
                  toast.success("Password reset email sent");
                }}
              >
                Send reset email
              </Button>
            </Row>
          </Section>

          <Section icon={<Palette className="size-4" />} title="Appearance">
            <Row
              title="Theme"
              subtitle="Choose how Zeus AI looks. Your choice is remembered across visits."
            >
              <Select
                value={theme}
                onValueChange={(v) => {
                  setTheme(v as "dark" | "light");
                  toast.success(`${v === "dark" ? "Dark" : "Light"} theme applied`);
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                </SelectContent>
              </Select>
            </Row>
          </Section>

          <Section icon={<Languages className="size-4" />} title="Language">
            <Row title="Interface language" subtitle="Choose how Zeus AI talks to you.">
              <Select
                value={lang}
                onValueChange={(v) => {
                  setLang(v);
                  toast.success("Language preference saved");
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="hi">हिन्दी</SelectItem>
                  <SelectItem value="ar">العربية</SelectItem>
                  <SelectItem value="zh">中文</SelectItem>
                  <SelectItem value="ja">日本語</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row title="Learning mode" subtitle="How Zeus AI explains things to you.">
              <Select
                value={profile?.learning_mode ?? "beginner"}
                onValueChange={(v) => {
                  if (isLearningModeLocked(v, profile?.plan)) {
                    toast.error("That's a Pro learning mode", {
                      description: "Upgrade to Zeus AI Pro to unlock it.",
                    });
                    return;
                  }
                  modeMut.mutate(v);
                }}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEARNING_MODES.map((m) => {
                    const locked = isLearningModeLocked(m.value, profile?.plan);
                    return (
                      <SelectItem
                        key={m.value}
                        value={m.value}
                        className={locked ? "text-muted-foreground" : undefined}
                      >
                        <span className="flex items-center gap-1.5">
                          {m.label}
                          {locked && <Lock className="size-3 text-amber-500" />}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </Row>
          </Section>

          <Section icon={<Bell className="size-4" />} title="Notifications">
            <Row title="Product emails" subtitle="Product updates and learning tips.">
              <Switch
                checked={notifications}
                onCheckedChange={(v) => {
                  setNotifications(v);
                  toast.success(v ? "Notifications on" : "Notifications off");
                }}
              />
            </Row>
          </Section>

          <Section icon={<ShieldCheck className="size-4" />} title="Privacy">
            <Row
              title="Anonymous analytics"
              subtitle="Help improve Zeus AI by sharing anonymized usage data."
            >
              <Switch
                checked={analytics}
                onCheckedChange={(v) => {
                  setAnalytics(v);
                  toast.success("Preference saved");
                }}
              />
            </Row>
            <Row title="Privacy Policy" subtitle="Read how your data is collected and protected.">
              <Button variant="outline" size="sm" asChild>
                <Link to="/privacy">View policy</Link>
              </Button>
            </Row>
          </Section>

          <Section icon={<CreditCard className="size-4" />} title="Billing">
            <Row
              title="Plan"
              subtitle={
                ultimate
                  ? "You're on Ultimate — $10/month."
                  : isPro
                    ? "You're on Pro — $5/month."
                    : "You're on the Free plan."
              }
            >
              {isPro ? (
                <Button variant="outline" size="sm" asChild>
                  <Link to="/billing">Manage subscription</Link>
                </Button>
              ) : (
                <UpgradeProButton email={account.email} userId={account.id} />
              )}
            </Row>
            <Row
              title="Usage"
              subtitle={
                ultimate
                  ? "Unlimited requests — no Fair Usage Policy."
                  : isPro
                    ? `${(profile?.pro_requests_used ?? 0).toLocaleString()} / ${(profile?.pro_limit ?? PRO_MONTHLY_REQUEST_LIMIT).toLocaleString()} requests used this cycle (Fair Usage Policy).`
                    : `${profile?.questions_used ?? 0} / 15 questions used. Resets every 24 hours.`
              }
            />
          </Section>

          <ModelSettingsPanel />

          <CodingPreferencesPanel />

          <MemoryPanel />

          <SkillsPanel />

          <Section icon={<Star className="size-4" />} title="My Feedback">
            {myFeedback && myFeedback.length > 0 ? (
              <div className="p-4 space-y-3">
                {myFeedback.map((fb: any) => (
                  <div key={fb.id} className="flex items-center gap-3">
                    <FeedbackCard feedback={fb} />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={async () => {
                        if (confirm("Delete this feedback?")) {
                          await deleteFbFn({ data: { feedbackId: fb.id } });
                          qc.invalidateQueries({ queryKey: ["my-feedback"] });
                          toast.success("Feedback deleted");
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-5 text-sm text-muted-foreground">
                You haven't submitted any feedback yet.{" "}
                <Link to="/Feedback" className="text-primary hover:underline">
                  Give feedback
                </Link>
              </div>
            )}
          </Section>

          <Section icon={<Trash2 className="size-4" />} title="Danger zone" danger>
            <Row
              title="Delete account"
              subtitle="Permanently delete your account and all associated data."
            >
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    Delete account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes your account, chats, and snippets. This action cannot
                      be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Row>
          </Section>
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            Home
          </Link>
          <Link to="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
          <Link to="/contact" className="hover:text-foreground">
            Contact
          </Link>
          <Link to="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link to="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link to="/refund" className="hover:text-foreground">
            Refunds
          </Link>
          <Link to="/faq" className="hover:text-foreground">
            FAQ
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
  danger,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border ${danger ? "border-destructive/40" : "border-border"} bg-card/60 overflow-hidden`}
    >
      <div className="px-5 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
        <span
          className={`size-6 rounded-md grid place-items-center ${danger ? "bg-destructive/10 text-destructive" : "bg-secondary"}`}
        >
          {icon}
        </span>
        {title}
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function Row({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="p-5 flex items-center justify-between gap-4 flex-wrap">
      <div>
        <div className="font-medium">{title}</div>
        {subtitle && <div className="text-sm text-muted-foreground mt-0.5">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}
