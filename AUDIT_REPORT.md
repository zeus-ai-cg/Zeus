# Zeus AI — Production Audit Report
**Date:** 2026-07-26
**Scope:** Security verification, dead-feature cleanup, code cleanup, production readiness review.

**Environment limitation, stated up front:** this sandbox has no network access, so I could not run `npm install`, `npm run build`, `npm run lint`, or `npm run typecheck`. Everything below is a manual code/SQL review, not a build-verified one. **Run `npm run build` and `npm run lint` locally before deploying** — see "Before you deploy" at the bottom.

---

## 0. Urgent — action required from you, not fixable in code

Your uploaded zip contained a **live `.env` file with real, non-placeholder credentials**: your Supabase URL/project ref/publishable key, a live Paddle client token + price ID, and a live `GEMINI_API_KEY`. I did not print, log, or copy any of these values anywhere in this conversation or into any deliverable.

Two things to do:
1. **The project had no `.gitignore` at all.** Nothing was stopping `.env` from being committed to git and pushed to a public (or even private-but-shared) GitHub repo, or baked into a Vercel deployment artifact. I've added one now (see Part 4).
2. **Rotate `GEMINI_API_KEY`** in Google AI Studio as a precaution, since it passed through this session. Your Supabase publishable key and Paddle client token are meant to be public (they're client-exposed by design and gated by RLS/Paddle's own checkout flow), so rotating those is optional, not urgent. `SUPABASE_SERVICE_ROLE_KEY`, `PADDLE_WEBHOOK_SECRET`, and `API_KEY_ENCRYPTION_SECRET` were **not** present in your `.env` (blank) — good, keep it that way until you set real values directly in Vercel's environment settings, never in a file that gets zipped up.

---

## 1. Free Pro exploit — verified fixed

- `completeOnboarding` (src/lib/profile.functions.ts) accepts `plan` only to decide which screen to redirect to; it never writes `plan` to the database.
- `setPlan` only accepts the literal `"free"` — it cannot upgrade anyone.
- **Database-level backstop** (`supabase/migrations/20260725120000_lock_down_profile_privileges.sql`): a `BEFORE UPDATE` trigger on `profiles` freezes `plan`, `questions_used`, `usage_reset_at`, `pro_requests_used`, `pro_usage_reset_at`, `score`, and `created_at` back to their old values whenever the write comes from the plain `authenticated` role. This means even a hand-crafted `supabase.from('profiles').update({ plan: 'pro' })` from the browser console is a no-op.
- The **only** path that can set `plan = 'pro'` is `src/routes/api/webhooks/paddle.ts`, which runs with the service-role key (bypasses the trigger) and only after HMAC signature verification.

**I found one real gap in this chain**, now fixed — see Part 2.

## 2. Bug found & fixed: usage-reset window mismatch (12h vs 24h)

`increment_usage()` (consumes a free question on every chat message) correctly uses a **24-hour** rolling window, matching `FREE_RESET_HOURS = 24` in `src/lib/achievements.ts`. But `get_current_usage()` — a *read-only* "reset-if-due" check added later, called by `getMe()` and by the chat route's pre-flight check — still hardcoded a **12-hour** window from an earlier copy of the function.

**Effect:** any request that loads the dashboard, sidebar, billing page, etc. more than 12h after a free user's last reset silently zeroes `questions_used` early. In practice this meant free users' real-world quota reset roughly every ~12h instead of the intended 24h — effectively close to double the intended free allotment — any time the UI polled usage, which happens constantly just from navigating the app.

**Fix:** `supabase/migrations/20260726090000_fix_usage_reset_window_mismatch.sql` redefines `get_current_usage()` with the same 24h window. **You need to run this migration** for the fix to take effect (see Part 4).

## 3. Vulnerability found & fixed: `project_contexts` full-table read via anon key

This is the most significant finding in this audit.

The Connectors feature lets a user generate a link (`/api/context/$token`) that pastes project content for an external AI tool to fetch — intentionally public, protected only by an unguessable 192-bit random token (documented as "same trust model as a Google Docs share link").

The RLS policy backing it (`"Anyone with the token can read a project context"`) was written as:
```sql
create policy "Anyone with the token can read a project context"
  on public.project_contexts for select using (true);
```
This has **no role restriction** (applies to `anon`, not just `authenticated`) and **`using (true)` is unconditionally true for every row** — nothing in the policy actually requires knowing the token. The app's own route always added `.eq('token', ...)`, so the UI never exposed this, but the token check lived only in the client's query, not in the database. Anyone with your public anon key (which ships in every page load as `VITE_SUPABASE_PUBLISHABLE_KEY`) could call `GET {SUPABASE_URL}/rest/v1/project_contexts?select=*` directly and read **every user's shared project content** — no token needed at all.

