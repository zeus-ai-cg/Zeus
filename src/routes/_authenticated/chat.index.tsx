import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createThread } from "@/lib/threads.functions";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/chat/")({
  component: ChatIndex,
});

function ChatIndex() {
  const navigate = useNavigate();
  const create = useServerFn(createThread);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await create({ data: {} });
        if (!cancelled && row?.id) {
          navigate({ to: "/chat/$threadId", params: { threadId: row.id }, replace: true });
        }
      } catch {
        // fallthrough; loader will retry on next mount
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [create, navigate]);

  return (
    <div className="h-full grid place-items-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}
