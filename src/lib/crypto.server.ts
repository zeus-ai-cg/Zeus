import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// ---------------------------------------------------------------------------
// Server-only. Never import this from client-rendered code — it reads a
// server secret from process.env and is only ever called inside
// createServerFn handlers (see model-keys.functions.ts).
//
// Format stored in the DB: "<iv-base64>.<authTag-base64>.<ciphertext-base64>"
// ---------------------------------------------------------------------------

function getKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      "Missing API_KEY_ENCRYPTION_SECRET. Set it in your environment before saving BYOK API keys (see .env.example).",
    );
  }
  // Derive a fixed 32-byte key from whatever-length secret is configured.
  return scryptSync(secret, "zeus-ai-byok-keys", 32);
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${authTag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  const key = getKey();
  const [ivB64, authTagB64, ciphertextB64] = stored.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) throw new Error("Malformed encrypted value.");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

export function lastFour(value: string): string {
  return value.slice(-4);
}
