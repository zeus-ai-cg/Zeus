# ZeusAI - Complete Project Summary (v1.5.0)

> Handoff document for AI assistants. Project path:
> `D:\Haider_documents\Projects\Saas_Projects\ZeusAI\ZeusAIv1.4-release`

---

## 1. What Is Zeus AI?

A SaaS platform ("Your personal AI programming tutor and AI Software Engineer")
shipped as THREE products:

| Product | Tech | Status |
|---|---|---|
| Web App | TanStack Start (SSR), React 19, Vite 7, Tailwind v4 | Feature-complete, deploy-ready |
| Desktop App | Electron 43, Windows x64 NSIS installer, zeusai:// deep-link | v1.5.0 built + published |
| VS Code Extension | TypeScript sidebar chat + engineer mode | v0.4.0 packaged |

Live links:
- Desktop installer (stable permalink):
  https://github.com/Haidersiddique942/Zeus/releases/download/v1.5.0/Zeus-AI-Setup-1.5.0.exe
- VSIX (plan-gated on website):
  https://ohgvjmrgaperrfhcrgld.supabase.co/storage/v1/object/public/zeus-releases/zeus-ai-0.4.0.vsix
- GitHub repo (public): https://github.com/Haidersiddique942/Zeus

---

## 2. Architecture

```
Browser / Desktop / Extension
  | Bearer token auto-attached (auth-attacher.ts)
  v
TanStack Start server routes (/api/*)
  | Supabase auth.getClaims() verifies token SERVER-SIDE
  v
Supabase (Postgres + Auth + Storage)     AI gateway: OpenRouter
  - profiles (plan free/pro/ultimate)      stealth/ox-alpha "Ox Alpha"
  - user_api_keys (encrypted BYOK)         1M context, default brain
  - usage tracking (increment_usage RPC)
  - storage bucket "zeus-releases" (public)
Lemon Squeezy (checkout + signed webhooks -> plan changes)
```

Key libs: @ai-sdk v7 (google/openai/anthropic clients), zod validators on every
server function, CSRF middleware in src/start.ts. 23 SQL migrations under
supabase/migrations/.

---

## 3. Completed Work (full list)

### A. Foundation and bug fixes
- Fixed ALL pre-existing TypeScript errors (14 -> 0). Notable: Lemon Squeezy SDK
  double-wrap fix (data?.data?.attributes?.url), Supabase generated types for
  get_current_usage, router context casts.
