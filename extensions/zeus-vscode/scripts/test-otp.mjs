// Unit test for the pure `extractOtpToken` helper. Node 22.6+ runs TS
// natively (type stripping); on Node 24 this runs with no flags.
// Run: node scripts/test-otp.mjs
import assert from "node:assert/strict";
import { extractOtpToken } from "../src/auth/otp.ts";

let passed = 0;
function eq(name, input, expected) {
  assert.equal(extractOtpToken(input), expected, name);
  passed++;
}

// 6-digit numeric codes
eq("6-digit code", "123456", "123456");
eq("6-digit code with whitespace", "  987654  ", "987654");

// Full magic-link URLs (default hosted template) — token query param wins
eq(
  "magic link URL",
  "https://ohgvjmrgaperrfhcrgld.supabase.co/auth/v1/verify?token=abc123&type=email&redirect_to=http%3A%2F%2F127.0.0.1%3A12345%2Fcallback",
  "abc123",
);
eq("link with longer token", "https://x.supabase.co/auth/v1/verify?token=abcdefghij&type=email", "abcdefghij");
eq("link missing token", "https://x.supabase.co/auth/v1/verify?type=email", null);
eq("link with short token", "https://x.supabase.co/auth/v1/verify?token=abc&type=email", null);
eq("malformed URL", "http://", null);

// Raw tokens copied from a link
eq("raw base64url token", "K2x9fQab_cde12345", "K2x9fQab_cde12345");
eq("raw token with padding", "abcd1234567=", "abcd1234567=");
eq("short raw token rejected", "abc", null);
eq("token with spaces rejected", "abc def", null);

// Empty / junk
eq("empty string", "", null);
eq("whitespace only", "   ", null);
eq("letters that are not a link", "hello world!!", null);

console.log(`[otp] ${passed} assertions passed`);
