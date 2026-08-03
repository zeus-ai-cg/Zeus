import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listThreads, createThread } from "@/lib/threads.functions";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/chat/")({
  component: ChatIndex,
});

function ChatIndex() {
  const navigate = useNavigate();
  const list = useServerFn(listThreads);
  const create = useServerFn(createThread);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const threads = await list();
        let id = threads?.[0]?.id;
        if (!id) {
          const row = await create({ data: {} });
          id = row.id;
        }
        if (!cancelled && id) {
          navigate({ to: "/chat/$threadId", params: { threadId: id }, replace: true });
        }
      } catch {
        // fallthrough; loader will retry on next mount
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [list, create, navigate]);

  return (
    <div className="h-full grid place-items-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}
