/**
 * Pure helper: normalize the user's email-verification input into the OTP
 * token `supabase.auth.verifyOtp({ type: "email" })` expects. No imports, no
 * I/O — trivially unit-testable (see scripts/test-otp.mjs).
 *
 * Supabase's email can arrive in different shapes depending on the project's
 * "Sign in / Magic link" template configuration:
 *
 *   1. A 6-digit numeric code (template renders `{{ .Token }}`).
 *   2. A confirmation LINK — the default hosted template. The link is
 *        https://<project>.supabase.co/auth/v1/verify?token=<TOKEN>&type=email&...
 *      and its `token` query param is the same one-time OTP token that
 *      `verifyOtp` consumes.
 *   3. A raw token copied out of such a link.
 *
 * Returns null for inputs that cannot be a valid verification token.
 */
export function extractOtpToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Numeric 6-digit code (the "enter the code" UX).
  if (/^[0-9]{6}$/.test(trimmed)) return trimmed;

  // Full magic-link URL: grab the `token` query param.
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      const token = url.searchParams.get("token");
      if (token && token.length >= 6) return token;
      return null;
    } catch {
      return null;
    }
  }

  // Raw token (copied from the link): allow URL-safe base64 including `=`
  // padding; anything reasonably token-shaped of length >= 6.
  if (trimmed.length >= 6 && /^[A-Za-z0-9_-]+=*$/.test(trimmed)) return trimmed;

  return null;
}
