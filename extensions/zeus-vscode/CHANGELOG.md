# Changelog

All notable changes to the Zeus AI VS Code extension.

## [0.4.0] — 2026-08-22

### Added

- **Auto-update check.** After activation the extension quietly asks
  `GET {apiBaseUrl}/api/vscode/latest` which VSIX version is current. If a
  newer build exists you get a single prompt with a jump to the website's
  `/download` page; "Later" suppresses that version until the next release.
  Fully best-effort: offline, timeouts, or a missing feed are silent.
- New public update feed on the website (`/api/vscode/latest`) and a matching
  desktop feed (`/api/desktop/latest`) powering the same flow for the desktop
  app.

## [0.3.1] — 2026-08-22

### Changed

- **The extension is now fully plan-blind.** Zeus AI Pro/Ultimate is verified
  by the website at download time; the app itself never checks, displays, or
  branches on your plan. Chat and all project actions work immediately after
  signing in — there is no upgrade prompt anywhere in the product.
- Removed the in-app upgrade screen, plan badge, and entitlement client
  (`entitlement.ts` / `plans.ts` / `entitlement-core.ts`). The backend
  `/api/vscode/entitlements` route remains available for website download
  gating but is never called by the extension.
- A regression test now fails the build if any plan/entitlement code ever
  reappears in the extension.

## [0.3.0] — 2026-08-22

### Added (Phase 3 — Privacy-First Project Intelligence & Safe Coding Actions)

- **Included with Zeus AI Pro/Ultimate**: access is granted by the Zeus
  website at download time. The extension itself never checks, fetches,
  displays, or branches on your plan — sign in and everything just works.
- **Privacy Firewall** applied to EVERY file path before any read or send:
  `.env`/`.env.*` (except `.env.example`) is hard-blocked, plus key material
  (`*.pem *.key *.p12 *.pfx`, `id_rsa/id_ed25519`), credential/secret/token/
  password names, `.aws/.ssh/.git/node_modules/vendor/dist/build/coverage/
  .next/.nuxt/.cache` directories, `.npmrc/.netrc`, lockfiles, minified files,
  sourcemaps, binaries, path traversal. Workspace `.gitignore` respected by
  default; extra user globs via `zeus.privacy.extraBlockedPatterns`. Blocked
  names are never revealed, logged, or transmitted.
- **Analyze Project**: metadata-only scan → explicit context preview (counts,
  included paths, protected-file count) → nothing is sent until you approve →
  evidence-grounded report streamed into the chat area with a "Use this
  project context in chat" action.
- **Context chips**: opt-in attachments (Active File, Selection, Project
  Summary, Diagnostics, Git Diff), each firewall-filtered before attach.
- **Plan → Diff → Approval → Apply for every code change**: Zeus proposes a
  read-scope preview first; edits come back as SEARCH/REPLACE blocks verified
  locally, shown as colored unified diffs, and applied ONLY after explicit
  approval in one VS Code undo step. Files that changed since the diff are
  skipped (drift protection). No shell commands, no git writes, ever.
- **Fix Problems**: editor diagnostics grouped per file (protected files fully
  excluded) with per-issue selection and the same approval pipeline.
- **Review Changes**: read-only `git status/diff` of uncommitted changes,
  privacy-filtered, with per-file selection and a streamed structured review.
- **Generate Tests**: detects the project's test framework from evidence,
  always targets a NEW file (never overwrites), routed through approval.
- Tool flows use ephemeral threads that are deleted when the action ends, so
  project context is not retained remotely beyond the request lifetime.

### Security

- Entitlement endpoint added server-side (`/api/vscode/entitlements`) for the
  website's download gating; the extension never calls it.
- New settings: `zeus.privacy.respectGitignore`,
  `zeus.privacy.extraBlockedPatterns`, `zeus.context.maxFiles/maxFileKB/maxTotalKB`.
- Automated tests: full sensitive-rule matrix, end-to-end secret-leak
  simulation, SEARCH/REPLACE ambiguity refusal, approval-store single-use
  semantics, webview script compile guard, and a plan-blindness invariant
  asserting no entitlement/plan code exists anywhere in the extension.

## [0.2.0] — 2026-08-21

### Fixed

- **Continue with Google (and all auth buttons) did nothing** after the Phase 2
  webview rewrite: a template-literal escape bug (`\n` instead of `\\n`) placed
  a raw newline inside a regex literal, so the entire inline webview script
  threw `SyntaxError: Invalid regular expression: missing /` at parse time and
  no event listeners ever attached. The regex now emits correctly and all
  listeners attach again.
- Unexpected message-handler rejections are no longer silently swallowed; they
  surface as a friendly in-webview error.

### Added

- Safe lifecycle diagnostics in the new **Zeus AI** Output channel:
  `webview initialized`, `Google button clicked` (webview console),
  `signInGoogle message received`, `Google OAuth flow started`,
  `browser launch requested`, `OAuth flow failed: <safe reason>`. No tokens,
  codes, or user content are ever logged.
- Webview watchdog: if the UI script fails to initialize within 5s, VS Code
  shows a visible warning instead of a dead sidebar.
- Webview global error handlers surface runtime errors in the sidebar error box.

## [0.1.0] — 2026-08-16

### Added (Phase 1 — skeleton + auth)

- Activity Bar container **Zeus AI** with a webview sidebar view.
- **Welcome / login screen** with:
  - Continue with Google (PKCE + loopback callback server)
  - Sign in with Email (OTP verification code)
  - Create Account (OTP flow, provisions a new Zeus AI account)
- Signed-in view: "Welcome to Zeus AI, {user}" + connected confirmation + **Sign Out**.
- Session persisted in VS Code **SecretStorage** (safeStorage-encrypted).
- Commands: `Zeus: Open`, `Zeus: Sign In`, `Zeus: Sign Out`.
- Settings: `zeus.apiBaseUrl`, `zeus.supabaseUrl`, `zeus.supabaseAnonKey`.
- No AI/chat calls, no code editing, no terminal execution — intentionally deferred to later phases.
