import { useChat } from "@ai-sdk/react";
import { useVoice } from "@/hooks/use-voice";
import { VoiceControl, VoiceStatusPill } from "@/components/VoiceControl";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  ArrowUp,
  Code2,
  Sparkles,
  Square,
  User,
  Copy,
  Bookmark,
  Download,
  X,
  ArrowDown,
  Plus,
  ImageIcon,
  FileText,
  FileArchive,
  FileCode,
  FolderTree,
  Zap,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getMe, setLearningMode, createSnippet } from "@/lib/profile.functions";
import { getThread, setThreadWorkspaceProject } from "@/lib/threads.functions";
import { listWorkspaceProjects } from "@/lib/workspace.functions";
import {
  LEARNING_MODES,
  FREE_QUESTION_LIMIT,
  PRO_MONTHLY_REQUEST_LIMIT,
  PRO_SOFT_WARNING_THRESHOLD,
  isLearningModeLocked,
} from "@/lib/achievements";
import { isProOrAbove, isUltimate } from "@/lib/plans";
import { detectEngineerIntent } from "@/lib/engineer.schema";
import { EngineerModePanel } from "@/components/EngineerModePanel";
import { CreditsBadge } from "@/components/CreditsBadge";
import { detectContinuationIntent } from "@/lib/continue.schema";
import { SmartContinuePanel } from "@/components/SmartContinuePanel";
import { detectPowerFeature } from "@/lib/power-features";

type Props = {
  threadId: string;
  initialMessages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    parts: Array<{ type: string; text?: string }>;
  }>;
  initialPrompt?: string;
};

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

// The `ai` package throws `new Error(await response.text())` for any non-2xx
// /api/chat response, so for our 429s (limit_reached / fair_usage_limit_reached)
// the raw message is a JSON body, not a plain string. Unwrap it so the UI
// shows the friendly `message` field instead of raw JSON.
function friendlyChatError(message: string | undefined): string {
  if (!message) return "Something went wrong";
  try {
    const parsed = JSON.parse(message);
    if (parsed && typeof parsed.message === "string") return parsed.message;
  } catch {
    // not JSON — show as-is
  }
  return message;
}
const MAX_IMAGES = 4;
const MAX_DOCS = 4;
const MAX_DOC_BYTES = 5 * 1024 * 1024; // 5 MB
const TEXT_EXTENSIONS = [
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "sql",
  "yml",
  "yaml",
  "toml",
  "xml",
  "html",
  "htm",
  "css",
  "scss",
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "c",
  "h",
  "cpp",
  "hpp",
  "cc",
  "cs",
  "php",
  "sh",
  "bash",
  "zsh",
  "ps1",
  "dart",
  "lua",
  "r",
  "vue",
  "svelte",
  "ini",
  "env",
  "conf",
  "log",
  "diff",
  "patch",
  "gradle",
  "makefile",
  "dockerfile",
];
const CODE_EXTENSIONS = [
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "c",
  "h",
  "cpp",
  "hpp",
  "cc",
  "cs",
  "php",
  "sh",
  "bash",
  "zsh",
  "ps1",
  "dart",
  "lua",
  "r",
  "vue",
  "svelte",
  "sql",
];
const IMAGE_INPUT_ACCEPT = "image/png,image/jpeg,image/jpg,image/webp";
const PDF_ONLY_ACCEPT = ".pdf,application/pdf";
const DOCUMENT_INPUT_ACCEPT =
  ".txt,.md,.markdown,.json,.csv,.yml,.yaml,.toml,.xml,.html,.htm,.doc,.docx,text/*";
const CODE_INPUT_ACCEPT = CODE_EXTENSIONS.map((e) => `.${e}`).join(",");
const ZIP_INPUT_ACCEPT = ".zip,application/zip";
// Skip binary/build-output/lockfile noise when summarizing an uploaded ZIP,
// mirroring the same skip pattern the Workspace ZIP importer uses — this is
// a local copy (not an import) so the composer never depends on, or
// modifies, the Workspace import code path.
const ZIP_SKIP_PATTERN =
  /\.(png|jpe?g|gif|webp|ico|bmp|svg|pdf|zip|tar|gz|7z|rar|woff2?|ttf|eot|otf|mp4|mp3|wav|mov|avi|exe|dll|so|dylib|class|jar|db|sqlite)$/i;
const ZIP_SKIP_DIRS = /(^|\/)(node_modules|dist|build|\.git|\.next|\.turbo|coverage|vendor)\//i;
const MAX_ZIP_FILES_SUMMARIZED = 400;
const MAX_ZIP_FILE_BYTES_INLINED = 20_000;
const MAX_ZIP_TOTAL_INLINED_BYTES = 150_000;