- Console clean-up: deprecated .inputValidator( -> .validator( across 37 spots
  in 13 files; CSRF middleware added to src/start.ts. Build now shows zero
  deprecation/security warnings.
- npm run build exit 0 (only benign rollup "use client" notices).

### B. Auth and accounts
- Email/password + Google OAuth sign-in.
- Fixed sign-in redirect bug: Supabase Site URL must include scheme
  (http://localhost:8080) plus Redirect URL http://localhost:8080/**.
- Revoked leaked sessions via ban/unban.
- Owner account on ultimate plan exists (haidersiddique0909@gmail.com).

### C. Monetization
- Plans free/pro/ultimate (src/lib/plans.ts).
- Lemon Squeezy checkout routes + webhook handler (signature verification,
  variant->plan mapping).
- Free-tier quotas with time-window reset via increment_usage RPC;
  pro/ultimate unlimited.
- BYOK settings page: users store their own provider keys encrypted at rest
  (API_KEY_ENCRYPTION_SECRET, scrypt-based crypto.server.ts).

### D. AI engine (current state)
- DEFAULT BRAIN = Ox Alpha (stealth/ox-alpha via OpenRouter, 1M context) for
  EVERY AI feature: Chat, Engineer Mode, Code Review, Terminal commands,
  Git tools, File modifications, Connectors.
  - Provider entry added in src/lib/model-providers.ts (openAiCompatible,
    baseURL https://openrouter.ai/api/v1). Also visible in Settings UI.
  - Resolver src/lib/model-resolution.server.ts priority:
    user BYOK key -> platform OXALPHA_API_KEY -> Gemini fallback.
  - connectors.functions.ts migrated off direct GEMINI_API_KEY onto resolver.
- Key verified live: OpenRouter key returns 200 OK from stealth/ox-alpha.
- Other providers still selectable per-user (gemini/openai/anthropic/
  openrouter/groq/deepseek/mistral).

### E. Engineer Mode (Claude-style trigger)
- detectEngineerIntent rewritten in src/lib/engineer.schema.ts.
- Opens ONLY for greenfield "build me a whole project" prompts. Triggers on:
  persona framing ("Act as a senior full stack engineer..."),
  scratch signals ("from scratch", "full-stack"), build verb + project noun
  (app/website/saas/dashboard/bot/extension/game/mvp/api ...).
- Stays normal chat for: questions ("how do I create..."), small-scope asks
  (function/helper/component/script/test), modifications of existing projects
  (fix/add/update my app).
- Verified with 17/17 intent tests (tsx run).
- Full pipeline: progress steps, database schema, env vars, testing guide,
  deployment guide, production checklist, README generation.

### F. Downloads and distribution
- /download marketing page with plan gating:
  - Desktop card: free for ALL plans.
  - VS Code card: Pro/Ultimate only; anonymous/free see upgrade CTA.
- API routes:
  - GET /api/download/desktop -> 302 redirect to stable GitHub release URL.
  - GET /api/download/vsix -> auth required; checks profile.plan; 302 to
    Supabase Storage URL; errors as JSON {error:"auth_required"|"upgrade_required"}.
  - GET /api/vscode/latest and /api/desktop/latest -> public JSON update feeds.
- VSIX hosted on Supabase Storage bucket "zeus-releases" (public), 200 OK.
- Desktop installer hosted on GitHub Releases repo Haidersiddique942/Zeus,
  stable permalink verified 200 OK (98MB).
- Extension auto-update: update-check.ts fetches /api/vscode/latest 15s after
  activation, prompts with dismiss-per-version memory; semver comparator unit-
  tested (10 assertions) and wired into npm test chain.
- electron-builder publish config points at generic feed
  https://zeusai.website/api/desktop/ for future desktop auto-update.

### G. Voice / mic (speech-to-text)
- Ported from old workspace into this project:
  src/lib/voice-transcribe.server.ts + route POST /api/voice/transcribe.
- Provider chain (product decision): Groq Whisper PRIMARY for mic only ->
  Gemini audio -> Mistral Voxtral -> Cerebras (auto-skipped, no STT API) ->
  Cloudflare Workers AI @cf/openai/whisper.
- Groq key reserved EXCLUSIVELY for voice input; all other AI = Ox Alpha.
- Security: server-side Bearer auth, per-user 20 req/min rate bucket, 10MB cap,
  MIME allowlist, credentials never leave server env.
- NOTE: frontend mic UI not yet wired in web chat composer (desktop app uses
  MediaRecorder flow); endpoint ready for integration.

### H. Desktop branding
- scripts/generate-icons.mjs rewritten: copies public/favicon.ico (256x256)
  to build/icon.ico so exe/installer/shortcut/taskbar all show Zeus favicon.
- BrowserWindow dev icon wired with existsSync guard (electron/main.mjs).
- Root package.json version set to 1.5.0 to match GitHub tag; extension stays
  0.4.0 independently.
- Fresh unsigned installer built: release/Zeus-AI-Setup-1.5.0.exe (96.8MB).
  USER ACTION PENDING: re-upload this new exe to GitHub release v1.5.0
  (replace old asset; filename identical so permalink unchanged).

---

## 4. Environment Variables (.env, all present locally)

Supabase: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY,
VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
AI: OxALPHA_API_KEY (OpenRouter sk-or-v1-...), GEMINI_API_KEY, GROQ_API_KEY
(mic only), QWEN_API_KEY, CEREBRAS_API_KEY, MISTRAL_API_KEY,
CLOUDFLARE_API_KEY, CLOUDFLARE_ACCOUNT_ID, DEEPSEEK_API_KEY
Billing: LEMONSQUEEZY_STORE_ID, PRO/ULTIMATE product+variant IDs,
LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_WEBHOOK_SECRET, VITE checkout URLs
Security: API_KEY_ENCRYPTION_SECRET
Releases: ZEUS_DESKTOP_SETUP_URL, ZEUS_DESKTOP_VERSION=1.5.0,
ZEUS_VSIX_URL, ZEUS_VSIX_VERSION=0.4.0
Site: VITE_SITE_URL

---

## 5. Pending / Next Steps

1. Re-upload new exe (favicon icon) to GitHub release v1.5.0 replacing old asset.
2. Deploy web to Vercel: add all env vars above in Vercel dashboard
   (especially the 4 ZEUS_* ones + OxALPHA_API_KEY).
3. Point domain zeusai.website at Vercel; Supabase Site URL must switch from
   localhost to the production domain (plus redirect URLs).
4. Desktop auto-update feed becomes live once zeusai.website serves
   /api/desktop/latest (publish config already points there).
5. Optional: wire mic button in web chat composer to /api/voice/transcribe.
6. Optional: publish VSIX to VS Code Marketplace later (current channel =
   website download).
7. Optional: code-signing certificate for Windows exe (removes SmartScreen
   warning).
8. Known trade-off: structured outputs (generateObject used by engineer/
   terminal/code-review) go through an OpenRouter-compatible reasoning model;
   if any tool call misbehaves, test whether Tokenra/gateway honors
   response_format json_schema, else pin those features to a BYOK provider.

---

## 6. Repo Map (quick reference)

src/routes/           marketing (index/pricing/download), auth pages,
                      _authenticated (chat/settings/billing/engineer),
                      api/* (chat, engineer, checkout, webhooks/lemonsqueezy,
                      download/vsix, download/desktop, vscode/latest,
                      desktop/latest, voice/transcribe)
src/lib/              model-providers.ts, model-resolution.server.ts,
                      plans.ts, power-features.ts (hidden modes),
                      engineer.schema.ts, voice-transcribe.server.ts,
                      crypto.server.ts, *.functions.ts (server fns per domain)
electron/             main.mjs, preload.cjs (desktop shell)
extensions/zeus-vscode/  v0.4.0 extension (chat UI, OTP login, engineer,
                      update-check.ts, semver.ts, CHANGELOG)
scripts/              generate-icons.mjs, copy-env.mjs
supabase/migrations/  23 SQL migrations
build/icon.ico        generated from public/favicon.ico at desktop build time
release/              Zeus-AI-Setup-1.5.0.exe (latest, favicon icon)
