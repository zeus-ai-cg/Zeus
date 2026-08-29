import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPublicUserProfile } from "@/lib/feedback.functions";
import { listPublicFeedback } from "@/lib/feedback.functions";
import { MarketingLayout, PageHero } from "@/components/MarketingLayout";
import { FeedbackCard } from "@/components/feedback/FeedbackCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Folder, MessageSquare, Loader2 } from "lucide-react";

export const Route = createFileRoute("/u/$username")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.username} — Zeus AI Community` },
      {
        name: "description",
        content: `Check out ${params.username}'s projects and feedback on Zeus AI.`,
      },
      { property: "og:title", content: `${params.username} — Zeus AI Community` },
      { property: "og:type", content: "profile" },
    ],
  }),
  component: UserProfilePage,
});

function UserProfilePage() {
  const { username } = Route.useParams();

  const getProfileFn = useServerFn(getPublicUserProfile);
  const listFeedbackFn = useServerFn(listPublicFeedback);

  const { data: profile, isFetching: profileLoading } = useQuery({
    queryKey: ["public-profile", username],
    queryFn: () => getProfileFn({ data: { username } }),
  });

  const { data: feedbackData, isFetching: feedbackLoading } = useQuery({
    queryKey: ["public-feedback-user", username],
    queryFn: () =>
      listFeedbackFn({
        data: {
          pageSize: 50,
          sort: "newest",
          authorId: profile?.id,
        },
      }),
    enabled: !!profile,
  });

  if (profileLoading) {
    return (
      <MarketingLayout>
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
        </div>
      </MarketingLayout>
    );
  }

  if (!profile) {
    return (
      <MarketingLayout>
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h2 className="text-xl font-semibold">User not found</h2>
          <p className="mt-2 text-muted-foreground">
            This user profile doesn't exist or is not public.
          </p>
        </div>
      </MarketingLayout>
    );
  }

  const name = profile.display_name || username;
  const initials = name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const feedbackList = (feedbackData as any)?.items ?? [];

  return (
    <MarketingLayout>
      <PageHero
        title={`${name}'s Public Profile`}
        subtitle="Public feedback and projects shared with the Zeus AI community."
      />

      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Profile header */}
        <div className="mb-8 flex items-center gap-4">
          <Avatar className="size-16">
            <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500 text-xl text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold">{name}</h1>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="secondary" className="gap-1 text-xs">
                <MessageSquare className="size-3" />
                {feedbackList.length} feedback
              </Badge>
            </div>
          </div>
        </div>

        <Separator className="mb-8" />

        {/* Public projects showcase */}
        {profile.showcase_projects && profile.showcase_projects.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Folder className="size-5" />
              Built with Zeus
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {profile.showcase_projects.map((proj: any) => (
                <Card key={proj.id}>
                  <CardContent className="p-4">
                    <h3 className="font-medium">{proj.title}</h3>
                    {proj.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {proj.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {proj.preview_metadata?.framework && (
                        <Badge variant="secondary" className="text-[10px]">
                          {proj.preview_metadata.framework}
                        </Badge>
                      )}
                      {proj.preview_metadata?.language && (
                        <Badge variant="outline" className="text-[10px]">
                          {proj.preview_metadata.language}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Public feedback */}
        <div>
          <h2 className="mb-4 text-lg font-semibold">Public Feedback</h2>
          {feedbackLoading ? (
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          ) : feedbackList.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No public feedback yet.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {feedbackList.map((fb: any) => (
                <FeedbackCard key={fb.id} feedback={fb} />
              ))}
            </div>
          )}
        </div>
      </div>
    </MarketingLayout>
  );
}
