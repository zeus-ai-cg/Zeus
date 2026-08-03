import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getThreadMessages } from "@/lib/threads.functions";
import { ChatWindow } from "@/components/ChatWindow";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  validateSearch: (s) => z.object({ seed: z.string().optional() }).parse(s),
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  const { seed } = Route.useSearch();
  const fetchMsgs = useServerFn(getThreadMessages);
  const { data, isLoading } = useQuery({
    queryKey: ["thread-messages", threadId],
    queryFn: () => fetchMsgs({ data: { threadId } }),
  });

  if (isLoading) {
    return (
      <div className="h-full grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <ChatWindow
      key={threadId}
      threadId={threadId}
      initialMessages={data ?? []}
      initialPrompt={seed}
    />
  );
}
