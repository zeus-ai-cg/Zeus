// Zeus AI — Smart Continue (Feature 5) detection.
//
// This only ever matters when a thread already has a workspace project
// attached (checked by the caller) — it decides whether a follow-up
// message reads like "modify the attached project" rather than a normal
// chat question. Kept deliberately separate from
// src/lib/engineer.schema.ts's detectEngineerIntent(), which is checked
// first by ChatWindow and takes priority: "Build a new X" always means a
// fresh project, never a continuation, even with a project attached.

const CONTINUE_VERBS =
  /^(add|remove|delete|integrate|enable|disable|convert|improve|refactor|update|change|fix|optimize|deploy|migrate|upgrade|implement|include|switch|replace|rename|move|extract|split|combine|support|hook up|wire up|connect|set up|setup)\b/i;

const MAKE_IT_PHRASE = /^make (it|this|the .*)\b/i;
const TURN_INTO_PHRASE = /^turn (it|this) into\b/i;

// Bare feature/noun requests with no leading verb at all — "Dark Mode",
// "Admin Panel" — straight from the spec's own examples.
const BARE_FEATURE_PHRASES =
  /^(dark mode|light mode|admin panel|dashboard|authentication|auth|login( page)?|sign ?up|stripe|payments?|billing|seo|responsive design|mobile support|unit tests?|tests?|testing|docs?|documentation|ci\/cd|deployment|analytics|search|pagination|caching|rate limiting|logging|notifications?|email(s| verification)?)\b/i;

export function detectContinuationIntent(raw: string): boolean {
  const text = raw.trim();
  if (text.length < 3 || text.length > 2000) return false;
  if (CONTINUE_VERBS.test(text)) return true;
  if (MAKE_IT_PHRASE.test(text)) return true;
  if (TURN_INTO_PHRASE.test(text)) return true;
  if (BARE_FEATURE_PHRASES.test(text)) return true;
  return false;
}
