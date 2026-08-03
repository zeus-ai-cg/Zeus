// Zeus AI — Hidden Power Features (Feature 11).
//
// The spec lists ~30 named "modes" (Security Review, Accessibility
// Auditor, Sprint Planner, Token Optimizer, Project Snapshot, ...) and is
// explicit that "these should not all be advertised... users should
// discover them and share them online." That rules out a big menu of 30
// buttons — that's the opposite of hidden. Instead:
//
//   - A curated, consolidated set of modes below (each real one covers
//     several near-duplicate spec items — e.g. "production-readiness"
//     covers Deployment Checker + Deployment Readiness + Launch Mode).
//   - Triggered by typing a natural phrase in chat, same mechanism as
//     Feature 1/5's detectEngineerIntent/detectContinuationIntent.
//   - No dedicated UI beyond a small "detected" chip on the composer
//     (mirrors the Engineer Mode affordance) — the actual "mode" shows up
//     as a structured, distinctly-formatted answer in the chat itself.
//   - Purely a system-prompt change, not a new panel/route — so a
//     surprising, screenshot-worthy answer is the whole discovery loop.
//
// Deliberately NOT built as separate "modes" here: Context Compression,
// Memory Compression, Token Optimizer, Prompt Optimizer, Project
// Snapshot, Project Timeline, Component Generator. Those are internal
// engineering-infra concepts, not something a natural-language chat
// trigger maps to honestly — building fake versions of them would be
// exactly the kind of hollow feature this app is trying not to be.

export type PowerFeature = {
  id: string;
  label: string;
  emoji: string;
  trigger: RegExp;
  instructions: string;
};

