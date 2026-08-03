import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FolderUp,
  Loader2,
  Trash2,
  FolderTree,
  FileCode2,
  ChevronRight,
  ChevronDown,
  Box,
  MessageSquare,
  Download,
} from "lucide-react";
import {
  indexWorkspaceProject,
  listWorkspaceProjects,
  getWorkspaceProject,
  deleteWorkspaceProject,
  getWorkspaceProjectFiles,
  MAX_WORKSPACE_FILES,
  MAX_WORKSPACE_FILE_BYTES,
} from "@/lib/workspace.functions";
import { createThread } from "@/lib/threads.functions";
import { WorkspaceAdvancedPanel } from "@/components/WorkspaceAdvancedPanel";

export const Route = createFileRoute("/_authenticated/workspace")({
  head: () => ({
    meta: [
      { title: "Workspace — Zeus AI" },
      {
        name: "description",
        content:
          "Upload a project ZIP and let Zeus AI index its structure, framework, and dependencies.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WorkspacePage,
});

type TreeNode = { name: string; type: "file" | "folder"; size?: number; children?: TreeNode[] };

// Text/code file extensions worth indexing. Everything else (images, fonts,
// archives, lockfiles, binaries) is skipped so the free-tier request stays
// small and fast — matches the same philosophy as the Connectors uploader.
const SKIP_PATTERN =
  /\.(png|jpe?g|gif|webp|ico|bmp|svg|pdf|zip|tar|gz|7z|rar|woff2?|ttf|eot|otf|mp4|mp3|wav|mov|avi|exe|dll|so|dylib|class|jar|db|sqlite)$/i;
const SKIP_NAMES =
  /^(\.git|node_modules|dist|build|\.next|\.nuxt|target|vendor|__pycache__|\.venv|venv|bin|obj)\//;
const LOCK_PATTERN =
  /package-lock\.json$|yarn\.lock$|pnpm-lock\.yaml$|composer\.lock$|Cargo\.lock$/;

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function parseZip(file: File) {
  // JSZip is loaded on demand so pages that never touch the workspace
  // don't pay for it in their bundle.
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((e) => !e.dir);

  const files: { path: string; content: string }[] = [];
  let skippedCount = 0;

  for (const entry of entries) {
    // Strip a single common root folder (e.g. "MyProject/") so paths read
    // naturally, the way they would in the project itself.
    const path = entry.name;
    if (SKIP_PATTERN.test(path) || SKIP_NAMES.test(path) || LOCK_PATTERN.test(path)) {
      skippedCount++;
      continue;
    }
    if (files.length >= MAX_WORKSPACE_FILES) {
      skippedCount++;
      continue;
    }
    const blob = await entry.async("uint8array");
    if (blob.byteLength > MAX_WORKSPACE_FILE_BYTES) {
      skippedCount++;
      continue;
    }
    const content = new TextDecoder().decode(blob);
    // Heuristic binary check: if decoding produced a lot of replacement
    // characters, this wasn't text — skip it instead of storing garbage.
    const replacementCount = (content.match(/\uFFFD/g) ?? []).length;
    if (replacementCount > content.length * 0.01) {
      skippedCount++;
      continue;
    }
    files.push({ path, content });
  }

  return { files, skippedCount };
}

function TreeView({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 1);
  if (node.type === "file") {
    return (
      <div
        className="flex items-center gap-1.5 text-sm text-muted-foreground py-0.5"
        style={{ paddingLeft: depth * 16 }}
      >
        <FileCode2 className="size-3.5 shrink-0" />
        <span className="truncate">{node.name}</span>
        {typeof node.size === "number" && (
          <span className="text-xs text-muted-foreground/60 ml-1 shrink-0">
            {formatBytes(node.size)}
          </span>
        )}
      </div>
    );
  }
  const children = [...(node.children ?? [])].sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : 1,
  );
  return (
    <div>
      {node.name !== "/" && (
        <button
          className="flex items-center gap-1 text-sm font-medium py-0.5 hover:text-primary"
          style={{ paddingLeft: depth * 16 }}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? (
            <ChevronDown className="size-3.5 shrink-0" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0" />
          )}
          {node.name}
        </button>
      )}
      {(open || node.name === "/") &&
        children.map((c) => (
          <TreeView key={c.name} node={c} depth={node.name === "/" ? depth : depth + 1} />
        ))}
    </div>
  );
}

function WorkspacePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listFn = useServerFn(listWorkspaceProjects);
  const { data: projects = [] } = useQuery({
    queryKey: ["workspace-projects"],
    queryFn: () => listFn(),
  });

  const detailFn = useServerFn(getWorkspaceProject);
  const { data: detail, isFetching: loadingDetail } = useQuery({
    queryKey: ["workspace-project", selectedId],
    queryFn: () => detailFn({ data: { id: selectedId! } }),
    enabled: !!selectedId,
  });

  const indexFn = useServerFn(indexWorkspaceProject);
  const indexMut = useMutation({
    mutationFn: (vars: {
      name: string;
      files: { path: string; content: string }[];
      skippedCount: number;
    }) => indexFn({ data: vars }),
    onSuccess: (project) => {
      toast.success(`Indexed "${project.name}" — ${project.file_count} files`);
      qc.invalidateQueries({ queryKey: ["workspace-projects"] });
      setSelectedId(project.id);
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't index that project."),
    onSettled: () => setUploading(false),
  });

  const deleteFn = useServerFn(deleteWorkspaceProject);
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: (_r, id) => {
      qc.invalidateQueries({ queryKey: ["workspace-projects"] });
      if (selectedId === id) setSelectedId(null);
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't delete that project."),
  });

  const createThreadFn = useServerFn(createThread);
  const chatMut = useMutation({
    mutationFn: (project: { id: string; name: string }) =>
      createThreadFn({
        data: { title: `${project.name} — project chat`, workspaceProjectId: project.id },
      }),
    onSuccess: (thread) => navigate({ to: "/chat/$threadId", params: { threadId: thread.id } }),
    onError: (e: Error) => toast.error(e.message || "Couldn't start a chat for that project."),
  });

  const filesFn = useServerFn(getWorkspaceProjectFiles);
  const [downloading, setDownloading] = useState(false);
  async function handleDownload(id: string, name: string) {
    setDownloading(true);
    try {
      const JSZip = (await import("jszip")).default;
      const files = await filesFn({ data: { projectId: id } });
      const zip = new JSZip();
      for (const f of files) zip.file(f.path, f.content);
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name || "project"}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't build the ZIP.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleZip(file: File | undefined) {
    if (!file) return;
    if (!file.name.endsWith(".zip")) {
      toast.error("Please upload a .zip file.");
      return;
    }
    setUploading(true);
    try {
      const { files, skippedCount } = await parseZip(file);
      if (files.length === 0) {
        toast.error("No readable text/code files found in that ZIP.");
        setUploading(false);
        return;
      }
      const name = file.name.replace(/\.zip$/i, "");
      indexMut.mutate({ name, files, skippedCount });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that ZIP file.");
      setUploading(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        <PageHeader
          title="Workspace"
          subtitle="Upload a project ZIP. Zeus AI indexes its structure, framework, and dependencies so it can help you understand and modify it."
        />

        <section className="rounded-xl border border-border bg-card/60 p-5">
          <h2 className="font-semibold flex items-center gap-2">
            <FolderUp className="size-4" /> Upload a project
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Select a .zip of your project. Binary assets, lockfiles, and build/dependency folders
            (node_modules, dist, .git, etc.) are skipped automatically.
          </p>
          <div className="mt-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => handleZip(e.target.files?.[0])}
            />
            <Button
              variant="outline"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="size-4 mr-1.5 animate-spin" />
              ) : (
                <FolderUp className="size-4 mr-1.5" />
              )}
              {uploading ? "Indexing…" : "Choose ZIP file"}
            </Button>
          </div>
        </section>

        <section className="grid md:grid-cols-[280px_1fr] gap-6">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground px-1">Indexed projects</h3>
            {projects.length === 0 && (
              <p className="text-sm text-muted-foreground px-1">
                No projects yet — upload a ZIP to get started.
              </p>
            )}
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${selectedId === p.id ? "border-primary bg-primary/5" : "border-border bg-card/40 hover:bg-card/70"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">{p.name}</span>
                  <Trash2
                    className="size-3.5 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMut.mutate(p.id);
                    }}
                  />
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {p.framework && (
                    <Badge variant="secondary" className="text-xs">
                      {p.framework}
                    </Badge>
                  )}
                  {p.primary_language && (
                    <Badge variant="outline" className="text-xs">
                      {p.primary_language}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  {p.file_count} files · {formatBytes(p.total_bytes)}
                </p>
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card/60 p-5 min-h-[300px]">
            {!selectedId && (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground py-16 gap-2">
                <Box className="size-8" />
                <p className="text-sm">Select an indexed project to view its structure.</p>
              </div>
            )}
            {selectedId && loadingDetail && (
              <div className="h-full flex items-center justify-center py-16">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {selectedId && detail && (
              <div>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="font-semibold">{detail.name}</h3>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {detail.framework && <Badge variant="secondary">{detail.framework}</Badge>}
                      {detail.primary_language && (
                        <Badge variant="outline">{detail.primary_language}</Badge>
                      )}
                      <Badge variant="outline">{detail.file_count} files</Badge>
                      <Badge variant="outline">{formatBytes(detail.total_bytes)}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={downloading}
                      onClick={() => handleDownload(detail.id, detail.name)}
                    >
                      {downloading ? (
                        <Loader2 className="size-4 mr-1.5 animate-spin" />
                      ) : (
                        <Download className="size-4 mr-1.5" />
                      )}
                      Download ZIP
                    </Button>
                    <Button
                      size="sm"
                      disabled={chatMut.isPending}
                      onClick={() => chatMut.mutate({ id: detail.id, name: detail.name })}
                    >
                      {chatMut.isPending ? (
                        <Loader2 className="size-4 mr-1.5 animate-spin" />
                      ) : (
                        <MessageSquare className="size-4 mr-1.5" />
                      )}
                      Chat about this project
                    </Button>
                  </div>
                </div>
                {detail.notes && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">{detail.notes}</p>
                )}
                {Array.isArray(detail.dependencies) && detail.dependencies.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Dependencies</p>
                    <div className="flex flex-wrap gap-1">
                      {(detail.dependencies as string[]).slice(0, 24).map((d) => (
                        <Badge key={d} variant="outline" className="text-xs font-mono">
                          {d}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-5">
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                    <FolderTree className="size-3.5" /> Folder structure
                  </p>
                  <div className="rounded-lg border border-border bg-background/60 p-3 max-h-[420px] overflow-y-auto">
                    <TreeView node={detail.folder_tree as TreeNode} />
                  </div>
                </div>

                <WorkspaceAdvancedPanel projectId={detail.id} projectName={detail.name} />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
