import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createThread } from "@/lib/threads.functions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export type SectionItem = {
  title: string;
  description: string;
  level?: string;
  icon?: string;
  /** Prompt sent into a new chat when the card is opened. Falls back to a default. */
  prompt?: string;
};

export function SectionStub({
  title,
  subtitle,
  items,
  openLabel = "Start learning",
}: {
  title: string;
  subtitle: string;
  items: SectionItem[];
  openLabel?: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const create = useServerFn(createThread);

  const mut = useMutation({
    mutationFn: async (item: SectionItem) => {
      const t = await create({ data: { title: item.title } });
      return { thread: t, item };
    },
    onSuccess: ({ thread, item }) => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      const seed = item.prompt ?? `Teach me "${item.title}". ${item.description}`;
      navigate({
        to: "/chat/$threadId",
        params: { threadId: thread.id },
        search: { seed },
      });
    },
    onError: (e: Error) => toast.error(e.message || "Could not open"),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <PageHeader title={title} subtitle={subtitle} />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
          {items.map((it) => {
            const isLoading = mut.isPending && mut.variables?.title === it.title;
            return (
              <button
                key={it.title}
                onClick={() => mut.mutate(it)}
                disabled={mut.isPending}
                className="text-left rounded-xl border border-border bg-card/60 p-5 hover:border-primary/60 hover:shadow-glow hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed group"
              >
                {it.icon && <div className="text-3xl mb-2">{it.icon}</div>}
                {it.level && (
                  <span className="text-[10px] uppercase tracking-wider text-accent font-semibold">
                    {it.level}
                  </span>
                )}
                <h3 className="font-semibold mt-1">{it.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{it.description}</p>
                <div className="mt-3 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  {isLoading ? (
                    <>
                      <Loader2 className="size-3 animate-spin" /> Opening…
                    </>
                  ) : (
                    <>{openLabel} →</>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