**Fix** (`supabase/migrations/20260726093000_fix_project_context_token_leak.sql`):
- Dropped the blanket policy.
- Added a `SECURITY DEFINER` function `get_project_context_by_token(p_token text)` that looks up exactly one row by token match, granted to `anon` and `authenticated`.
- Updated `src/routes/api/context.$token.ts` to call the RPC instead of a direct table select.

This closes the bypass while keeping the feature working exactly as before from the user's perspective — a function argument can't be enumerated the way `select *` can.

**You need to run this migration** (see Part 4).

## 4. Migrations — what to run, and a gap I found in your catch-up script

Your repo has two ways to bring a database up to date:
- **`supabase/migrations/`** — the real, ordered migration history (17 files now, in order).
- **`supabase/production_upgrade_20260725.sql`** — a hand-generated, idempotent, non-destructive "catch-up" script whose header says it's meant to be pasted once into the Supabase SQL Editor for a database that's fallen behind.

**The catch-up script predated, and was missing, the two most important fixes in this whole audit** — the Free-Pro-exploit trigger (Part 1) and the `paddle_subscription_id`/`paddle_customer_id` columns the webhook needs. If you had run *only* that file against a lagging production database (its literal stated purpose), you'd still have shipped the exploit. **I brought it fully current** — it now also includes the privilege-lockdown trigger, `get_current_usage` (with the 24h fix baked in from the start), `increment_score`, the Paddle subscription columns, and the `project_contexts` token-leak fix, and marks all 17 migrations as applied in `supabase_migrations.schema_migrations`.

**What to actually run**, pick one:
- **Recommended:** `supabase db push` (applies `supabase/migrations/*.sql` in order via the CLI), *or*
- Paste the full, now-updated `supabase/production_upgrade_20260725.sql` into the Supabase SQL Editor once. Safe to run even if some of it is already applied (every statement is `IF NOT EXISTS` / `CREATE OR REPLACE` / `ON CONFLICT DO NOTHING`).

Either way, **the two new migrations are the ones that matter most if you've already deployed before**: `20260726090000_fix_usage_reset_window_mismatch.sql` and `20260726093000_fix_project_context_token_leak.sql`.

## 5. Paddle billing — verified

- Paddle Billing v2, HMAC-SHA256 signature verification with `timingSafeEqual`, 5-minute replay window.
- `custom_data.user_id` correctly threads the Supabase user id through checkout → webhook.
- `subscription.activated` / `subscription.resumed` → sets `plan: 'pro'`, resets Pro usage counters, records `paddle_customer_id`/`paddle_subscription_id`.
- `subscription.canceled` / `subscription.paused` → sets `plan: 'free'`, matched by `paddle_subscription_id`.
- Duplicate delivery: not explicitly deduplicated by event id, but every handler is idempotent by construction (re-running the same UPDATE produces the same state), so duplicate webhook deliveries are harmless.
- Runs under the service-role key, so it bypasses the privilege-lockdown trigger by design — this is the one legitimate path.
- **Not verified against a live Paddle account** (no network access here) — the code matches Paddle's documented signature scheme, but test it against Paddle's sandbox before relying on it in production, same caveat the prior delivery already flagged.

## 6. Secrets

- `.env.example` — already clean placeholders, nothing to fix.
- `.env` — see Part 0 above.
- No hardcoded API keys, tokens, or credentials found anywhere in `src/` (checked for Gemini/OpenAI/Anthropic-shaped key patterns and any literal `service_role`/`SUPABASE_SERVICE_ROLE_KEY` values).
- Service-role key is only ever read server-side (`client.server.ts`), never bundled to the client.
- `.gitignore` added — previously **did not exist at all**.

## 7. Database security (RLS, RPCs, triggers)

- Every table has RLS enabled with an owner-scoped policy (`auth.uid() = user_id` or `= id`).
- `profiles.plan` / usage counters / `score` are frozen against direct `authenticated`-role writes by the trigger in Part 1.
- `increment_usage`, `increment_score`, `get_current_usage` are all `SECURITY DEFINER`, all check `p_user_id = auth.uid()` before touching a row, and are `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated` only.
- `project_contexts` — fixed, see Part 3.
- **Minor, low-severity, not fixed:** the `achievements` table's RLS policy (`FOR ALL ... USING/WITH CHECK auth.uid() = user_id`) technically lets an authenticated user `INSERT` arbitrary achievement codes into their own row directly (not just via the server route in `chat.ts`), i.e. self-award any badge. This has no financial or data-access impact — achievements are cosmetic — so I left it as a flag rather than a fix. If you want it closed, the same pattern as `increment_score` (a `SECURITY DEFINER` RPC + revoking direct client INSERT) would do it.

## 8. Atomic operations

