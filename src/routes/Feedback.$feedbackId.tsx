import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getPublicFeedback,
  toggleFeedbackVote,
  reportFeedback,
  checkUserVoted,
} from "@/lib/feedback.functions";
import { MarketingLayout } from "@/components/MarketingLayout";
import { StarRating } from "@/components/feedback/StarRating";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import { useState } from "react";
import { toast } from "sonner";
import {
  ThumbsUp,
  Flag,
  ArrowLeft,
  MessageSquare,
  Folder,
  Paperclip,
  ExternalLink,
  Loader2,
  Shield,
  User,
} from "lucide-react";
import { timeAgo } from "@/lib/utils";

export const Route = createFileRoute("/Feedback/$feedbackId")({
  head: ({ params }) => ({
    meta: [
      { title: `Feedback — Zeus AI` },
      {
        name: "description",
        content: "View community feedback for Zeus AI.",
      },
      { property: "og:title", content: `Feedback — Zeus AI` },
      { property: "og:type", content: "website" },
    ],
  }),
  component: FeedbackDetailPage,
});

function FeedbackDetailPage() {
  const { feedbackId } = Route.useParams();
  const queryClient = useQueryClient();
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("spam");
  const [reportDetails, setReportDetails] = useState("");

  const getFeedbackFn = useServerFn(getPublicFeedback);
  const voteFn = useServerFn(toggleFeedbackVote);
  const reportFn = useServerFn(reportFeedback);
  const votedFn = useServerFn(checkUserVoted);

  const { data: feedback, isFetching } = useQuery({
    queryKey: ["feedback-detail", feedbackId],
    queryFn: () => getFeedbackFn({ data: { feedbackId } }),
  });

  const { data: votedData } = useQuery({
    queryKey: ["feedback-voted", feedbackId],
    queryFn: () => votedFn({ data: { feedbackId } }),
  });
  const hasVoted = votedData?.voted ?? false;

  const voteMutation = useMutation({
    mutationFn: () => voteFn({ data: { feedbackId } }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["feedback-detail", feedbackId] });
      queryClient.invalidateQueries({ queryKey: ["public-feedback"] });
      queryClient.invalidateQueries({ queryKey: ["feedback-voted", feedbackId] });
      toast.success(result.voted ? "Marked as helpful!" : "Vote removed.");
    },
    onError: () => toast.error("Failed to vote."),
  });

  const reportMutation = useMutation({
    mutationFn: () =>
      reportFn({
        data: {
          feedbackId,
          reason: reportReason as any,
          details: reportDetails || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Report submitted. Thank you for helping keep our community safe.");
      setShowReport(false);
      setReportDetails("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isFetching) {
    return (
      <MarketingLayout>
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
        </div>
      </MarketingLayout>
    );
  }

  if (!feedback) {
    return (
      <MarketingLayout>
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h2 className="text-xl font-semibold">Feedback not found</h2>
          <p className="mt-2 text-muted-foreground">
            This feedback may have been removed or is no longer public.
          </p>
          <Link to="/Feedback">
            <Button variant="ghost" className="mt-4 gap-2">
              <ArrowLeft className="size-4" />
              Back to Feedback
            </Button>
          </Link>
        </div>
      </MarketingLayout>
    );
  }

  const fb = feedback as any;
  const name = fb?.profiles?.display_name || "Anonymous";
  const initials = name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const conversations = (feedback as any).public_feedback_conversations ?? [];
  const projects = (feedback as any).feedback_projects ?? [];
  const attachments = (feedback as any).feedback_attachments ?? [];

  return (
    <MarketingLayout>
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Back link */}
        <Link to="/Feedback">
          <Button variant="ghost" size="sm" className="mb-6 gap-2">
            <ArrowLeft className="size-4" />
            Back to Feedback
          </Button>
        </Link>

        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="size-10">
              <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500 text-sm text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{name}</span>
                {name !== "Anonymous" && (
                  <Badge variant="secondary" className="gap-1 text-[10px]">
                    <Shield className="size-2.5" />
                    Zeus User
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {timeAgo(fb.created_at)}
              </p>
            </div>
          </div>
          <StarRating rating={fb.rating} size="lg" />
        </div>

        {/* Title */}
        {fb.title && (
          <h1 className="mb-4 text-2xl font-bold">{fb.title}</h1>
        )}

        {/* Body */}
        <div className="prose prose-sm prose-invert max-w-none">
          <ReactMarkdown>{fb.body}</ReactMarkdown>
        </div>

        {/* Category */}
        <div className="mt-4">
          <Badge variant="secondary">{fb.category}</Badge>
        </div>

        <Separator className="my-6" />

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Paperclip className="size-4" />
              Attachments
            </h3>
            <div className="flex flex-wrap gap-2">
              {attachments.map((att: any) => (
                <Badge key={att.id} variant="outline" className="gap-1">
                  <Paperclip className="size-3" />
                  {att.file_name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Shared project */}
        {projects.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Folder className="size-4" />
              Built with Zeus
            </h3>
            {projects.map((proj: any) => (
              <Card key={proj.id}>
                <CardContent className="p-4">
                  <h4 className="font-medium">{proj.title}</h4>
                  {proj.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{proj.description}</p>
                  )}
                  {proj.preview_metadata?.framework && (
                    <Badge variant="secondary" className="mt-2 text-[10px]">
                      {proj.preview_metadata.framework}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Shared conversation */}
        {conversations.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <MessageSquare className="size-4" />
              Shared Conversation
            </h3>
            {conversations.map((conv: any) => (
              <Card key={conv.id}>
                <CardContent className="p-4">
                  {conv.title && (
                    <h4 className="mb-2 font-medium">{conv.title}</h4>
                  )}
                  <div className="space-y-3">
                    {(conv.messages ?? [])
                      .sort((a: any, b: any) => a.display_order - b.display_order)
                      .map((msg: any) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                              msg.role === "user"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            }`}
                          >
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Separator className="my-6" />

        {/* Actions */}
        <div className="flex items-center justify-between">
          <Button
            variant={hasVoted ? "default" : "outline"}
            size="sm"
            className={`gap-2 ${hasVoted ? "bg-purple-600 hover:bg-purple-700 text-white" : ""}`}
            onClick={() => voteMutation.mutate()}
            disabled={voteMutation.isPending}
          >
            <ThumbsUp className="size-4" />
            {fb.helpful_count} {hasVoted ? "Helpful (voted)" : "Helpful"}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground"
            onClick={() => setShowReport(true)}
          >
            <Flag className="size-4" />
            Report
          </Button>
        </div>
      </div>

      {/* Report dialog */}
      <Dialog open={showReport} onOpenChange={(open) => !open && setShowReport(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report Feedback</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason</label>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="spam">Spam</option>
                <option value="harassment">Harassment</option>
                <option value="personal_info">Personal information</option>
                <option value="malicious">Malicious content</option>
                <option value="copyright">Copyright issue</option>
                <option value="sensitive_info">Sensitive information</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Details (optional)</label>
              <textarea
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                rows={3}
                placeholder="Provide additional details..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowReport(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => reportMutation.mutate()}
              disabled={reportMutation.isPending}
            >
              {reportMutation.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Flag className="mr-2 size-4" />
              )}
              Submit Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MarketingLayout>
  );
}
