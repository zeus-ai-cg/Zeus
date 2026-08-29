import { Link } from "@tanstack/react-router";
import { StarRating } from "./StarRating";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageSquare, ThumbsUp, Folder } from "lucide-react";
import type { FeedbackRow } from "@/lib/feedback.functions";

interface FeedbackCardProps {
  feedback: FeedbackRow & {
    feedback_attachments?: unknown[];
    feedback_projects?: unknown[];
    public_feedback_conversations?: unknown[];
  };
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

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function FeedbackCard({ feedback }: FeedbackCardProps) {
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

        <CardFooter className="border-t px-4 py-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <ThumbsUp className="size-3" />
            <span>
              {feedback.helpful_count}{" "}
              {feedback.helpful_count === 1 ? "person" : "people"} found this helpful
            </span>
          </div>
        </CardFooter>
      </Card>
    </Link>
  );
}
