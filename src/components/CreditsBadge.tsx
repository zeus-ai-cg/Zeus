import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Zap } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getCreditsSummary } from "@/lib/credits.functions";

// Feature 6 — Zeus Credits. Purely informational: shows today's usage,
// broken down by action, so the numbers next to Engineer Mode's
// pre-generation estimate feel consistent. Never blocks anything — the
// real free/Pro quota gating is unchanged and lives in /api/chat.ts.
export function CreditsBadge() {
  const summaryFn = useServerFn(getCreditsSummary);
  const { data } = useQuery({
    queryKey: ["credits-summary"],
    queryFn: () => summaryFn(),
    refetchInterval: 60_000,
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/15 transition-colors"
          aria-label="Zeus Credits used today"
        >
          <Zap className="size-3" />
          {data ? `${data.totalToday} today` : "Credits"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 text-sm">
        <p className="font-semibold mb-2 flex items-center gap-1.5">
          <Zap className="size-3.5 text-primary" /> Zeus Credits — today
        </p>
        {!data || data.breakdown.length === 0 ? (
          <p className="text-xs text-muted-foreground">No activity yet today.</p>
        ) : (
          <div className="space-y-1.5">
            {data.breakdown.map((b) => (
              <div key={b.label} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {b.label} × {b.count}
                </span>
                <span className="font-medium">-{b.credits}</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-xs pt-1.5 border-t border-border font-semibold">
              <span>Total</span>
              <span>-{data.totalToday}</span>
            </div>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-2">
          Informational — your plan's actual question limit is unaffected by this number.
        </p>
      </PopoverContent>
    </Popover>
  );
}
