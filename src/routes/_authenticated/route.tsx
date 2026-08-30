import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useNavigate,
  useParams,
  useRouterState,
} from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getInitialSession, signOutAndClearAuth } from "@/lib/auth-session";
import { getMe } from "@/lib/profile.functions";
import { listThreads, createThread, deleteThread } from "@/lib/threads.functions";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarTrigger,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Code2,
  Plus,
  Trash2,
  LogOut,
  MessageSquare,
  LayoutDashboard,
  Code,
  Settings as SettingsIcon,
  Sparkles,
  User as UserIcon,
  CreditCard,
  Sun,
  Moon,
  Plug,
  FolderTree,
} from "lucide-react";
import { toast } from "sonner";
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
import { FREE_QUESTION_LIMIT, PRO_MONTHLY_REQUEST_LIMIT } from "@/lib/achievements";
import { isProOrAbove, isUltimate } from "@/lib/plans";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const session = await getInitialSession();
    if (!session?.user) throw redirect({ to: "/auth" });
    const user = session.user;

    // Onboarding redirect
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", user.id)
      .maybeSingle();
    if (profile && !profile.onboarding_completed && location.pathname !== "/onboarding") {
      throw redirect({ to: "/onboarding" });
    }
    return { user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Onboarding gets its own full-screen layout (no sidebar)
  if (pathname === "/onboarding") {
    return <Outlet />;
  }
  return <ChatLayout />;
}

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/snippets", label: "Saved Code", icon: Code },
  { to: "/workspace", label: "Workspace", icon: FolderTree },
  { to: "/feature-generator", label: "Feature Generator", icon: Sparkles },
  { to: "/connectors", label: "Connectors", icon: Plug },
  { to: "/profile", label: "Profile", icon: UserIcon },
  { to: "/billing", label: "Billing", icon: CreditCard },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
  { to: "/Feedback", label: "Feedback", icon: MessageSquare },
] as const;

