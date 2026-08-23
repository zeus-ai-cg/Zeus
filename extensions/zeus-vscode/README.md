# Zeus AI — VS Code Extension

> **Phase 1 (current):** Extension skeleton + secure authentication.
> No AI/chat calls, no code editing, no terminal execution, no Engineer Mode yet — that ships in later phases.

Zeus AI is your AI coding companion for VS Code. It connects to the **Zeus AI backend** (the same account, plans, and centralized multi-provider model router used by Zeus AI Web and Desktop) — the extension never holds AI provider API keys.

---

## Features (Phase 1)

- **Zeus AI activity bar** — dedicated sidebar icon in the VS Code Activity Bar.
- **Welcome / login screen** — a polished sign-in experience:
  - **Continue with Google** (PKCE OAuth, opens the system browser, loops back to the extension).
  - **Sign in with Email** — a verification code is sent to your inbox; enter the 6-digit code to sign in.
  - **Create Account** — same email verification flow provisions a new Zeus AI account.
- **Secure session storage** — sessions live in VS Code **SecretStorage** (Electron `safeStorage`-encrypted). Never in settings, workspace state, files, or logs.
- **Sign out** — clears the stored session.

## What comes later (not in this phase)

Chat, current-file/selection context, code explain/fix/refactor/generate, tests, debug, code review, workspace awareness, codebase search, terminal context, Engineer Mode, diff preview, apply/undo, conversation history, and the Faaah easter egg. All of it will flow through the Zeus backend — no provider keys in the extension.

---

## Authentication architecture

The extension reuses **the exact same Supabase project and account system** as Zeus AI Web and Desktop — there is **no second authentication system**.

| Flow | Mechanism |
| --- | --- |
| Google | `@supabase/supabase-js` with `flowType: "pkce"`. The extension starts a loopback HTTP server on `127.0.0.1:<random-port>`, opens the Supabase Google authorize URL in the system browser, receives the callback, and exchanges the authorization code for a session. |
| Email sign-in / create account | `supabase.auth.signInWithOtp({ email })` emails a verification code; `supabase.auth.verifyOtp({ email, token, type: "email" })` validates it and returns a session. |

### Supabase project setup (one-time, in the Supabase dashboard)

1. **Google provider** must be enabled: Supabase Dashboard → Authentication → Providers → Google (client ID + secret). This is already configured for the Zeus AI web/desktop app.
2. **Redirect URL allowlist** must include the loopback callback. Supabase only redirects to whitelisted URLs, and the extension uses a **random free port** on each sign-in — so add a wildcard entry: Auth → URL Configuration → Redirect URLs → add
   ```
   http://127.0.0.1:*
   ```
   (or `http://127.0.0.1:*/**` depending on your Supabase version).
3. **Email verification token** — this is the setting that determines what your users receive:

   - Supabase's **default** hosted "Sign in / Magic link" template emails a **confirmation link**, not a numeric code. The extension handles this: you can paste the full link (or its token) into the verification field, and `verifyOtp` validates it — the link's `token` parameter is the same one-time OTP token.
   - To email a **6-digit numeric code** instead (the nicer UX), edit the template in the dashboard: **Authentication → Email Templates → Sign in / Magic link** and add `{{ .Token }}` to the body, e.g.:
     ```
     <h2>Your Zeus AI verification code</h2>
     <p>Enter this code to sign in: <strong>{{ .Token }}</strong></p>
     ```
   - Template editing **does not require custom SMTP** — hosted Supabase renders your template with its built-in email service. (Custom SMTP is only needed to send from your own domain.)
   - If you also offer **Create Account**, update the **Confirm signup** template the same way.

   The extension's code never assumes one shape: `verifyOtp` accepts a 6-digit code, a full magic-link URL, or the raw token.

### Security properties

- **No provider API keys** (no Qwen, Gemini, Groq, Mistral, Cerebras, DeepSeek, Cloudflare keys) anywhere in the extension. All AI requests will go through the Zeus backend.
- **No service-role keys.** Only the public Supabase URL and the **publishable (anon)** key are used — the same public anon key the Zeus web app ships in its client bundle.
- **JWT/session secrets only in SecretStorage.** Access tokens and refresh tokens are never logged and never written to disk outside SecretStorage.
- **Loopback only.** The OAuth callback server binds to `127.0.0.1` and closes after the exchange completes or times out.

---

## Configuration

Settings under the `zeus` section (File → Preferences → Settings, search "Zeus"):

| Setting | Default | Notes |
| --- | --- | --- |
| `zeus.apiBaseUrl` | `https://YOUR-PRODUCTION-ZEUS-DOMAIN` | **Placeholder** — set your real Zeus production domain before release. Not used by Phase 1 auth (auth goes straight to Supabase), stored for later phases. |
| `zeus.supabaseUrl` | your Zeus Supabase project URL | Override for dev/testing against another project. |
| `zeus.supabaseAnonKey` | your Zeus publishable anon key | Public key only. Never enter a service-role key here. |

---

## Development

```bash
cd extensions/zeus-vscode
npm install

# Typecheck
npm run typecheck

# Lint
npm run lint

# Build the bundle
npm run build

# Package a .vsix (local install / distribution)
npm run package        # or: npm run build && npx @vscode/vsce package
```

### Running locally in VS Code

1. Open the `extensions/zeus-vscode` folder in VS Code.
2. Press `F5` (Run and Debug → "Run Extension"). A new Extension Development Host window opens.
3. Click the **Zeus AI** activity bar icon and sign in.

### CommonJS gotcha

`dist/extension.js` is CommonJS (the VS Code extension host runs CJS). `esbuild` handles the transform; `tsc --noEmit` only type-checks.

---

## Commands

| Command | ID | Description |
| --- | --- | --- |
| Zeus: Open | `zeus.open` | Focus the Zeus AI sidebar. |
| Zeus: Sign In | `zeus.signIn` | Open the sign-in view. |
| Zeus: Sign Out | `zeus.signOut` | Clear the stored session. |

---

## License

See [LICENSE](./LICENSE).
