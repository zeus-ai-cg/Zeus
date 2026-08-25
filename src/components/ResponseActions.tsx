import { useState, useCallback, useMemo } from "react";
import {
  Copy,
  Wand2,
  BookOpen,
  Minus,
  Code2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const CODE_KEYWORDS =
  /function|class|import|export|const |let |var |def |return|async |await |interface|type |enum |switch|if\s*\(|for\s*\(|while\s*\(|try\s*\{|catch\s*\(|=>|&&|\|\||\bAPI\b|\.tsx?|\.jsx?|\.py|\.go|\.rs|\.java|\.rb|\.php|dockerfile|yaml|json|sql|bash|terminal|command|npm|pip|yarn|git /i;

const HAS_CODE_FENCES = /```[\s\S]+?```/;

type ActionDef = {
  id: string;
  label: string;
  icon: typeof Copy;
  prompt: string;
  requiresLong?: boolean;
  requiresCode?: boolean;
};

const ACTIONS: ActionDef[] = [
  { id: "copy", label: "Copy", icon: Copy, prompt: "" },
  { id: "shorter", label: "Shorter", icon: Minus, prompt: "Make this response more concise and to the point.", requiresLong: true },
  { id: "explain", label: "Explain", icon: BookOpen, prompt: "Explain this simply in beginner-friendly terms.", requiresLong: true },
  { id: "improve", label: "Improve", icon: Wand2, prompt: "Improve this response — make it clearer and more accurate." },
  { id: "code", label: "Code", icon: Code2, prompt: "Show this as clean, runnable code.", requiresCode: true },
];

type Props = {
  text: string;
  isStreaming?: boolean;
  onAction?: (prompt: string) => void;
};

export function ResponseActions({ text, isStreaming, onAction }: Props) {
  const [copied, setCopied] = useState(false);

  const hasCode = HAS_CODE_FENCES.test(text) || CODE_KEYWORDS.test(text);
  const isLong = text.length > 400;

  const visibleActions = useMemo(() => {
    const filtered = ACTIONS.filter((a) => {
      if (a.id === "copy") return true;
      if (a.requiresCode && !hasCode) return false;
      if (a.requiresLong && !isLong) return false;
      return true;
    });
    return filtered.slice(0, 5);
  }, [hasCode, isLong]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied");
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  if (!text || isStreaming) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      {visibleActions.map((action) => {
        if (action.id === "copy") {
          return (
            <button
              key={action.id}
              type="button"
              onClick={handleCopy}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                "bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground",
                "border border-transparent hover:border-border",
              )}
              title={action.label}
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              <span className="hidden sm:inline">{copied ? "Copied" : action.label}</span>
            </button>
          );
        }
        return (
          <button
            key={action.id}
            type="button"
            onClick={() => onAction?.(action.prompt)}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
              "bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground",
              "border border-transparent hover:border-border",
            )}
            title={action.label}
          >
            <action.icon className="size-3" />
            <span className="hidden sm:inline">{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}
