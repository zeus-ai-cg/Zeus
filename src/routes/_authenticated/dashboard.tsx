import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe, getStats, listSnippets } from "@/lib/profile.functions";
import { listWorkspaceProjects, toggleProjectPin } from "@/lib/workspace.functions";
import { getCreditsSummary } from "@/lib/credits.functions";
import { FREE_QUESTION_LIMIT, PRO_MONTHLY_REQUEST_LIMIT } from "@/lib/achievements";
import { isProOrAbove, isUltimate } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import {
  Flame,
  MessageSquare,
  Sparkles,
  Code,
  ArrowRight,
  Crown,
  Zap,
  FolderKanban,
  Pin,
  PinOff,
  TrendingUp,
  Play,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Zeus AI" },
      {
        name: "description",
        content: "Your projects, chats, credits, and learning progress in one place.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

const MOTIVATIONS = [
  "Keep building.",
  "Consistency beats intensity.",
  "Every expert was once a beginner.",
  "Small progress is still progress.",
];

// Feature 9 — recently shipped, worth surfacing so people actually find
// them. Static and honest: only things that exist in this build land here.
const LATEST_FEATURES = [
  {
    title: "Zeus Project Engineer",
    description: 'Say "Build a..." in chat to generate a complete project.',
    to: "/chat",
  },
  {
    title: "Zeus Smart Continue",
    description: '"Add Stripe", "Dark Mode" — follow-ups now modify your project directly.',
    to: "/chat",
  },
  {
    title: "Zeus Ultimate",
    description: "No Fair Usage Policy — unlimited requests.",
    to: "/pricing",
  },
];

function Dashboard() {
  const me = useServerFn(getMe);
  const stats = useServerFn(getStats);
  const snips = useServerFn(listSnippets);
  const projectsFn = useServerFn(listWorkspaceProjects);
  const creditsFn = useServerFn(getCreditsSummary);
  const pinFn = useServerFn(toggleProjectPin);
  const qc = useQueryClient();

  const { data: profile } = useQuery({ queryKey: ["me"], queryFn: () => me() });
  const { data: s } = useQuery({ queryKey: ["stats"], queryFn: () => stats() });
  const { data: snippets = [] } = useQuery({ queryKey: ["snippets"], queryFn: () => snips() });
  const { data: projects = [] } = useQuery({
    queryKey: ["workspace-projects"],
    queryFn: () => projectsFn(),
  });
  const { data: credits } = useQuery({ queryKey: ["credits-summary"], queryFn: () => creditsFn() });

  const pinMut = useMutation({
    mutationFn: (v: { id: string; pinned: boolean }) => pinFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace-projects"] }),
  });

  const motivation = MOTIVATIONS[new Date().getDate() % MOTIVATIONS.length];
  const isPro = isProOrAbove(profile?.plan);
  const ultimate = isUltimate(profile?.plan);
  const used = profile?.questions_used ?? 0;
  const remaining = profile?.remaining ?? 0;
  const proLimit = profile?.pro_limit ?? PRO_MONTHLY_REQUEST_LIMIT;
  const proRemaining = profile?.pro_remaining ?? proLimit;

  const pinnedProjects = projects.filter((p) => p.pinned);
  const recentProjects = projects.slice(0, 5);

  // Continue Working — whichever of "most recent chat" / "most recent
  // project" was actually touched last, so this is one real click instead
  // of a generic "go to chat" button.
  const latestThread = s?.recent_threads[0];
  const latestProject = projects[0];
  const continueIsProject =
    !!latestProject && (!latestThread || latestProject.updated_at > latestThread.updated_at);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1">{motivation}</p>
          </div>
          <Button
            className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow"
            asChild
          >
            {continueIsProject && latestProject ? (
              <Link to="/workspace">
                <Play className="size-4 mr-2" /> Continue: {latestProject.name}
              </Link>
            ) : latestThread ? (
              <Link to="/chat/$threadId" params={{ threadId: latestThread.id }}>
                <Play className="size-4 mr-2" /> Continue: {latestThread.title || "your last chat"}
              </Link>
            ) : (
              <Link to="/chat">
                <MessageSquare className="size-4 mr-2" /> Start a chat
              </Link>
            )}
          </Button>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <StatCard
            label="Current plan"
            value={ultimate ? "Ultimate" : isPro ? "Pro" : "Standard"}
            icon={<Crown className="size-4" />}
            tone={isPro ? "accent" : "default"}
          />
          <StatCard
            label="Credits today"
            value={`${credits?.totalToday ?? 0}`}
            sub="Zeus Credits used"
            icon={<Zap className="size-4" />}
          />
          <StatCard
            label="Questions remaining"
            value={
              ultimate
                ? "Unlimited"
                : isPro
                  ? `${proRemaining.toLocaleString()} / ${proLimit.toLocaleString()}`
                  : `${remaining} / ${FREE_QUESTION_LIMIT}`
            }
            sub={
              ultimate ? "No Fair Usage Policy" : isPro ? "Pro monthly requests" : `${used} used`
            }
            icon={<Sparkles className="size-4" />}
          />
          <StatCard
            label="Productivity"
            value={`${s?.questions_this_week ?? 0}`}
            sub="Questions this week"
            icon={<TrendingUp className="size-4" />}
            tone="accent"
          />
          <StatCard
            label="Learning streak"
            value={`${s?.streak_days ?? 0}d`}
            icon={<Flame className="size-4" />}
          />
        </div>

        {pinnedProjects.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Pin className="size-4 text-primary" /> Pinned Projects
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pinnedProjects.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-primary/30 bg-card/60 p-4 flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {p.framework ?? p.primary_language ?? "Project"} · {p.file_count} files
                    </div>
                  </div>
                  <button
                    className="text-muted-foreground hover:text-primary shrink-0"
                    title="Unpin"
                    onClick={() => pinMut.mutate({ id: p.id, pinned: false })}
                  >
                    <PinOff className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-5 mb-5">
          <Card title="Recent chats" icon={<MessageSquare className="size-4" />}>
            {s?.recent_threads.length ? (
              <ul className="space-y-1.5">
                {s.recent_threads.map((t) => (
                  <li key={t.id}>
                    <Link
                      to="/chat/$threadId"
                      params={{ threadId: t.id }}
                      className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary/60 group"
                    >
                      <span className="truncate">{t.title}</span>
                      <ArrowRight className="size-3.5 opacity-0 group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty hint="Start your first conversation." />
            )}
          </Card>

          <Card
            title="Recent projects"
            icon={<FolderKanban className="size-4" />}
            action={
              <Link to="/workspace" className="text-xs text-muted-foreground hover:text-foreground">
                View all
              </Link>
            }
          >
            {recentProjects.length ? (
              <ul className="space-y-1.5">
                {recentProjects.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary/60 group"
                  >
                    <Link to="/workspace" className="truncate flex-1">
                      {p.name}
                    </Link>
                    <button
                      className="text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 shrink-0"
                      title={p.pinned ? "Unpin" : "Pin"}
                      onClick={() => pinMut.mutate({ id: p.id, pinned: !p.pinned })}
                    >
                      {p.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty hint="Generate or upload a project to see it here." />
            )}
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          <Card
            title="Saved code"
            icon={<Code className="size-4" />}
            action={
              <Link to="/snippets" className="text-xs text-muted-foreground hover:text-foreground">
                View all
              </Link>
            }
          >
            {snippets.length ? (
              <ul className="space-y-1.5">
                {snippets.slice(0, 5).map((snip) => (
                  <li key={snip.id} className="rounded-lg px-3 py-2 text-sm hover:bg-secondary/60">
                    <div className="truncate font-medium">{snip.title}</div>
                    <div className="text-xs text-muted-foreground">{snip.language}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty hint="Save code snippets from any chat." />
            )}
          </Card>

          <Card title="Latest AI features" icon={<Sparkles className="size-4" />}>
            <ul className="space-y-2">
              {LATEST_FEATURES.map((f) => (
                <li key={f.title}>
                  <Link
                    to={f.to}
                    className="block rounded-lg px-3 py-2 hover:bg-secondary/60 group"
                  >
                    <div className="text-sm font-medium flex items-center justify-between">
                      {f.title}
                      <ArrowRight className="size-3.5 opacity-0 group-hover:opacity-100" />
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{f.description}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {!isPro && (
          <div className="mt-8 rounded-2xl border border-primary/40 bg-card/60 p-6 flex items-center justify-between gap-4 flex-wrap shadow-elegant relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-hero pointer-events-none" />
            <div className="relative">
              <h3 className="text-lg font-semibold">Unlock unlimited learning</h3>
              <p className="text-sm text-muted-foreground">
                Go Pro for unlimited questions, deeper code reviews, and personalized roadmaps.
              </p>
            </div>
            <Button
              className="relative bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow"
              asChild
            >
              <Link to="/upgrade">
                <Sparkles className="size-4 mr-2" /> Upgrade to Pro
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone?: "default" | "accent";
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={`size-6 rounded-md grid place-items-center ${tone === "accent" ? "bg-gradient-primary text-primary-foreground" : "bg-secondary"}`}
        >
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function Card({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          {icon} {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Empty({ hint }: { hint: string }) {
  return <p className="text-sm text-muted-foreground py-6 text-center">{hint}</p>;
}