- `increment_usage` and `increment_score` both perform their read-check-write inside a single `UPDATE` statement, so Postgres's row lock serializes concurrent calls — no lost updates under concurrent requests. Verified this replaced an earlier read-then-write pattern (confirmed via the migration history and comments).
- `get_current_usage`'s reset check is likewise a single atomic `UPDATE`.

## 9. Dead "coding teacher" features — removed

Five static, DB-less content pages matching your Part 2 list were removed. Each was hardcoded filler content with a "start a chat" button — no backing table, no unique logic, safe to remove:

| Removed | What it was |
|---|---|
| `/projects` | Static list of "starter project ideas" (Todo App, Weather Dashboard, etc.) — a different concept from your real Workspace/Project Upload feature and confusing next to it |
| `/lessons` | "Saved Lessons — coming soon" placeholder, never implemented |
| `/roadmap` | Static "Learning Roadmap" content (Beginner → Advanced tracks) |
| `/challenges` | Static list of 6 hardcoded practice problems |
| `/interview` | Static list of interview-prep topics |

Also updated: sidebar nav (`route.tsx`), `robots.txt` route generator, and removed the now-unused `BookMarked`/`Map`/`Briefcase`/`GraduationCap` icon imports. `sitemap.xml` needed no change — it only ever listed marketing pages.

