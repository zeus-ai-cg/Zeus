import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFeedback,
  createConversationSnapshot,
  attachProjectToFeedback,
  getFeedbackUploadUrl,
  confirmFeedbackUpload,
  listMyFeedback,
  type FeedbackCategory,
} from "@/lib/feedback.functions";
import { listThreads, getThreadMessages } from "@/lib/threads.functions";
import { listWorkspaceProjects } from "@/lib/workspace.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { StarRating } from "./StarRating";
import { toast } from "sonner";
import {
  Loader2,
  Send,
  MessageSquare,
  Folder,
  Paperclip,
  X,
  AlertTriangle,
} from "lucide-react";

interface FeedbackComposerProps {
  onClose: () => void;
  initialThreadId?: string;
}

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: "general", label: "General" },
  { value: "chat", label: "Chat" },
  { value: "engineer", label: "Engineer" },
  { value: "memory", label: "Memory" },
  { value: "skills", label: "Skills" },
  { value: "desktop", label: "Desktop" },
  { value: "vscode", label: "VS Code" },
  { value: "billing", label: "Billing" },
  { value: "performance", label: "Performance" },
  { value: "other", label: "Other" },
];

const ALLOWED_FILE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
];

export function FeedbackComposer({ onClose, initialThreadId }: FeedbackComposerProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"compose" | "conversation" | "preview">("compose");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rating, setRating] = useState(0);
  const [category, setCategory] = useState<FeedbackCategory>("general");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [files, setFiles] = useState<File[]>([]);

  // Conversation sharing
  const [selectedThread, setSelectedThread] = useState<string | null>(initialThreadId ?? null);
  const [shareConversation, setShareConversation] = useState(false);
  const [conversationTitle, setConversationTitle] = useState("");
  const [conversationMessages, setConversationMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [showSensitiveWarning, setShowSensitiveWarning] = useState(false);
  const [confirmedSensitive, setConfirmedSensitive] = useState(false);

  // Project sharing
  const [shareProject, setShareProject] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState("");
  const [projectDescription, setProjectDescription] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const createFn = useServerFn(createFeedback);
  const createConvFn = useServerFn(createConversationSnapshot);
  const attachProjectFn = useServerFn(attachProjectToFeedback);
  const uploadFn = useServerFn(getFeedbackUploadUrl);
  const confirmFn = useServerFn(confirmFeedbackUpload);

  // Load threads for conversation sharing
  const threadsFn = useServerFn(listThreads);
  const { data: threads } = useQuery({
    queryKey: ["threads-for-feedback"],
    queryFn: () => threadsFn({} as any),
    enabled: step === "conversation",
  });

  // Load messages when thread selected
  const messagesFn = useServerFn(getThreadMessages);
  const { data: threadMessages } = useQuery({
    queryKey: ["thread-messages", selectedThread],
    queryFn: () => messagesFn({ data: { threadId: selectedThread! } }),
    enabled: !!selectedThread && step === "conversation",
  });

  // Load projects
  const projectsFn = useServerFn(listWorkspaceProjects);
  const { data: projects } = useQuery({
    queryKey: ["projects-for-feedback"],
    queryFn: () => projectsFn({} as any),
    enabled: step === "compose" && shareProject,
  });

  const handleThreadSelect = (threadId: string) => {
    setSelectedThread(threadId);
    if (threadMessages) {
      setConversationMessages(
        threadMessages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: (m.parts as Array<{ type: string; text?: string }>)
              .filter((p) => p.type === "text")
              .map((p) => p.text ?? "")
              .join("\n"),
          }))
          .filter((m) => m.content.trim()),
      );
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    const valid = selected.filter(
      (f) => ALLOWED_FILE_TYPES.includes(f.type) && f.size <= 10 * 1024 * 1024,
    );
    if (valid.length !== selected.length) {
      toast.error("Some files were skipped (invalid type or too large, max 10MB).");
    }
    setFiles((prev) => [...prev, ...valid].slice(0, 5));
  };

  const handleSubmit = async () => {
    if (!rating) {
      toast.error("Please select a rating.");
      return;
    }
    if (body.trim().length < 10) {
      toast.error("Feedback must be at least 10 characters.");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Create feedback
      const fb = await createFn({
        data: {
          title: title || undefined,
          body,
          rating,
          category,
          visibility,
        },
      });

      // 2. Upload files
      for (const file of files) {
        try {
          const { attachment, signedUploadUrl } = await uploadFn({
            data: {
              feedbackId: fb.id,
              fileName: file.name,
              mimeType: file.type,
              fileSize: file.size,
            },
          });

          // Upload to signed URL
          await fetch(signedUploadUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type },
          });

          await confirmFn({
            data: { attachmentId: attachment.id, storagePath: attachment.storage_path },
          });
        } catch (err) {
          console.error("File upload failed:", err);
        }
      }

      // 3. Share conversation
      if (shareConversation && conversationMessages.length > 0 && confirmedSensitive) {
        try {
          await createConvFn({
            data: {
              feedbackId: fb.id,
              title: conversationTitle || undefined,
              messages: conversationMessages,
            },
          });
        } catch (err) {
          console.error("Conversation snapshot failed:", err);
        }
      }

      // 4. Attach project
      if (shareProject && selectedProject) {
        try {
          await attachProjectFn({
            data: {
              feedbackId: fb.id,
              projectId: selectedProject,
              title: projectTitle || "My Project",
              description: projectDescription || undefined,
            },
          });
        } catch (err) {
          console.error("Project attach failed:", err);
        }
      }

      toast.success("Feedback submitted! Thank you for helping us improve.");
      queryClient.invalidateQueries({ queryKey: ["public-feedback"] });
      queryClient.invalidateQueries({ queryKey: ["my-feedback"] });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit feedback.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Give Feedback</DialogTitle>
          <DialogDescription>
            Share your experience, report issues, or showcase what you built with Zeus AI.
          </DialogDescription>
        </DialogHeader>

        {step === "compose" && (
          <div className="space-y-4">
            {/* Rating */}
            <div className="space-y-2">
              <Label>Rating *</Label>
              <StarRating rating={rating} size="lg" interactive onChange={setRating} />
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="fb-title">Title (optional)</Label>
              <Input
                id="fb-title"
                placeholder="e.g., Zeus helped me build my first SaaS"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
            </div>

            {/* Body */}
            <div className="space-y-2">
              <Label htmlFor="fb-body">Your feedback *</Label>
              <Textarea
                id="fb-body"
                placeholder="Tell us about your experience..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                maxLength={5000}
              />
              <p className="text-right text-xs text-muted-foreground">
                {body.length}/5000
              </p>
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label>Category</Label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((cat) => (
                  <Badge
                    key={cat.value}
                    variant={category === cat.value ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setCategory(cat.value)}
                  >
                    {cat.label}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Visibility */}
            <div className="space-y-2">
              <Label>Visibility</Label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="visibility"
                    value="public"
                    checked={visibility === "public"}
                    onChange={() => setVisibility("public")}
                  />
                  Public
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="visibility"
                    value="private"
                    checked={visibility === "private"}
                    onChange={() => setVisibility("private")}
                  />
                  Private
                </label>
              </div>
            </div>

            {/* File attachments */}
            <div className="space-y-2">
              <Label>Attachments (optional, max 5)</Label>
              <div className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    <Paperclip className="size-3" />
                    {f.name.slice(0, 20)}
                    <button
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              {files.length < 5 && (
                <Input
                  type="file"
                  accept={ALLOWED_FILE_TYPES.join(",")}
                  multiple
                  onChange={handleFileChange}
                  className="text-xs"
                />
              )}
            </div>

            {/* Share conversation toggle */}
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="share-conv"
                  checked={shareConversation}
                  onCheckedChange={(c) => setShareConversation(c === true)}
                />
                <Label htmlFor="share-conv" className="flex items-center gap-1.5 text-sm">
                  <MessageSquare className="size-3.5" />
                  Share a conversation
                </Label>
              </div>
            </div>

            {/* Share project toggle */}
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="share-proj"
                  checked={shareProject}
                  onCheckedChange={(c) => setShareProject(c === true)}
                />
                <Label htmlFor="share-proj" className="flex items-center gap-1.5 text-sm">
                  <Folder className="size-3.5" />
                  Showcase a project
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (shareConversation) {
                    setStep("conversation");
                  } else {
                    setStep("preview");
                  }
                }}
                disabled={!rating || body.trim().length < 10}
              >
                Next
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "conversation" && (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep("compose")}>
              ← Back
            </Button>

            <div className="space-y-2">
              <Label>Select conversation to share</Label>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                {threads?.map((t) => (
                  <button
                    key={t.id}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      selectedThread === t.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                    onClick={() => handleThreadSelect(t.id)}
                  >
                    {t.title || "Untitled"}
                  </button>
                ))}
                {threads && threads.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No conversations yet.
                  </p>
                )}
              </div>
            </div>

            {conversationMessages.length > 0 && (
              <>
                <div className="space-y-2">
                  <Label>Preview ({conversationMessages.length} messages)</Label>
                  <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-2 text-xs">
                    {conversationMessages.slice(0, 5).map((m, i) => (
                      <div key={i}>
                        <span className="font-medium">
                          {m.role === "user" ? "You" : "Zeus"}:
                        </span>{" "}
                        {m.content.slice(0, 100)}
                        {m.content.length > 100 && "..."}
                      </div>
                    ))}
                    {conversationMessages.length > 5 && (
                      <p className="text-muted-foreground">
                        ...and {conversationMessages.length - 5} more messages
                      </p>
                    )}
                  </div>
                </div>

                {/* Sensitive content warning */}
                {!showSensitiveWarning ? (
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => setShowSensitiveWarning(true)}
                  >
                    <AlertTriangle className="size-4" />
                    Continue with sharing
                  </Button>
                ) : (
                  <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
                    <div className="mb-2 flex items-center gap-2 font-medium text-yellow-600 dark:text-yellow-400">
                      <AlertTriangle className="size-4" />
                      Sensitive Content Warning
                    </div>
                    <p className="mb-2 text-muted-foreground">
                      This conversation will be visible to other Zeus users. Make sure it does
                      not contain passwords, API keys, personal information, private business
                      information, or other sensitive content.
                    </p>
                    <label className="flex items-center gap-2">
                      <Checkbox
                        checked={confirmedSensitive}
                        onCheckedChange={(c) => setConfirmedSensitive(c === true)}
                      />
                      <span>I understand and confirm this content is safe to share publicly.</span>
                    </label>
                  </div>
                )}

                <DialogFooter>
                  <Button variant="ghost" onClick={() => setStep("compose")}>
                    Back
                  </Button>
                  <Button
                    onClick={() => setStep("preview")}
                    disabled={shareConversation && !confirmedSensitive}
                  >
                    Next
                  </Button>
                </DialogFooter>
              </>
            )}

            {conversationMessages.length === 0 && selectedThread && (
              <p className="text-center text-sm text-muted-foreground">
                Loading conversation...
              </p>
            )}
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep("compose")}>
              ← Back
            </Button>

            {/* Preview */}
            <div className="space-y-3 rounded-md border p-4">
              <div className="flex items-center justify-between">
                <StarRating rating={rating} size="sm" />
                <Badge variant="secondary">{category}</Badge>
              </div>
              {title && <h3 className="font-semibold">{title}</h3>}
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{body}</p>
              {files.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {files.map((f, i) => (
                    <Badge key={i} variant="outline" className="text-[10px]">
                      <Paperclip className="mr-1 size-2" />
                      {f.name}
                    </Badge>
                  ))}
                </div>
              )}
              {shareConversation && conversationMessages.length > 0 && (
                <Badge variant="outline" className="gap-1">
                  <MessageSquare className="size-3" />
                  {conversationMessages.length} messages shared
                </Badge>
              )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("compose")}>
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Submit Feedback
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
