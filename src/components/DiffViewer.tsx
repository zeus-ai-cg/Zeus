import { useState } from "react";
import { ChevronRight, ChevronDown, FilePlus2, FilePen, FileMinus2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { computeLineDiff } from "@/lib/diff";
import { cn } from "@/lib/utils";

export type ModificationFile = {
  path: string;
  action: "create" | "modify" | "delete";
  reason: string;
  before: string;
  after: string;
  added: number;
  removed: number;
  diffTruncated?: boolean;
};

const ACTION_META = {
  create: { label: "Added", icon: FilePlus2, className: "text-green-600 dark:text-green-400" },
  modify: { label: "Modified", icon: FilePen, className: "text-blue-600 dark:text-blue-400" },
  delete: { label: "Deleted", icon: FileMinus2, className: "text-red-600 dark:text-red-400" },
} as const;

function FileRow({ file }: { file: ModificationFile }) {
  const [open, setOpen] = useState(false);
  const meta = ACTION_META[file.action];
  const Icon = meta.icon;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-card/60"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <Icon className={cn("size-3.5 shrink-0", meta.className)} />
        <span className="font-mono text-sm truncate flex-1">{file.path}</span>
        <Badge variant="outline" className={cn("text-xs shrink-0", meta.className)}>
          {meta.label}
        </Badge>
        {(file.added > 0 || file.removed > 0) && (
          <span className="text-xs font-mono shrink-0">
            {file.added > 0 && (
              <span className="text-green-600 dark:text-green-400">+{file.added}</span>
            )}
            {file.added > 0 && file.removed > 0 && " "}
            {file.removed > 0 && (
              <span className="text-red-600 dark:text-red-400">-{file.removed}</span>
            )}
          </span>
        )}
      </button>
      {open && (
        <div className="border-t border-border bg-background/60">
          <p className="text-xs text-muted-foreground px-3 py-2">{file.reason}</p>
          <DiffBody file={file} />
        </div>
      )}
    </div>
  );
}

function DiffBody({ file }: { file: ModificationFile }) {
  if (file.action === "create") {
    return (
      <CodeBlock lines={file.after.split("\n").map((l) => ({ type: "add" as const, line: l }))} />
    );
  }
  if (file.action === "delete") {
    return (
      <CodeBlock
        lines={file.before.split("\n").map((l) => ({ type: "remove" as const, line: l }))}
      />
    );
  }
  if (file.diffTruncated) {
    return (
      <p className="text-xs text-muted-foreground px-3 pb-3">
        File too large for an inline line diff — the full new content will still be applied
        correctly.
      </p>
    );
  }
  const { ops } = computeLineDiff(file.before, file.after);
  return <CodeBlock lines={ops} />;
}

function CodeBlock({ lines }: { lines: { type: "same" | "add" | "remove"; line: string }[] }) {
  const capped = lines.slice(0, 400);
  return (
    <pre className="text-xs font-mono overflow-x-auto max-h-[360px] overflow-y-auto px-3 pb-3">
      {capped.map((op, i) => (
        <div
          key={i}
          className={cn(
            "px-1 -mx-1",
            op.type === "add" && "bg-green-500/10 text-green-700 dark:text-green-400",
            op.type === "remove" && "bg-red-500/10 text-red-700 dark:text-red-400",
          )}
        >
          {op.type === "add" ? "+ " : op.type === "remove" ? "- " : "  "}
          {op.line}
        </div>
      ))}
      {lines.length > 400 && (
        <div className="text-muted-foreground mt-1">…{lines.length - 400} more lines not shown</div>
      )}
    </pre>
  );
}

export function DiffViewer({ files }: { files: ModificationFile[] }) {
  return (
    <div className="space-y-2">
      {files.map((f) => (
        <FileRow key={f.path} file={f} />
      ))}
    </div>
  );
}