function ChatLayout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listThreads);
  const create = useServerFn(createThread);
  const del = useServerFn(deleteThread);
  const me = useServerFn(getMe);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const params = useParams({ strict: false }) as { threadId?: string };
  const activeId = params.threadId;

  const { data: threads = [] } = useQuery({ queryKey: ["threads"], queryFn: () => list() });
  const { data: profile } = useQuery({ queryKey: ["me"], queryFn: () => me() });

  const createMut = useMutation({
    mutationFn: () => create({ data: {} }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      navigate({ to: "/chat/$threadId", params: { threadId: t.id } });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: async (_, id) => {
      await qc.invalidateQueries({ queryKey: ["threads"] });
      if (id === activeId) {
        const remaining =
          (qc.getQueryData(["threads"]) as { id: string }[] | undefined)?.filter(
            (t) => t.id !== id,
          ) ?? [];
        if (remaining[0])
          navigate({ to: "/chat/$threadId", params: { threadId: remaining[0].id } });
        else navigate({ to: "/chat" });
      }
    },
  });

  const signOut = async () => {
    try {
      await signOutAndClearAuth(qc);
      toast.success("Signed out");
      navigate({ to: "/auth", replace: true });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Couldn't sign out right now.");
    }
  };

  const isPro = isProOrAbove(profile?.plan);
  const ultimate = isUltimate(profile?.plan);
  const used = profile?.questions_used ?? 0;
  const remaining = profile?.remaining;
  const proUsed = profile?.pro_requests_used ?? 0;
  const proLimit = profile?.pro_limit ?? PRO_MONTHLY_REQUEST_LIMIT;
  const proRemaining = profile?.pro_remaining ?? Math.max(0, proLimit - proUsed);
  // Ultimate has no Fair Usage Policy — never show the near-limit warning for it.
  const proNearLimit = !ultimate && isPro && (profile?.pro_soft_warning || proUsed >= proLimit);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background text-foreground">
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <Link to="/" className="flex items-center gap-2 px-2 py-1 font-semibold">
              <div className="size-7 rounded-lg bg-gradient-primary grid place-items-center shadow-glow shrink-0">
                <Code2 className="size-4 text-primary-foreground" />
              </div>
              <span className="group-data-[collapsible=icon]:hidden">
                ⚡ <span className="text-gradient">Zeus AI</span>
              </span>
            </Link>
            <Button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending}
              size="sm"
              className="mx-2 mt-2 bg-gradient-primary text-primary-foreground hover:opacity-90 group-data-[collapsible=icon]:hidden"
            >
              <Plus className="size-4 mr-2" /> New chat
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              size="icon"
              variant="ghost"
              className="hidden group-data-[collapsible=icon]:flex mx-auto"
            >
              <Plus className="size-4" />
            </Button>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Workspace</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {NAV.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={pathname.startsWith(item.to)}>
                        <Link to={item.to}>
                          <item.icon className="size-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Chat History</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {threads.map((t) => (
                    <SidebarMenuItem key={t.id}>
                      <div className="flex items-center group/item">
                        <SidebarMenuButton asChild isActive={t.id === activeId} className="flex-1">
                          <Link
                            to="/chat/$threadId"
                            params={{ threadId: t.id }}
                            className="truncate"
                          >
                            <MessageSquare className="size-4 shrink-0" />
                            <span className="truncate">{t.title}</span>
                          </Link>
                        </SidebarMenuButton>
                        <DeleteThreadButton onConfirm={() => deleteMut.mutate(t.id)} />
                      </div>
                    </SidebarMenuItem>
                  ))}
                  {threads.length === 0 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                      No conversations yet.
                    </p>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="gap-2">
            <div className="px-2 py-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 group-data-[collapsible=icon]:hidden">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {ultimate ? "Ultimate plan" : isPro ? "Pro plan" : "Standard"}
                </span>
                {ultimate ? (
                  <span className="font-mono text-amber-500">Unlimited</span>
                ) : isPro ? (
                  <span
                    className={cn("font-mono", proNearLimit ? "text-amber-500" : "text-accent")}
                  >
                    {proUsed.toLocaleString()} / {proLimit.toLocaleString()}
                  </span>
                ) : (
                  <span className="font-mono">
                    {used} / {FREE_QUESTION_LIMIT}
                  </span>
                )}
              </div>
              {isPro ? (
                !ultimate &&
                proNearLimit && (
                  <>
                    <div className="mt-1.5 h-1.5 rounded-full bg-sidebar-border overflow-hidden">
                      <div
                        className="h-full bg-amber-500"
                        style={{ width: `${Math.min(100, (proUsed / proLimit) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      {proRemaining.toLocaleString()} monthly requests left · Fair Usage Policy
                    </p>
                  </>
                )
              ) : (
                <>
                  <div className="mt-1.5 h-1.5 rounded-full bg-sidebar-border overflow-hidden">
                    <div
                      className="h-full bg-gradient-primary"
                      style={{ width: `${Math.min(100, (used / FREE_QUESTION_LIMIT) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    {remaining ?? 0} left · resets every 24h
                  </p>
                  <Button
                    size="sm"
                    className="w-full mt-2 bg-gradient-primary text-primary-foreground hover:opacity-90"
                    asChild
                  >
                    <Link to="/upgrade">
                      <Sparkles className="size-3.5 mr-1.5" /> Upgrade to Pro
                    </Link>
                  </Button>
                </>
              )}
            </div>
            <Button onClick={signOut} variant="ghost" size="sm" className="justify-start">
              <LogOut className="size-4 mr-2" />
              <span className="group-data-[collapsible=icon]:hidden">Sign out</span>
            </Button>
          </SidebarFooter>
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0">
          <AuthedHeader onNewChat={() => createMut.mutate()} />
          <main className="flex-1 min-h-0">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AuthedHeader({ onNewChat }: { onNewChat: () => void }) {
  const { theme, toggle } = useTheme();
  return (
    <header className="sticky top-0 z-30 h-14 flex items-center border-b border-border px-2 sm:px-3 gap-2 shrink-0 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <SidebarTrigger aria-label="Toggle sidebar" />
      <Link to="/" className="flex items-center gap-2 font-semibold text-sm">
        <div className="size-6 rounded-md bg-gradient-primary grid place-items-center shadow-glow">
          <Code2 className="size-3.5 text-primary-foreground" />
        </div>
        <span className="hidden sm:inline">
          ⚡ <span className="text-gradient">Zeus AI</span>
        </span>
      </Link>
      <div className="ml-auto flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={onNewChat}
          className="hidden sm:inline-flex"
          aria-label="New chat"
        >
          <Plus className="size-4 mr-1" /> New chat
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onNewChat}
          className="sm:hidden"
          aria-label="New chat"
        >
          <Plus className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" asChild>
          <Link to="/dashboard" aria-label="Dashboard">
            <LayoutDashboard className="size-4" />
          </Link>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={toggle}
          aria-label="Toggle theme"
          title={`Switch to ${theme === "dark" ? "light" : "dark"}`}
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
        <Button size="icon" variant="ghost" asChild>
          <Link to="/settings" aria-label="Settings">
            <SettingsIcon className="size-4" />
          </Link>
        </Button>
        <Button size="icon" variant="ghost" asChild>
          <Link to="/profile" aria-label="Profile">
            <UserIcon className="size-4" />
          </Link>
        </Button>
      </div>
    </header>
  );
}

function DeleteThreadButton({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 opacity-0 group-hover/item:opacity-100 group-data-[collapsible=icon]:hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <Trash2 className="size-3.5 text-muted-foreground" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the thread and all its messages.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