`src/routeTree.gen.ts` (TanStack Router's auto-generated route manifest) still lists the five deleted routes. **I deliberately did not hand-edit this file** — it's regenerated from scratch the moment you run `npm run dev` or `npm run build` (confirmed this is how the prior VS Code-extension removal in `CHANGES.md` was handled too), and hand-editing 800+ lines of generated type unions without a compiler to check my work risked introducing a subtle break I couldn't verify in this sandbox. **Run `npm run build` once locally and this file self-heals.**

### Flagged, not removed: Achievements / Leaderboard / score system

Per your instruction to only remove what's "truly unused" and to be conservative about database objects: **this is a live, working, DB-backed feature, not dead code.** `increment_score` runs on every chat message (+10 points), achievement codes are awarded based on real usage (`first_program`, `ten_questions`, language-specific badges), and the Leaderboard page shows real ranked users. Removing it would mean dropping the `achievements` table, the `profiles.score` column, the `protect_privileged_profile_columns` trigger's `score` clause, `increment_score`, two nav items, two routes, and the scoring block in `chat.ts` — a real product decision, not a cleanup. I left it in place and am flagging it here for you to decide. If you do want it gone, say so and I'll do the full removal (including the DB migration) in a follow-up.

## 10. Kept & untouched (per your instructions)

Workspace, Project Upload, Project Modification, Project Map, Diff Viewer, Code Engineer, API Designer, Git Review, AI Terminal, BYOK, Chat, Conversation History, Billing, Profile, Settings, Workspace Database, Thread System, Multi-model Support — all reviewed, none modified beyond what's listed above. Specifically checked and confirmed sound:
- **AI Terminal** (`src/lib/terminal.functions.ts`) — generates a command *suggestion* only via an LLM call; never executes anything server-side. Comments in the file confirm an earlier `child_process.spawn()` RCE fallback was already removed in a prior pass.
- **BYOK** (`crypto.server.ts`, `model-keys.functions.ts`) — AES-256-GCM encryption at rest, key never returned to the client, provider/model IDs validated against an allowlist.
- **Workspace upload** (`workspace.functions.ts`) — server-enforced file count (1,200), per-file (400KB), and total (15MB) limits, not just client-side; all queries RLS-scoped.
- **Connectors "edit project"** (`connectors.functions.ts`) — correctly counts against the same free/pro quota as chat, can't be used to bypass usage limits.

## 11. Code / repo cleanup

- Removed 11 stray root-level debug/research files (`paddle_cdn.js`, `paddle_matches.txt`, `paddle_search.txt`, `paddle_success.txt`, `paddle_ut.txt`, `paddle_ut_narrow.txt`, `paddle_checkout_api.txt`, `paddle_checkout_line.txt`, `paddle_open_def.txt`, `paddle_open_snippet.txt`, `paddle_pt_open.txt`) — confirmed unreferenced by any source file, config, or `package.json` script before deleting. These were leftover scratch dumps from a prior investigation into the Paddle CDN script, not part of the app.
- No dead components, hooks, or duplicate logic found beyond the five stub pages above — the rest of `src/` is in active use (verified via cross-reference grep for every route/component).

## 12. Production review (Part 5)

| Item | Status |
|---|---|
| Google Login | Not reviewed in depth this pass — `auth.tsx` uses Supabase Auth; no code smell found, but I didn't trace the OAuth redirect config (that lives in your Supabase dashboard, not the repo) |
| Supabase | RLS/RPC audit above; schema is consistent across all 17 migrations |
| Workspace Upload/Chat | Reviewed, sound (Part 10) |
| Thread Creation | RLS-scoped, reviewed as part of `chat.ts` |
| Billing | Reviewed in depth (Part 5) |
| Profile | Reviewed (`profile.functions.ts`) |
| Database | Reviewed (Parts 1–3, 7–8) |
| Error Handling | `server.ts`/`error-page.ts` return a generic HTML error page on 500s — no stack traces or internals leaked to the client. Good. |
| Environment Variables | See Parts 0, 6, and the table below |
| Build Configuration | Could not run `npm run build` — no network access in this sandbox |
| Vercel Deployment | Not verifiable without deploying |
| Performance | Not profiled this pass |
| Routing | `routeTree.gen.ts` self-heals on next build (Part 9) |
| SEO / Search Console | `sitemap.xml` and `robots.txt` reviewed, both clean and consistent after the Part 9 cleanup |

## 13. Environment variables required

From `.env.example` (already correct, no changes needed):

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | Yes | |
| `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Safe to expose client-side |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | **Server-only, never commit** |
| `GEMINI_API_KEY` | Yes | Server-only |
| `VITE_SITE_URL` | Recommended | Powers canonical/OG tags, sitemap, robots.txt |
| `VITE_PADDLE_CLIENT_TOKEN` / `VITE_PADDLE_PRICE_ID` / `VITE_PADDLE_ENV` | Optional | Upgrade button disabled without these |
| `PADDLE_WEBHOOK_SECRET` | Required for Pro to ever activate | Without it the webhook endpoint rejects every event |
| `API_KEY_ENCRYPTION_SECRET` | Required for BYOK | `openssl rand -base64 32`; back it up, changing it orphans existing saved keys |

## 14. Manual deployment steps

1. Rotate `GEMINI_API_KEY` (Part 0).
2. Set all required env vars above directly in Vercel's dashboard — never in a committed file.
3. Run the two new migrations against your Supabase project (Part 4) — either `supabase db push` or the updated `production_upgrade_20260725.sql`.
4. Locally: `npm install && npm run build && npm run lint` — fix anything a real compiler surfaces that this manual review couldn't catch.
5. Confirm the Paddle webhook destination in your Paddle dashboard points at `{your domain}/api/webhooks/paddle` and is subscribed to at least `subscription.activated`, `subscription.resumed`, `subscription.canceled`, `subscription.paused`.
6. Test one real (or sandbox) Paddle checkout end-to-end and confirm `plan` flips to `pro` — this webhook has not been exercised against a live Paddle account from this sandbox (no network access).
7. Set `VITE_SITE_URL` to your real production domain before launch (sitemap/robots/canonical tags depend on it).

## 15. Remaining risks / things I did not do

- **Could not build, lint, or typecheck** — no network access in this sandbox. This is the single biggest gap between this review and true "verified" status.
- **Paddle webhook untested against a live account** (Part 5).
- **Google OAuth config** lives outside the repo (Supabase dashboard) and wasn't reviewed.
- **Achievements/Leaderboard system** — flagged, not removed (Part 9) — needs your decision.
- **`achievements` table INSERT policy** — minor, low-severity gap (Part 7), not fixed.
- **No rate limiting** on Workspace project creation beyond the per-request size caps — a free user could create many 15MB projects back-to-back without hitting the 15-question/24h quota (that quota only gates chat/edit requests, not uploads). Not a security hole, but worth knowing if storage cost matters to you.
- I did not attempt to verify the frontend actually renders correctly (no dev server / no browser in this sandbox) — this was a static code + SQL review.

## 16. Production readiness

**Given the fixes in this delivery, and once you complete the manual steps in Part 14 (especially rotating the Gemini key, running the two new migrations, and running a real `npm run build` locally):**

- **SAFE FOR GITHUB** — yes, now that `.gitignore` exists and no secrets remain in tracked source. (Rotate the Gemini key regardless, since it was exposed to this session before the fix.)
- **SAFE FOR VERCEL** — yes, contingent on setting env vars directly in Vercel rather than committing them.
- **SAFE FOR DOMAIN / PUBLIC LAUNCH** — contingent on Part 14 steps 3, 4, and 6 (migrations run, build verified locally, one real webhook tested). I'm not in a position to declare this unconditionally since I could not execute a real build or exercise the payment flow end-to-end in this sandbox — that verification has to happen on your end before launch.

I'm confident in the code-level security posture: the free-Pro exploit is genuinely closed at both the app and database layer, and the one real vulnerability I found (the `project_contexts` full-table read) is fixed. The gap between "I'm confident in this" and "unconditionally production-ready" is entirely the untested build/deploy/payment-flow steps that need real infrastructure to verify.