export const POWER_FEATURES: PowerFeature[] = [
  {
    id: "security-review",
    label: "Security Review",
    emoji: "🛡️",
    trigger:
      /\b(security review|security audit|audit.*security|check (this|it|my project) for (security|vulnerabilities)|find (security )?vulnerabilities)\b/i,
    instructions:
      "Hidden Power Feature active: Security Review. Respond as a senior application-security engineer. Open with a one-line risk summary and a Security Score out of 10. Then list concrete findings grouped by severity (Critical/High/Medium/Low) — if project context is attached above, ground every finding in real files/lines from it; if not, give the most common vulnerability classes for the stack the user describes and say attaching a project would let you check the real code. End with a short prioritized fix list.",
  },
  {
    id: "accessibility-auditor",
    label: "Accessibility Auditor",
    emoji: "♿",
    trigger:
      /\b(accessibility (audit|review|check)|a11y (audit|review|check)|is (this|it) accessible|check.*(for )?accessibility)\b/i,
    instructions:
      "Hidden Power Feature active: Accessibility Auditor. Respond as a WCAG 2.1 AA specialist. Give an Accessibility Score out of 10, then concrete issues (missing alt text, contrast, keyboard nav, ARIA misuse, focus order) grounded in the attached project's real markup when available, otherwise general guidance for the stack described. End with the 3 highest-impact fixes.",
  },
  {
    id: "seo-expert",
    label: "SEO Expert",
    emoji: "🔍",
    trigger: /\b(seo (audit|review|check)|improve.*seo|check.*seo|is (this|it) seo[- ]friendly)\b/i,
    instructions:
      "Hidden Power Feature active: SEO Expert. Respond as a technical SEO specialist. Cover meta tags/OG tags, semantic HTML, page speed factors, structured data, and crawlability. Give a short scored checklist, grounded in the attached project's real pages/routes when available.",
  },
  {
    id: "performance-optimizer",
    label: "Performance Optimizer",
    emoji: "⚡",
    trigger:
      /\b(performance (review|audit|check)|optimi[sz]e.*performance|make (it|this) faster|why is (it|this) slow|improve performance)\b/i,
    instructions:
      "Hidden Power Feature active: Performance Optimizer. Respond as a performance engineer. Identify the likely bottlenecks (render, bundle size, N+1 queries, missing memoization/indexes — whatever fits the stack), grounded in the attached project's real code when available. Give each suggestion an estimated impact (High/Medium/Low) and concrete before/after guidance, not just generic advice.",
  },
  {
    id: "dependency-inspector",
    label: "Dependency Inspector",
    emoji: "📦",
    trigger:
      /\b(dependency (inspector|audit|check)|check.*dependencies|audit.*packages|outdated (packages|dependencies))\b/i,
    instructions:
      "Hidden Power Feature active: Dependency Inspector. Respond as someone auditing a dependency tree. If a project is attached, actually read its package/dependency manifest from the context above and comment on real packages (outdated, deprecated, unusually heavy, known-risky patterns) rather than generic advice. If none is attached, explain what you'd check and ask them to attach a project for a real read.",
  },
  {
    id: "database-optimizer",
    label: "Database Optimizer",
    emoji: "🗄️",
    trigger:
      /\b(database optimi[sz]er|optimi[sz]e.*(database|schema|queries)|review.*(database|schema)|slow quer(y|ies))\b/i,
    instructions:
      "Hidden Power Feature active: Database Optimizer. Respond as a database engineer. Look at the schema/queries in the attached project context when available and flag missing indexes, N+1 patterns, denormalization opportunities, and risky migrations. Without a project attached, give the general checklist for the database technology mentioned.",
  },
  {
    id: "bug-hunter",
    label: "Bug Hunter Mode",
    emoji: "🐛",
    trigger: /\b(bug hunt(er)?( mode)?|hunt for bugs|find (the )?bugs?|find edge cases)\b/i,
    instructions:
      "Hidden Power Feature active: Bug Hunter Mode. Respond as an engineer specifically hunting for bugs and edge cases (not general code review). Go through the code methodically: null/undefined handling, off-by-one errors, race conditions, unhandled promise rejections, type coercion surprises. List each suspected bug with the exact location and a minimal repro or explanation of why it breaks.",
  },
  {
    id: "ui-polish",
    label: "UI Polish Mode",
    emoji: "✨",
    trigger:
      /\b(ui polish( mode)?|polish (the |this )?ui|make (it|this|the ui) (look )?(nicer|better|more polished))\b/i,
    instructions:
      "Hidden Power Feature active: UI Polish Mode. Respond as a product designer doing a polish pass, not a code reviewer. Focus on spacing, typography hierarchy, color contrast, micro-interactions, empty/loading/error states, and consistency. Be specific and visual in your descriptions, and give concrete CSS/className changes where relevant.",
  },
  {
    id: "architecture-review",
    label: "Architecture Review",
    emoji: "🏛️",
    trigger:
      /\b(architect(ure)? (review|mode)|review.*architecture|is (this|the) architecture (good|solid|sound))\b/i,
    instructions:
      "Hidden Power Feature active: Architecture Review. Respond as a principal engineer reviewing system design, not line-level code. Cover separation of concerns, coupling, scalability limits, and where this design will hurt at 10x the current scale. Give an Architecture Health score out of 10 with reasoning.",
  },
  {
    id: "production-readiness",
    label: "Production Readiness",
    emoji: "🚀",
    trigger:
      /\b(production readiness|ready for production|deployment check(er|list)?|launch (mode|checklist)|ready to (launch|ship|deploy))\b/i,
    instructions:
      "Hidden Power Feature active: Production Readiness. Respond as a release manager running a go/no-go check. Cover error handling, monitoring/logging, secrets management, rollback plan, and load expectations. Give a Production Readiness score out of 10 and a clear go/no-go checklist grouped by blocking vs nice-to-have.",
  },
  {
    id: "project-risk-analysis",
    label: "Project Risk Analysis",
    emoji: "📊",
    trigger:
      /\b(project risk (analysis)?|risk analysis|complexity analy[sz]er|how complex is this|estimate (the )?complexity)\b/i,
    instructions:
      "Hidden Power Feature active: Project Risk Analysis. Respond as a technical lead assessing risk before committing to a plan. Cover technical risk (unproven tech, tight coupling), scope risk (unclear requirements, creeping features), and delivery risk (single points of failure, bus factor). Give a Complexity score (Low/Medium/High/Very High) with reasoning, not just a list.",
  },
  {
    id: "auto-documentation",
    label: "Auto Documentation",
    emoji: "📝",
    trigger:
      /\b(auto ?doc(umentation)?|generate (the )?docs?|document (this|the code|my project)|write documentation)\b/i,
    instructions:
      "Hidden Power Feature active: Auto Documentation. Generate real, complete documentation for what's actually attached/discussed — not a template with placeholders. Match the shape to what's being documented: a function gets a docstring + usage example; a project gets a README-style overview (purpose, setup, key modules). Every sentence should be true of the actual code, not generic filler.",
  },
  {
    id: "auto-refactor",
    label: "Auto Refactor",
    emoji: "♻️",
    trigger:
      /\b(auto ?refactor|refactor (this|it|the code)|clean up (this|the) code|improve code quality|code quality (score|review))\b/i,
    instructions:
      "Hidden Power Feature active: Auto Refactor. Respond as a senior engineer doing a refactor pass. Give a Code Quality score out of 10, then the actual refactored code (not just a description of what to change), with a short note per change explaining why it's better (readability, testability, performance, or correctness).",
  },
  {
    id: "startup-pitch",
    label: "Investor Pitch Mode",
    emoji: "🦄",
    trigger:
      /\b(investor pitch( mode)?|pitch (this|my project|it) to investors|startup mode|elevator pitch)\b/i,
    instructions:
      "Hidden Power Feature active: Investor Pitch Mode. Reframe the project/idea being discussed as a startup pitch: problem, solution, why now, and a punchy one-liner. Be genuinely sharp and specific to what they've actually built or described — not generic startup-speak — and keep it short enough to say out loud in 30 seconds.",
  },
  {
    id: "monetization-strategist",
    label: "Monetization Strategist",
    emoji: "💰",
    trigger:
      /\b(monetiz(e|ation)|how (do|can) i make money|make money (from|with|off) (this|it|my project)|turn (this|it) into a business|pricing strategy|business model( for)?|how (do|can) i sell (this|it)|charge for (this|it))\b/i,
    instructions:
      "Hidden Power Feature active: Monetization Strategist. Respond as a startup-savvy product strategist, not a generic business-advice bot. Ground everything in what's actually attached/discussed — the real project, its users, and what it does — not generic startup platitudes. Give 2-3 monetization models that genuinely fit this specific project (subscription, one-time purchase, freemium, usage-based, marketplace commission, licensing, done-for-you service — pick the ones that actually fit, don't list all of them), a realistic price point and who'd pay it, and one concrete step they could take this week to validate it (a landing page, a waitlist, a single outreach message — something shippable, not 'do market research').",
  },
];

export function detectPowerFeature(raw: string): PowerFeature | null {
  const text = raw.trim();
  if (text.length < 4 || text.length > 500) return null;
  for (const feature of POWER_FEATURES) {
    if (feature.trigger.test(text)) return feature;
  }
  return null;
}
