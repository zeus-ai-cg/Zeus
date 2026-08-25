export type BuiltinSkill = {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: "development" | "learning" | "product" | "design";
  instructions: string;
  /** Keywords — skill only injects if user message contains any of these (substring match) */
  triggers: string;
};

export const BUILTIN_SKILLS: BuiltinSkill[] = [
  {
    id: "code-expert",
    name: "Code Expert",
    icon: "💻",
    description: "Writes clean, production-quality code with best practices",
    category: "development",
    instructions:
      "When writing code: follow language idioms, handle all edge cases, add concise inline comments only where logic is non-obvious, prefer explicit types over any, include error handling, and suggest a test pattern. Never output incomplete code — every code block must be copy-paste runnable.",
    triggers: "write code|write function|implement|write class|write module|build project|build app|build feature|create function|create class|create module|create app|develop|program|write api|write component|write script",
  },
  {
    id: "debugger",
    name: "Debugger",
    icon: "🔍",
    description: "Systematically diagnoses and fixes bugs",
    category: "development",
    instructions:
      "When debugging: first reproduce the issue, then isolate the minimal failing case, identify root cause (not symptoms), provide a precise fix, explain WHY the fix works, and suggest how to prevent this class of bug in the future. Never guess — trace the execution path.",
    triggers: "bug|error|fix bug|fix error|crash|broken|debug|failing|exception|undefined is not|null is not|traceback|stack trace|segmentation fault",
  },
  {
    id: "code-reviewer",
    name: "Code Reviewer",
    icon: "🔎",
    description: "Reviews code quality, security, and performance",
    category: "development",
    instructions:
      "When reviewing: check for security vulnerabilities first (injection, auth bypass, data leaks), then performance (O(n²) loops, unnecessary re-renders, memory leaks), then readability (naming, structure, comments). Rate severity as 🔴 Critical / 🟡 Warning / 🔵 Suggestion. Always provide the fixed code, not just the comment.",
    triggers: "code review|review code|audit code|security audit|performance audit|refactor|code smell|optimize code|improve code|code quality",
  },
  {
    id: "teacher",
    name: "Teacher",
    icon: "📚",
    description: "Explains concepts clearly with examples",
    category: "learning",
    instructions:
      "When explaining: use the Feynman Technique — start with what it IS in one sentence, then a real-world analogy, then a minimal working example, then common mistakes, then next steps. Adapt depth to the user's apparent level. Use code examples over abstract descriptions.",
    triggers: "explain|teach|learn|understand|how does.*work|what is|concept|theory|tutorial|walkthrough|step by step|beginner|getting started",
  },
  {
    id: "architect",
    name: "Architect",
    icon: "🏗️",
    description: "Designs scalable system architectures",
    category: "product",
    instructions:
      "When architecting: start with requirements and constraints, propose 2-3 options with trade-offs, recommend one with reasoning, include data flow, error handling, and scaling considerations. Draw clear boundaries between services. Prefer boring technology for critical paths.",
    triggers: "architecture|system design|system architecture|scale|infrastructure|microservice|design pattern|api design|database design|schema design|distributed system",
  },
  {
    id: "sql-expert",
    name: "SQL Expert",
    icon: "🗄️",
    description: "Writes optimized SQL queries and database designs",
    category: "development",
    instructions:
      "When writing SQL: always consider index usage, avoid N+1 patterns, use EXPLAIN when optimizing, prefer CTEs for complex reads, include proper constraints and indexes in DDL, and note when a query needs a covering index. For schema design, normalize to 3NF then denormalize deliberately.",
    triggers: "sql query|write sql|sql|postgres|postgresql|mysql|database query|migration|supabase|join|cte|stored procedure|index|schema",
  },
  {
    id: "typescript-pro",
    name: "TypeScript Pro",
    icon: "🔷",
    description: "Writes precise TypeScript with strong typing",
    category: "development",
    instructions:
      "When writing TypeScript: prefer narrow types over any, use discriminated unions for state machines, use type guards at boundaries, leverage template literal types for string patterns, and avoid type assertions unless absolutely necessary. Always show the type definitions alongside the implementation.",
    triggers: "typescript|type guard|generic type|type inference|type assertion|interface|discriminated union|mapped type|conditional type|ts type|strict typing",
  },
  {
    id: "react-expert",
    name: "React Expert",
    icon: "⚛️",
    description: "Builds performant React components and patterns",
    category: "development",
    instructions:
      "When building React: split components by responsibility, memoize only when profiling shows a need, prefer controlled forms, use proper key props (never index), handle loading/error states, and follow the React data flow. For state management, prefer server state (React Query) over client state. Never use useEffect for derived state.",
    triggers: "react|react component|react hook|usestate|useeffect|jsx|tsx|react render|re-render|react memo|react context|redux|zustand|tanstack|react query",
  },
];
