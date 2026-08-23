import type { Session } from "@supabase/supabase-js";
import { createAuthClient, saveSession } from "./session";
import { extractOtpToken } from "./otp";

/**
 * Email-based auth using Supabase's OTP system (no custom database or email
 * infrastructure — the Zeus Supabase project already handles delivery).
 *
 * Flow:
 *   1. `sendVerificationCode(email)` → Supabase emails a verification token
 *      (signInWithOtp). With `createAccount`, a missing account is
 *      provisioned; otherwise sign-in-only.
 *   2. `verifyEmailCode(email, input)` → verifyOtp validates the token and
 *      returns a session, which is persisted to SecretStorage.
 *
 * The user-facing input can be a 6-digit code, a full magic-link URL, or a
 * raw token — all normalize to the same OTP token via `extractOtpToken` (see
 * src/auth/otp.ts for the template-shape explanation). No custom verification
 * database is involved.
 *
 * Codes/tokens are never logged.
 */

export interface SendCodeResult {
  ok: boolean;
  message?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Send a verification email to the given address.
 * `createAccount=true` also provisions the account if it doesn't exist
 * (the "Create Account" button); `false` only signs in existing accounts.
 */
export async function sendVerificationCode(
  email: string,
  createAccount: boolean,
): Promise<SendCodeResult> {
  const normalized = normalizeEmail(email);
  if (!EMAIL_RE.test(normalized)) {
    return { ok: false, message: "Please enter a valid email address." };
  }

  const client = createAuthClient();
  const { error } = await client.auth.signInWithOtp({
    email: normalized,
    options: {
      shouldCreateUser: createAccount,
      ...(createAccount ? { data: { display_name: normalized.split("@")[0] } } : {}),
    },
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/**
 * Verify the code/token sent to the email and persist the resulting session.
 * Returns null on invalid/expired token.
 */
export async function verifyEmailCode(email: string, input: string): Promise<Session | null> {
  const normalized = normalizeEmail(email);
  const token = extractOtpToken(input);
  if (!EMAIL_RE.test(normalized) || !token) return null;

  const client = createAuthClient();
  const { data, error } = await client.auth.verifyOtp({
    email: normalized,
    token,
    type: "email",
  });

  if (error || !data.session) return null;
  await saveSession(data.session);
  return data.session;
}
