// Maps raw Supabase auth error messages to clear, specific, user-facing
// copy. Falls back to the real Supabase message (never a generic
// "Something went wrong") if we don't recognize it, so nothing is hidden.
// Shared by the web login page (/auth) and the desktop handoff page
// (/auth/desktop).
export function mapAuthError(message: string): string {
  const m = message.toLowerCase();

  if (m.includes("invalid login credentials")) {
    // Supabase deliberately returns this same message whether the email
    // doesn't exist or the password is wrong, so it can't be used to probe
    // which accounts exist. We surface it as a single, accurate message
    // rather than guessing (and, critically, never fall back to signup).
    return "Incorrect email or password.";
  }
  if (m.includes("unable to validate email address") || m.includes("invalid email")) {
    return "That email address doesn't look valid.";
  }
  if (
    m.includes("user already registered") ||
    m.includes("already registered") ||
    m.includes("already exists")
  ) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (m.includes("password should be at least") || m.includes("password is too short")) {
    return message; // already specific and actionable as-is
  }
  if (m.includes("email rate limit") || m.includes("rate limit")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (m.includes("email not confirmed")) {
    return "Please confirm your email address before signing in.";
  }

  // Unrecognized error: show Supabase's real message rather than a vague one.
  return message;
}