type DocAttachment = {
  name: string;
  kind: "text" | "pdf";
  text?: string;
  dataUrl?: string;
  mediaType?: string;
};

const getDataUrlMediaType = (dataUrl: string) => {
  const match = dataUrl.match(/^data:([^;,]+)(?:;base64)?,/i);
  return match?.[1] ?? "image/png";
};

export function ChatWindow({ threadId, initialMessages, initialPrompt }: Props) {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [docs, setDocs] = useState<DocAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  // ⚡ Zeus Project Engineer (Feature 1) — set to the triggering prompt to
  // show the full-project-generation overlay instead of a normal chat turn.
  const [engineerPrompt, setEngineerPrompt] = useState<string | null>(null);
  // ⚡ Zeus Smart Continue (Feature 5) — set to the triggering prompt to
  // modify the thread's attached project instead of a normal chat turn.
  const [continuePrompt, setContinuePrompt] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const seededRef = useRef(false);
  const qc = useQueryClient();

  const meFn = useServerFn(getMe);
  const modeFn = useServerFn(setLearningMode);
  const { data: profile } = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const modeMut = useMutation({
    mutationFn: (mode: string) => modeFn({ data: { mode: mode as never } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
    onError: (e: Error) => toast.error(e.message || "Couldn't switch learning mode."),
  });

  const threadFn = useServerFn(getThread);
  const { data: threadInfo } = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => threadFn({ data: { id: threadId } }),
  });
  const projectsFn = useServerFn(listWorkspaceProjects);
  const { data: workspaceProjects = [] } = useQuery({
    queryKey: ["workspace-projects"],
    queryFn: () => projectsFn(),
  });
  const attachProjectFn = useServerFn(setThreadWorkspaceProject);
  const attachProjectMut = useMutation({
    mutationFn: (workspaceProjectId: string | null) =>
      attachProjectFn({ data: { id: threadId, workspaceProjectId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["thread", threadId] }),
    onError: (e: Error) => toast.error(e.message || "Couldn't update the attached project."),
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
  }, []);

  const initialUI: UIMessage[] = useMemo(
    () =>
      initialMessages.map((m) => ({
        id: m.id,
        role: m.role,
        parts: m.parts as UIMessage["parts"],
      })) as UIMessage[],
    [initialMessages],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: async (): Promise<Record<string, string>> => {
          const { data } = await supabase.auth.getSession();
          const accessToken = data.session?.access_token;
          return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
        },
        body: { threadId },
      }),
    [threadId],
  );

  // Zeus Live Voice — a voice turn's transcript is submitted through the
  // exact same pipeline as typed input (same thread, same /api/chat stream).
  // The hook stays "processing" until completeTurn() fires in onFinish.
  const voice = useVoice({
    onTranscript: (text) => {
      void submit(text);
    },
  });

  const { messages, sendMessage, status, stop, error } = useChat({
    id: threadId,
    messages: initialUI,
    transport,
    onError: (e) => {
      toast.error(friendlyChatError(e.message));
      // The optimistic increment below may have been wrong (e.g. the request
      // never reached the server, or the 429 limit-reached response fired).
      // Re-sync with the authoritative server count so the badge never drifts.
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onFinish: (result) => {
      // Reconcile with the server's true usage count once the full response has
      // streamed in, and refresh the thread list, since the server renames
      // "New conversation" to the first message's text on the first turn.
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["threads"] });
      // Zeus speaks the reply: voice turns always speak, typed turns speak
      // when auto-speak is on. Nothing here blocks or alters the response.
      const replyText = (result.message?.parts ?? [])
        .filter((p) => p.type === "text")
        .map((p) => (p as { text?: string }).text ?? "")
        .join("");
      voice.completeTurn(replyText);
    },
  });

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  useEffect(() => {
    scrollToBottom("smooth");
  }, [messages, status]);
  useEffect(() => {
    textareaRef.current?.focus();
  }, [threadId, status]);

  // Safety net: if a stream ends without onFinish (abort/timeout) while a
  // voice turn is still marked "processing", return the voice UI to idle.
  useEffect(() => {
    if (status === "ready" && voice.state === "processing") voice.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, voice.state]);

  // Track scroll position for "scroll to bottom" button
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollBtn(distanceFromBottom > 200);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [messages.length]);

  const isPro = isProOrAbove(profile?.plan);
  const ultimate = isUltimate(profile?.plan);
  const used = profile?.questions_used ?? 0;
  const remaining = profile?.remaining ?? 0;
  const proUsed = profile?.pro_requests_used ?? 0;
  const proLimit = profile?.pro_limit ?? PRO_MONTHLY_REQUEST_LIMIT;
  const proRemaining = profile?.pro_remaining ?? Math.max(0, proLimit - proUsed);
  const proLimitReached = isPro && !ultimate && proUsed >= proLimit;
  const proSoftWarning =
    isPro &&
    !ultimate &&
    !proLimitReached &&
    (profile?.pro_soft_warning ?? proUsed >= PRO_SOFT_WARNING_THRESHOLD);
  const limitReached = (!isPro && used >= FREE_QUESTION_LIMIT) || proLimitReached;

  // Fair Usage Policy: nudge Pro users once when they cross the soft-warning
  // threshold, without spamming a toast on every render/message.
  const warnedRef = useRef(false);
  useEffect(() => {
    if (proSoftWarning && !warnedRef.current) {
      warnedRef.current = true;
      toast.warning("Approaching your Pro Fair Usage limit", {
        description: `You've used ${proUsed.toLocaleString()} of ${proLimit.toLocaleString()} monthly requests. Your limit resets automatically each billing cycle.`,
      });
    }
    if (!proSoftWarning) warnedRef.current = false;
  }, [proSoftWarning, proUsed, proLimit]);

  const submit = async (text?: string) => {
    let value = (text ?? input).trim();
    if (!value && images.length === 0 && docs.length === 0) return;
    if (!token) return;
    if (limitReached) {
      toast.error(
        proLimitReached
          ? `You've reached Zeus AI Pro's Fair Usage Policy limit of ${proLimit.toLocaleString()} requests this billing cycle. It resets automatically next cycle.`
          : "You've used all 15 free questions. They reset every 24 hours.",
      );
      return;
    }

    // ⚡ Zeus Project Engineer Mode — "Build...", "Create...", "Clone...",
    // "Develop...", "Generate..." style requests (with no attachments)
    // switch into full-project generation instead of a normal chat turn.
    // See src/lib/engineer.schema.ts for the detection rule.
    if (images.length === 0 && docs.length === 0 && detectEngineerIntent(value)) {
      // Issue 3 — Free plan gets exactly one Engineer project, ever.
      // engineer_free_project_used is permanent (never resets with the
      // 24h question-quota window), so this check is independent of
      // `limitReached` above. Normal chat still works — only the
      // Engineer Mode entry point is blocked.
      if (!isPro && profile?.engineer_free_project_used) {
        toast.error("You've used your free project. Upgrade to Pro to continue.");
        return;
      }
      setEngineerPrompt(value);
      setInput("");
      return;
    }

    // ⚡ Zeus Smart Continue — only once a project is attached to this
    // thread (via Engineer Mode's "Save to Workspace" or the picker in the
    // top bar). "Add Stripe", "Dark Mode", "Convert to Next.js", etc. get
    // routed through the existing diff-based modification system instead
    // of a normal chat reply — never a full regeneration.
    if (
      images.length === 0 &&
      docs.length === 0 &&
      threadInfo?.workspace_project_id &&
      detectContinuationIntent(value)
    ) {
      setContinuePrompt(value);
      setInput("");
      return;
    }

    // Inline text/code docs into the prompt so the model sees them verbatim.
    const textDocs = docs.filter((d) => d.kind === "text" && d.text);
    if (textDocs.length > 0) {
      const blocks = textDocs
        .map((d) => {
          const ext = (d.name.split(".").pop() || "").toLowerCase();
          return `\n\n--- File: ${d.name} ---\n\`\`\`${ext || ""}\n${d.text}\n\`\`\``;
        })
        .join("");
      value = (value ? value : "Please analyze the attached file(s).") + blocks;
    }

    // Optimistically bump the usage counter right away so the badge updates
    // the instant a message is sent, instead of waiting for the full
    // streamed response to finish (onFinish reconciles with the real
    // server-side count once it lands, and onError rolls this back).
    qc.setQueryData(["me"], (old: typeof profile | undefined) => {
      if (!old) return old;
      if (isPro) {
        const pro_requests_used = old.pro_requests_used + 1;
        return {
          ...old,
          pro_requests_used,
          pro_remaining: Math.max(0, old.pro_limit - pro_requests_used),
          pro_soft_warning: pro_requests_used >= PRO_SOFT_WARNING_THRESHOLD,
        };
      }
      return {
        ...old,
        questions_used: old.questions_used + 1,
        remaining: old.remaining != null ? Math.max(0, old.remaining - 1) : old.remaining,
      };
    });

    setInput("");
    const attachedImages = images;
    const pdfDocs = docs.filter((d) => d.kind === "pdf" && d.dataUrl);
    setImages([]);
    setDocs([]);

    if (attachedImages.length > 0 || pdfDocs.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts: any[] = [
        ...attachedImages.map((image, index) => ({
          type: "file",
          mediaType: getDataUrlMediaType(image),
          filename: `image-${index + 1}`,
          url: image,
        })),
        ...pdfDocs.map((d) => ({
          type: "file",
          mediaType: d.mediaType ?? "application/pdf",
          filename: d.name,
          url: d.dataUrl,
        })),
        ...(value ? [{ type: "text", text: value }] : []),
      ];
      await sendMessage({ parts } as never);
    } else {
      await sendMessage({ text: value });
    }
  };

  // Seed initial prompt from query string (e.g. clicked a course card)
  useEffect(() => {
    if (seededRef.current) return;
    if (!initialPrompt || !token) return;
    if (messages.length > 0) {
      seededRef.current = true;
      return;
    }
    seededRef.current = true;
    submit(initialPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt, token, messages.length]);

  const readAsText = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result ?? ""));
      r.onerror = () => reject(r.error);
      r.readAsText(file);
    });
  const readAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result ?? ""));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });

  // Builds a text summary of an uploaded ZIP's structure, languages, and
  // dependencies so it can be inlined into the prompt like any other text
  // attachment. This only reads the archive in-memory in the browser — it
  // never touches the Workspace project-import flow or its data.
  const summarizeZip = async (file: File): Promise<string> => {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(file);
    const entries = Object.values(zip.files).filter((e) => !e.dir);

    const paths = entries.map((e) => e.name);
    const relevant = entries.filter(
      (e) => !ZIP_SKIP_PATTERN.test(e.name) && !ZIP_SKIP_DIRS.test(e.name),
    );

    const extCounts = new Map<string, number>();
    for (const e of relevant) {
      const ext = (e.name.split(".").pop() || "").toLowerCase();
      extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1);
    }
    const topExts = Array.from(extCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);

    const manifestNames = [
      "package.json",
      "requirements.txt",
      "pyproject.toml",
      "Cargo.toml",
      "go.mod",
      "composer.json",
      "Gemfile",
      "pom.xml",
      "build.gradle",
    ];
    const manifests = relevant.filter((e) => manifestNames.includes(e.name.split("/").pop() || ""));

    let inlinedBytes = 0;
    const manifestBlocks: string[] = [];
    for (const m of manifests.slice(0, 6)) {
      const text = await m.async("string");
      if (
        text.length <= MAX_ZIP_FILE_BYTES_INLINED &&
        inlinedBytes + text.length <= MAX_ZIP_TOTAL_INLINED_BYTES
      ) {
        inlinedBytes += text.length;
        manifestBlocks.push(`--- ${m.name} ---\n${text}`);
      }
    }

    const fileList = paths.slice(0, MAX_ZIP_FILES_SUMMARIZED).join("\n");
    const truncatedNote =
      paths.length > MAX_ZIP_FILES_SUMMARIZED
        ? `\n… and ${paths.length - MAX_ZIP_FILES_SUMMARIZED} more files (truncated).`
        : "";

    return [
      `ZIP project: ${file.name}`,
      `Total files: ${paths.length} (${relevant.length} source/text files, rest skipped as binary/build output).`,
      `Top file types: ${topExts.map(([ext, n]) => `${ext || "(no ext)"}: ${n}`).join(", ") || "n/a"}.`,
      `\nFile tree:\n${fileList}${truncatedNote}`,
      manifestBlocks.length > 0
        ? `\nDependency/manifest files:\n${manifestBlocks.join("\n\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  };

  const addFile = async (file: File) => {
    // Images
    if (ACCEPTED_IMAGE_TYPES.includes(file.type) || file.type.startsWith("image/")) {
      if (file.size > 4 * 1024 * 1024) {
        toast.error("Image must be under 4 MB");
        return;
      }
      if (images.length >= MAX_IMAGES) {
        toast.error(`You can attach up to ${MAX_IMAGES} images per message`);
        return;
      }
      const url = await readAsDataUrl(file);
      setImages((prev) => (prev.length >= MAX_IMAGES ? prev : [...prev, url]));
      return;
    }

    if (docs.length >= MAX_DOCS) {
      toast.error(`You can attach up to ${MAX_DOCS} files per message`);
      return;
    }
    if (file.size > MAX_DOC_BYTES) {
      toast.error(`${file.name} is over 5 MB`);
      return;
    }

    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const isPdf = file.type === "application/pdf" || ext === "pdf";
    const isZip = file.type === "application/zip" || ext === "zip";
    const isTextish =
      file.type.startsWith("text/") ||
      TEXT_EXTENSIONS.includes(ext) ||
      file.type === "application/json" ||
      file.type === "application/xml";

    if (isZip) {
      try {
        const summary = await summarizeZip(file);
        setDocs((prev) => [...prev, { name: file.name, kind: "text", text: summary }]);
      } catch {
        toast.error(`Could not read ${file.name} as a ZIP archive`);
      }
      return;
    }
    if (isPdf) {
      const dataUrl = await readAsDataUrl(file);
      setDocs((prev) => [
        ...prev,
        { name: file.name, kind: "pdf", dataUrl, mediaType: "application/pdf" },
      ]);
      return;
    }
    if (isTextish) {
      try {
        const text = await readAsText(file);
        setDocs((prev) => [...prev, { name: file.name, kind: "text", text }]);
      } catch {
        toast.error(`Could not read ${file.name}`);
      }
      return;
    }
    toast.error(`${file.name}: unsupported file type. Try PDF, images, or a code/text file.`);
  };

  const addFiles = (files: FileList | File[]) => {
    Array.from(files)
      .slice(0, MAX_IMAGES + MAX_DOCS)
      .forEach((f) => {
        void addFile(f);
      });
  };

  // Reuses the single hidden <input type="file"> for every "+" menu item —
  // just swap its accept filter right before opening the native picker.
  const openFilePicker = (accept: string) => {
    const el = fileRef.current;
    if (!el) return;
    el.accept = accept;
    el.multiple = accept !== ZIP_INPUT_ACCEPT;
    el.click();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pasted: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f && f.type.startsWith("image/")) pasted.push(f);
      }
    }
    if (pasted.length > 0) {
      e.preventDefault();
      addFiles(pasted);
      toast.success(
        `${pasted.length} image${pasted.length > 1 ? "s" : ""} attached from clipboard`,
      );
    }
  };

  const isLoading = status === "submitted" || status === "streaming";
  const isEmpty = messages.length === 0;
  // Feature 11 — only surfaced as a small chip, never a menu; mutually
  // exclusive with the Engineer Mode affordance (build-a-whole-project
  // intent always takes visual priority when both would otherwise match).
  const detectedPowerFeature = useMemo(
    () =>
      images.length === 0 && docs.length === 0 && !detectEngineerIntent(input)
        ? detectPowerFeature(input)
        : null,
    [input, images.length, docs.length],
  );

  return (
    <div className="h-full flex flex-col relative">
      {engineerPrompt && (
        <EngineerModePanel
          prompt={engineerPrompt}
          onClose={() => setEngineerPrompt(null)}
          onSaved={(projectId) => attachProjectMut.mutate(projectId)}
        />
      )}
      {continuePrompt && threadInfo?.workspace_project_id && (
        <SmartContinuePanel
          projectId={threadInfo.workspace_project_id}
          projectName={
            workspaceProjects.find((p) => p.id === threadInfo.workspace_project_id)?.name ??
            "this project"
          }
          instructions={continuePrompt}
          onClose={() => setContinuePrompt(null)}
        />
      )}

      {/* Top bar: learning mode + usage */}
      <div className="border-b border-border px-4 py-2 flex items-center justify-between gap-3 bg-background/60 backdrop-blur">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground hidden sm:inline">Mode:</span>
          <Select
            value={profile?.learning_mode ?? "beginner"}
            onValueChange={(v) => {
              if (isLearningModeLocked(v, profile?.plan)) {
                toast.error("That's a Pro learning mode", {
                  description: "Upgrade to Zeus AI Pro to unlock it.",
                  action: { label: "Upgrade", onClick: () => navigate({ to: "/upgrade" }) },
                });
                return;
              }
              modeMut.mutate(v);
            }}
          >
            <SelectTrigger className="h-8 w-[200px] text-xs">
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
          {workspaceProjects.length > 0 && (
            <>
              <span className="text-muted-foreground hidden sm:inline ml-2">Project:</span>
              <Select
                value={threadInfo?.workspace_project_id ?? "none"}
                onValueChange={(v) => attachProjectMut.mutate(v === "none" ? null : v)}
              >
                <SelectTrigger className="h-8 w-[180px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {workspaceProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <CreditsBadge />
          {isPro ? (
            <span
              className={cn(
                "font-semibold flex items-center gap-1",
                ultimate
                  ? "text-amber-500"
                  : proLimitReached
                    ? "text-destructive"
                    : proSoftWarning
                      ? "text-amber-500"
                      : "text-accent",
              )}
              title={
                ultimate
                  ? "Zeus AI Ultimate — no Fair Usage Policy"
                  : "Zeus AI Pro Fair Usage Policy"
              }
            >
              <Sparkles className="size-3" />{" "}
              {ultimate
                ? "Ultimate · Unlimited"
                : `Pro · ${proUsed.toLocaleString()} / ${proLimit.toLocaleString()}`}
            </span>
          ) : (
            <>
              <span className="font-mono">
                {used} / {FREE_QUESTION_LIMIT} used
              </span>
              <Link to="/upgrade" className="text-primary hover:underline">
                Upgrade
              </Link>
            </>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className={cn(
          "flex-1 overflow-y-auto scroll-smooth relative",
          isDragging && "ring-2 ring-primary/60 ring-inset",
        )}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.types).includes("Files")) {
            e.preventDefault();
            setIsDragging(true);
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setIsDragging(false);
        }}
        onDrop={(e) => {
          if (e.dataTransfer.files?.length) {
            e.preventDefault();
            setIsDragging(false);
            addFiles(e.dataTransfer.files);
          }
        }}
      >
        <div className="max-w-3xl mx-auto px-4 py-8">
          {isEmpty ? (
            <EmptyState onPick={(s) => submit(s)} disabled={limitReached} />
          ) : (
            <div className="space-y-6">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {status === "submitted" && (
                <div className="flex gap-3">
                  <Avatar role="assistant" />
                  <div className="flex items-center gap-1 pt-2">
                    <span className="size-1.5 rounded-full bg-muted-foreground/70 animate-bounce [animation-delay:-0.3s]" />
                    <span className="size-1.5 rounded-full bg-muted-foreground/70 animate-bounce [animation-delay:-0.15s]" />
                    <span className="size-1.5 rounded-full bg-muted-foreground/70 animate-bounce" />
                  </div>
                </div>
              )}
              {error && (
                <div className="text-sm text-destructive">{friendlyChatError(error.message)}</div>
              )}
            </div>
          )}
        </div>
        {isDragging && (
          <div className="pointer-events-none absolute inset-4 rounded-2xl border-2 border-dashed border-primary/60 bg-primary/5 grid place-items-center">
            <p className="text-sm font-medium text-primary">Drop images to attach</p>
          </div>
        )}
      </div>

      {showScrollBtn && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          aria-label="Scroll to latest message"
          className="absolute right-4 bottom-32 sm:bottom-28 z-20 size-9 rounded-full border border-border bg-background/90 backdrop-blur shadow-lg grid place-items-center hover:bg-secondary transition-all animate-in fade-in slide-in-from-bottom-2"
        >
          <ArrowDown className="size-4" />
        </button>
      )}

      {limitReached && (
        <div className="border-t border-border bg-destructive/5 px-4 py-3 text-center">
          {proLimitReached ? (
            <p className="text-sm">
              You've reached Zeus AI Pro's <strong>Fair Usage Policy</strong> limit of{" "}
              <strong>{proLimit.toLocaleString()}</strong> requests for this billing cycle. Thanks
              for being such an active learner — your limit resets automatically next cycle. Need
              more? Email{" "}
              <a
                href="mailto:Haidersiddique0909@gmail.com"
                className="text-primary hover:underline"
              >
                Haidersiddique0909@gmail.com
              </a>
              .
            </p>
          ) : (
            <>
              <p className="text-sm">
                You've used all <strong>{FREE_QUESTION_LIMIT}</strong> free questions. They reset
                every 24 hours.
              </p>
              <Button
                asChild
                size="sm"
                className="mt-2 bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow"
              >
                <Link to="/upgrade">
                  <Sparkles className="size-3.5 mr-1.5" /> Upgrade to Pro for unlimited
                </Link>
              </Button>
            </>
          )}
        </div>
      )}

      <div className="border-t border-border bg-background/80 backdrop-blur p-3 sm:p-4 sticky bottom-0">
        {detectedPowerFeature && (
          <div className="max-w-3xl mx-auto mb-2 animate-in fade-in slide-in-from-bottom-1">
            <span className="inline-flex items-center gap-1.5 text-xs text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
              {detectedPowerFeature.emoji} {detectedPowerFeature.label} detected
            </span>
          </div>
        )}
        {/* Zeus Live Voice — listening / thinking / speaking status pill */}
        <VoiceStatusPill voice={voice} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="max-w-3xl mx-auto"
        >
          <div className="relative rounded-2xl border border-border bg-card focus-within:border-primary/60 focus-within:shadow-glow transition-shadow">
            {(images.length > 0 || docs.length > 0) && (
              <div className="p-2 pb-0 flex flex-wrap gap-2">
                {images.map((src, i) => (
                  <div
                    key={`img-${i}`}
                    className="relative inline-block animate-in fade-in zoom-in-95"
                  >
                    <img
                      src={src}
                      alt={`attachment ${i + 1}`}
                      className="h-20 w-20 object-cover rounded-lg border border-border"
                    />
                    <button
                      type="button"
                      onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label={`Remove image ${i + 1}`}
                      className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-background border border-border grid place-items-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                {docs.map((d, i) => (
                  <div
                    key={`doc-${i}`}
                    className="relative flex items-center gap-2 h-20 max-w-[220px] pl-3 pr-4 rounded-lg border border-border bg-secondary/40 animate-in fade-in zoom-in-95"
                  >
                    <Code2 className="size-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{d.name}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">
                        {d.kind === "pdf" ? "PDF" : "Text/Code"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDocs((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label={`Remove file ${d.name}`}
                      className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-background border border-border grid place-items-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={
                limitReached
                  ? proLimitReached
                    ? "Fair Usage Policy limit reached — resets next billing cycle…"
                    : "Upgrade to Pro or wait for the reset…"
                  : "Ask anything, or attach code, PDFs, or screenshots… (Shift+Enter for newline)"
              }
              rows={1}
              className="resize-none border-0 bg-transparent focus-visible:ring-0 min-h-[56px] max-h-48 pl-12 pr-14 py-4"
              disabled={!token || limitReached}
            />
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="absolute left-2 bottom-2 size-9"
                  disabled={!token || limitReached}
                  aria-label="Add attachment"
                  title="Add attachment"
                >
                  <Plus className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-64">
                {workspaceProjects.length > 0 ? (
                  <>
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      Import project from workspace
                    </DropdownMenuLabel>
                    {workspaceProjects.map((p) => (
                      <DropdownMenuItem key={p.id} onSelect={() => attachProjectMut.mutate(p.id)}>
                        <FolderTree className="size-4 mr-2" /> {p.name}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                ) : (
                  <>
                    <DropdownMenuItem asChild>
                      <Link to="/workspace">
                        <FolderTree className="size-4 mr-2" /> Import Project from Workspace
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onSelect={() => openFilePicker(IMAGE_INPUT_ACCEPT)}>
                  <ImageIcon className="size-4 mr-2" /> Upload Images
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openFilePicker(PDF_ONLY_ACCEPT)}>
                  <FileText className="size-4 mr-2" /> Upload PDF
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openFilePicker(DOCUMENT_INPUT_ACCEPT)}>
                  <FileText className="size-4 mr-2" /> Upload Documents
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openFilePicker(CODE_INPUT_ACCEPT)}>
                  <FileCode className="size-4 mr-2" /> Upload Code Files
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openFilePicker(ZIP_INPUT_ACCEPT)}>
                  <FileArchive className="size-4 mr-2" /> Upload ZIP Project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <VoiceControl voice={voice} disabled={!token || limitReached} />
            {!isLoading &&
              detectEngineerIntent(input) &&
              images.length === 0 &&
              docs.length === 0 && (
                <div className="absolute right-12 bottom-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-primary hover:bg-primary/10"
                    title="This reads like a build request — send to open Zeus Project Engineer"
                    aria-label="Zeus Project Engineer will handle this"
                    onClick={() => submit()}
                  >
                    <Zap className="size-4" />
                  </Button>
                </div>
              )}
            <div className="absolute right-2 bottom-2">
              {isLoading ? (
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  onClick={() => stop()}
                  aria-label="Stop generating"
                >
                  <Square className="size-4" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={
                    (!input.trim() && images.length === 0 && docs.length === 0) ||
                    !token ||
                    limitReached
                  }
                  aria-label="Send message"
                  className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow transition-transform active:scale-95"
                >
                  <ArrowUp className="size-4" />
                </Button>
              )}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground text-center mt-2">
            Zeus AI may make mistakes. Always verify critical code.
            {!isPro && ` · ${remaining} of ${FREE_QUESTION_LIMIT} questions left`}
            {isPro &&
              (proSoftWarning || proLimitReached) &&
              ` · ${proRemaining.toLocaleString()} of ${proLimit.toLocaleString()} monthly requests left`}
          </p>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const text = message.parts
    .map((p) => (p.type === "text" ? (p as { text: string }).text : ""))
    .join("");
  const images = message.parts
    .filter((p) => p.type === ("image" as never) || p.type === "file")
    .map((p) => (p as { image?: string; url?: string }).image ?? (p as { url?: string }).url)
    .filter(Boolean) as string[];
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end group animate-in fade-in slide-in-from-bottom-1 duration-200">
        <div className="flex flex-col items-end gap-1 max-w-[85%]">
          {images.map((src, i) => (
            <img
              key={i}
              src={src}
              alt="attachment"
              className="max-h-48 rounded-xl border border-border"
            />
          ))}
          {text && (
            <div className="relative inline-block rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-2.5 whitespace-pre-wrap shadow-sm">
              {text}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(text);
                  toast.success("Copied");
                }}
                aria-label="Copy message"
                className="absolute -left-9 top-1 size-7 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                title="Copy"
              >
                <Copy className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 group animate-in fade-in slide-in-from-bottom-1 duration-200">
      <Avatar role="assistant" />
      <div className="flex-1 min-w-0">
        <div className="prose prose-sm prose-invert max-w-none prose-pre:p-0 prose-pre:bg-transparent prose-pre:border-0 prose-code:before:content-none prose-code:after:content-none prose-headings:font-semibold prose-a:text-accent">
          <ReactMarkdown
            components={{
              pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
            }}
          >
            {text}
          </ReactMarkdown>
        </div>
        {text && (
          <button
            onClick={() => {
              navigator.clipboard.writeText(text);
              toast.success("Copied");
            }}
            className="mt-1 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Copy className="size-3" /> Copy
          </button>
        )}
      </div>
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [lang, setLang] = useState("plaintext");
  const qc = useQueryClient();
  const save = useServerFn(createSnippet);
  const mut = useMutation({
    mutationFn: (vars: { title: string; language: string; code: string }) => save({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["snippets"] });
      toast.success("Saved to your snippets");
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    const codeEl = ref.current?.querySelector("code");
    const m = (codeEl?.className ?? "").match(/language-([\w-]+)/);
    if (m?.[1]) setLang(m[1]);
  }, [children]);

  const getCode = () => ref.current?.textContent ?? "";

  return (
    <div className="not-prose my-4 rounded-lg border border-border bg-secondary/60 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-background/40">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
          {lang}
        </span>
        <div className="flex gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Copy code"
            title="Copy"
            onClick={() => {
              navigator.clipboard.writeText(getCode());
              toast.success("Copied");
            }}
          >
            <Copy className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Download code"
            title="Download"
            onClick={() => {
              const code = getCode();
              const blob = new Blob([code], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `snippet.${lang === "plaintext" ? "txt" : lang}`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Save snippet"
            title="Save to snippets"
            disabled={mut.isPending}
            onClick={() => {
              const code = getCode();
              const title = code.split("\n")[0].slice(0, 80) || "Snippet";
              mut.mutate({ title, language: lang, code });
            }}
          >
            <Bookmark className="size-3.5" />
          </Button>
        </div>
      </div>
      <pre ref={ref} className="p-3 text-xs overflow-x-auto">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function Avatar({ role }: { role: "user" | "assistant" }) {
  return (
    <div
      className={cn(
        "size-8 rounded-lg grid place-items-center shrink-0",
        role === "assistant"
          ? "bg-gradient-primary shadow-glow"
          : "bg-secondary border border-border",
      )}
    >
      {role === "assistant" ? (
        <Code2 className="size-4 text-primary-foreground" />
      ) : (
        <User className="size-4 text-foreground" />
      )}
    </div>
  );
}

function EmptyState({ onPick, disabled }: { onPick: (s: string) => void; disabled?: boolean }) {
  return (
    <div className="text-center py-12">
      <div className="size-14 mx-auto rounded-2xl bg-gradient-primary grid place-items-center shadow-glow mb-4">
        <Sparkles className="size-6 text-primary-foreground" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Your AI Software Engineer</h1>
      <p className="text-muted-foreground mt-2 max-w-xl mx-auto">
        Analyze projects, generate features, debug code, review architecture, explain systems, and
        build software faster with AI.
      </p>
    </div>
  );
}
