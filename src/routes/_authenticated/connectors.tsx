import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { PageHeader } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Link2, Upload, Copy, Trash2, Loader2, Sparkles, FileCode, X, Check } from "lucide-react";
import {
  createProjectContext,
  listProjectContexts,
  deleteProjectContext,
  editProjectWithZeusAI,
} from "@/lib/connectors.functions";
import { SITE_URL } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/connectors")({
  head: () => ({
    meta: [
      { title: "Connectors — Zeus AI" },
      {
        name: "description",
        content:
          "Share your project with Claude, ChatGPT, or any AI tool, and let Zeus AI make edits directly.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConnectorsPage,
});

type UploadedFile = { name: string; content: string };

async function readFilesFromInput(fileList: FileList): Promise<UploadedFile[]> {
  const files = Array.from(fileList).slice(0, 40);
  const out: UploadedFile[] = [];
  for (const f of files) {
    // Skip obviously non-text/binary assets so we don't waste the context
    // budget on things an AI reading the project wouldn't need anyway.
    if (/\.(png|jpg|jpeg|gif|webp|ico|pdf|zip|woff2?|ttf|eot|mp4|mp3|lock)$/i.test(f.name))
      continue;
    if (f.size > 300_000) continue;
    const text = await f.text();
    const relativePath = f.webkitRelativePath || f.name;
    out.push({ name: relativePath || f.name, content: text });
  }
  return out;
}

function ConnectorsPage() {
  const qc = useQueryClient();
  const [uploaded, setUploaded] = useState<UploadedFile[]>([]);
  const [projectName, setProjectName] = useState("My Project");
  const [instructions, setInstructions] = useState("");
  const [zeusResponse, setZeusResponse] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const listFn = useServerFn(listProjectContexts);
  const { data: links } = useQuery({ queryKey: ["project-contexts"], queryFn: () => listFn() });

  const createFn = useServerFn(createProjectContext);
  const createMut = useMutation({
    mutationFn: () => createFn({ data: { projectName, files: uploaded } }),
    onSuccess: () => {
      toast.success("Context link created");
      qc.invalidateQueries({ queryKey: ["project-contexts"] });
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't create the link."),
  });

  const deleteFn = useServerFn(deleteProjectContext);
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-contexts"] }),
  });

  const editFn = useServerFn(editProjectWithZeusAI);
  const editMut = useMutation({
    mutationFn: () => editFn({ data: { files: uploaded, instructions } }),
    onSuccess: (res: { response: string }) => {
      setZeusResponse(res.response);
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: Error) => toast.error(e.message || "Zeus AI couldn't process that request."),
  });

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = await readFilesFromInput(fileList);
    if (files.length === 0) {
      toast.error("No readable text/code files found in that selection.");
      return;
    }
    setUploaded(files);
    toast.success(`Loaded ${files.length} file${files.length === 1 ? "" : "s"}`);
  }

  function copyUrl(token: string) {
    const url = `${SITE_URL}/api/context/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    toast.success("Copied");
    setTimeout(() => setCopiedToken(null), 2000);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        <PageHeader
          title="Connectors"
          subtitle="Share this project with other AI tools, or let Zeus AI make the changes directly."
        />

        {/* Upload */}
        <section className="rounded-xl border border-border bg-card/60 p-5">
          <h2 className="font-semibold flex items-center gap-2">
            <Upload className="size-4" /> 1. Upload your project
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Select your project's files (or a folder). We only read text/code files — images,
            binaries, and lockfiles are skipped automatically.
          </p>
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              // @ts-expect-error - non-standard attribute, widely supported for folder picking
              webkitdirectory=""
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <FileCode className="size-4 mr-1.5" /> Choose files or folder
            </Button>
            {uploaded.length > 0 && (
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Check className="size-3.5 text-green-500" /> {uploaded.length} file
                {uploaded.length === 1 ? "" : "s"} loaded
                <button
                  onClick={() => setUploaded([])}
                  className="ml-1 text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            )}
          </div>
        </section>

        {/* Context link */}
        <section className="rounded-xl border border-border bg-card/60 p-5">
          <h2 className="font-semibold flex items-center gap-2">
            <Link2 className="size-4" /> 2. Get a shareable context link
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Generates a link you can paste into Claude, ChatGPT, or any AI tool that can fetch a
            URL, so it can read this project's context.
          </p>
          <div className="mt-3 flex gap-2 flex-wrap">
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Project name"
              className="max-w-xs"
            />
            <Button
              onClick={() => createMut.mutate()}
              disabled={uploaded.length === 0 || createMut.isPending}
              className="bg-gradient-primary text-primary-foreground hover:opacity-90"
            >
              {createMut.isPending ? (
                <Loader2 className="size-4 mr-1.5 animate-spin" />
              ) : (
                <Link2 className="size-4 mr-1.5" />
              )}
              Generate link
            </Button>
          </div>

          {links && links.length > 0 && (
            <ul className="mt-4 space-y-2">
              {links.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{l.project_name}</p>
                    <p className="text-xs text-muted-foreground truncate font-mono">
                      {SITE_URL}/api/context/{l.token}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => copyUrl(l.token)}>
                      {copiedToken === l.token ? (
                        <Check className="size-3.5" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteMut.mutate(l.id)}>
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Edit with Zeus AI */}
        <section className="rounded-xl border border-border bg-card/60 p-5">
          <h2 className="font-semibold flex items-center gap-2">
            <Sparkles className="size-4" /> 3. Or tell Zeus AI what to change
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Zeus AI reviews the uploaded files and writes back the updated code for anything that
            needs to change. This uses one question from your usage limit, same as chat.
          </p>
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. Add dark mode support to the Settings page, and fix the bug where the submit button stays disabled after an error."
            className="mt-3 min-h-24"
          />
          <Button
            className="mt-3 bg-gradient-primary text-primary-foreground hover:opacity-90"
            disabled={uploaded.length === 0 || !instructions.trim() || editMut.isPending}
            onClick={() => editMut.mutate()}
          >
            {editMut.isPending ? (
              <Loader2 className="size-4 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="size-4 mr-1.5" />
            )}
            Apply with Zeus AI
          </Button>

          {zeusResponse && (
            <div className="mt-5 rounded-lg border border-border bg-background/60 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">Zeus AI's changes</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(zeusResponse);
                    toast.success("Copied");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  <Copy className="size-3" /> Copy all
                </button>
              </div>
              <div className="prose prose-sm prose-invert max-w-none">
                <ReactMarkdown>{zeusResponse}</ReactMarkdown>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
