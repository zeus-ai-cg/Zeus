import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSnippets, deleteSnippet } from "@/lib/profile.functions";
import { PageHeader } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/snippets")({
  head: () => ({
    meta: [
      { title: "Saved Code — Zeus AI" },
      {
        name: "description",
        content: "Your bookmarked code snippets from Zeus AI conversations, organized by language.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SnippetsPage,
});

function SnippetsPage() {
  const list = useServerFn(listSnippets);
  const del = useServerFn(deleteSnippet);
  const qc = useQueryClient();
  const { data: snippets = [] } = useQuery({ queryKey: ["snippets"], queryFn: () => list() });
  const mut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["snippets"] }),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <PageHeader title="Saved Code" subtitle="Snippets you've saved from your chats." />
        {snippets.length === 0 ? (
          <div className="mt-12 text-center text-muted-foreground">
            <p>No saved snippets yet.</p>
            <p className="text-sm mt-1">
              Tap the bookmark icon on any code block in chat to save it here.
            </p>
          </div>
        ) : (
          <div className="space-y-4 mt-8">
            {snippets.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-border bg-card/60 overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-secondary/30">
                  <div>
                    <div className="font-medium text-sm">{s.title}</div>
                    <div className="text-xs text-muted-foreground">{s.language}</div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      aria-label={`Copy ${s.title}`}
                      onClick={() => {
                        navigator.clipboard.writeText(s.code);
                        toast.success("Copied");
                      }}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      aria-label={`Delete ${s.title}`}
                      onClick={() => mut.mutate(s.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <pre className="p-4 text-xs overflow-x-auto max-h-64">
                  <code>{s.code}</code>
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
