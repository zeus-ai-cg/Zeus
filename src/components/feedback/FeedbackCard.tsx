import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { StarRating } from "./StarRating";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MessageSquare, ThumbsUp, Folder, Shield, EyeOff, Trash2, Ban } from "lucide-react";
import { toast } from "sonner";
import { timeAgo } from "@/lib/utils";
import { checkAdmin, adminDeleteFeedback, adminHideFeedback, adminBlockUser } from "@/lib/feedback.functions";
import type { FeedbackRow } from "@/lib/feedback.functions";

interface FeedbackCardProps {
  feedback: FeedbackRow & {
    feedback_attachments?: unknown[];
    feedback_projects?: unknown[];
    public_feedback_conversations?: unknown[];
  };
  showAdminControls?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  general: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  chat: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  engineer: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  memory: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  skills: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300",
  desktop: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300",
  vscode: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300",
  billing: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  performance: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
};

export function FeedbackCard({ feedback, showAdminControls = false }: FeedbackCardProps) {
  const qc = useQueryClient();
  const name = feedback.profiles?.display_name || "Anonymous";
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const hasConversation =
    feedback.public_feedback_conversations &&
    (feedback.public_feedback_conversations as unknown[]).length > 0;
  const hasProject =
    feedback.feedback_projects && (feedback.feedback_projects as unknown[]).length > 0;
  const hasAttachments =
    feedback.feedback_attachments && (feedback.feedback_attachments as unknown[]).length > 0;

  const delFn = useServerFn(adminDeleteFeedback);
  const hideFn = useServerFn(adminHideFeedback);
  const blockFn = useServerFn(adminBlockUser);

  const deleteMut = useMutation({
    mutationFn: () => delFn({ data: { feedbackId: feedback.id } }),
    onSuccess: () => {
      toast.success("Feedback removed");
      qc.invalidateQueries({ queryKey: ["feedback"] });
    },
  });

  const hideMut = useMutation({
    mutationFn: () => hideFn({ data: { feedbackId: feedback.id } }),
    onSuccess: () => {
      toast.success("Feedback hidden");
      qc.invalidateQueries({ queryKey: ["feedback"] });
    },
  });

  const blockMut = useMutation({
    mutationFn: () => blockFn({ data: { userId: feedback.user_id, reason: "Inappropriate content" } }),
    onSuccess: () => {
      toast.success("User blocked");
      qc.invalidateQueries({ queryKey: ["feedback"] });
    },
  });

  return (
    <Link
      to="/Feedback/$feedbackId"
      params={{ feedbackId: feedback.id }}
      className="block transition-transform hover:scale-[1.01]"
    >
      <Card className="h-full cursor-pointer transition-shadow hover:shadow-md">
        <CardContent className="p-4">
          {/* Header */}
          <div className="mb-3 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Avatar className="size-8">
                <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500 text-xs text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{name}</p>
                <p className="text-xs text-muted-foreground">
                  {timeAgo(feedback.created_at)}
                </p>
              </div>
            </div>
            <StarRating rating={feedback.rating} size="sm" />
          </div>

          {/* Title */}
          {feedback.title && (
            <h3 className="mb-1 line-clamp-1 text-sm font-semibold">
              {feedback.title}
            </h3>
          )}

          {/* Body */}
          <p className="line-clamp-3 text-sm text-muted-foreground">{feedback.body}</p>

          {/* Indicators */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge
              variant="secondary"
              className={`text-[10px] ${CATEGORY_COLORS[feedback.category] ?? ""}`}
            >
              {feedback.category}
            </Badge>
            {hasConversation && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <MessageSquare className="size-2.5" />
                Conversation
              </Badge>
            )}
            {hasProject && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Folder className="size-2.5" />
                Project
              </Badge>
            )}
            {hasAttachments && (
              <Badge variant="outline" className="text-[10px]">
                Files
              </Badge>
            )}
          </div>
        </CardContent>

        <CardFooter className="border-t px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <ThumbsUp className="size-3" />
            <span>
              {feedback.helpful_count}{" "}
              {feedback.helpful_count === 1 ? "person" : "people"} found this helpful
            </span>
          </div>
          {showAdminControls && (
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="size-6 text-muted-foreground hover:text-amber-500"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  hideMut.mutate();
                }}
                title="Hide feedback"
              >
                <EyeOff className="size-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-6 text-muted-foreground hover:text-red-500"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  deleteMut.mutate();
                }}
                title="Delete feedback"
              >
                <Trash2 className="size-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-6 text-muted-foreground hover:text-red-600"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (confirm("Block this user? They will lose access to Zeus AI.")) {
                    blockMut.mutate();
                  }
                }}
                title="Block user"
              >
                <Ban className="size-3" />
              </Button>
            </div>
          )}
        </CardFooter>
      </Card>
    </Link>
  );
}
