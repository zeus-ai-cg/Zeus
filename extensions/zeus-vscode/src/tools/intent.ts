/**
 * Heuristic classifier: does this chat message look like a request to MODIFY
 * the user's code? Pure + unit-tested.
 *
 * When it fires, Zeus enters the Plan → Diff → Approval flow instead of
 * answering with a plain chat reply. It is deliberately conservative:
 * questions, explanations, and generic conversation never trigger editing.
 */

const MODIFICATION_VERBS = [
  "fix", "refactor", "add", "change", "update", "implement", "remove",
  "delete", "rename", "move", "rewrite", "optimize", "migrate", "extract",
  "split", "merge", "convert", "replace", "introduce", "wire", "integrate",
  "configure", "generate tests", "write tests", "create test", "make",
];

const CODE_OBJECT_CUES = [
  "bug", "error", "issue", "function", "method", "class", "component",
  "hook", "test", "tests", "api", "endpoint", "auth", "login", "style",
  "css", "layout", "feature", "module", "types", "type", "config",
  "variable", "loop", "query", "route", "schema", "model", "file", "code",
  "logic", "validation", "import", "export", "build", "warning", "crash",
];

const QUESTION_MARKERS = /^(what|why|when|where|which|who|whom|whose|how|is|are|was|were|do|does|did|can|could|should|would|will|may|might)\b/i;

export interface ModificationIntent {
  modify: boolean;
  reason: string;
}

export function looksLikeCodeModification(text: string): ModificationIntent {
  const t = text.trim();
  if (t.length < 3) return { modify: false, reason: "too short" };

  const lower = t.toLowerCase();

  // Questions are answered in chat; they don't edit code.
  if (t.endsWith("?") && !/^(fix|refactor|add|change|update)\b/.test(lower)) {
    return { modify: false, reason: "question" };
  }
  if (QUESTION_MARKERS.test(t) && !/\b(fix|refactor|add|change|update|implement)\b/.test(lower)) {
    return { modify: false, reason: "question form" };
  }

  // Explicit explanation requests stay in chat even if they mention code words.
  if (/^(explain|describe|what does|tell me about|walk me through|help me understand)\b/.test(lower)) {
    return { modify: false, reason: "explanation request" };
  }

  const startsWithVerb = MODIFICATION_VERBS.some((v) => lower.startsWith(v + " ") || lower === v);
  const containsVerbAndObject =
    MODIFICATION_VERBS.some((v) => lower.includes(" " + v + " ") || lower.startsWith(v + " ")) &&
    CODE_OBJECT_CUES.some((c) => new RegExp(`\\b${escapeRe(c)}\\b`).test(lower));

  if (startsWithVerb) return { modify: true, reason: "imperative verb" };
  if (containsVerbAndObject) return { modify: true, reason: "verb + code object" };
  return { modify: false, reason: "no modification cues" };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
