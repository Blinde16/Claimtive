import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";
import { authenticator } from "otplib";
import { SignJWT, jwtVerify } from "jose";

// Allow +/- 1 time-step (30s) for clock skew.
authenticator.options = { window: 1 };

const ISSUER = "Claimtive";

/**
 * 32-byte AES key for encrypting TOTP secrets. Prefers a DEDICATED secret
 * (MFA_ENCRYPTION_KEY) so a leak of the session-signing AUTH_SECRET does not
 * also expose every stored MFA secret. Falls back to AUTH_SECRET for backward
 * compatibility until the dedicated secret is provisioned.
 *
 * To provision: create a Secret Manager secret `claimtive-mfa-key`, wire it as
 * MFA_ENCRYPTION_KEY in apphosting.yaml, and re-enroll MFA (the demo runs with
 * MFA off, so there are no existing secrets to migrate).
 */
function aesKey(): Buffer {
  const secret = process.env.MFA_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) throw new Error("MFA_ENCRYPTION_KEY / AUTH_SECRET is not set");
  return createHash("sha256").update(secret).digest();
}

function authSecretBytes(): Uint8Array {
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? "");
}

// ---- TOTP ----

export function generateMfaSecret(): string {
  return authenticator.generateSecret();
}

export function mfaKeyUri(accountEmail: string, secret: string): string {
  return authenticator.keyuri(accountEmail, ISSUER, secret);
}

export function verifyMfaToken(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token: token.replace(/\s+/g, ""), secret });
  } catch {
    return false;
  }
}

// ---- Secret encryption (AES-256-GCM) ----

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    enc.toString("base64")
  ].join(":");
}

export function decryptSecret(stored: string): string {
  const [ivB, tagB, encB] = stored.split(":");
  const decipher = createDecipheriv("aes-256-gcm", aesKey(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encB, "base64")),
    decipher.final()
  ]).toString("utf8");
}

// ---- Backup codes ----

export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const hex = randomBytes(6).toString("hex"); // 12 hex chars
    codes.push(`${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`);
  }
  return codes;
}

export function hashBackupCode(code: string): string {
  return createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}

/** Returns ok + the remaining (unused) hashes if a backup code matched. */
export function consumeBackupCode(
  code: string,
  hashes: string[]
): { ok: boolean; remaining: string[] } {
  const h = hashBackupCode(code);
  if (hashes.includes(h)) {
    return { ok: true, remaining: hashes.filter((x) => x !== h) };
  }
  return { ok: false, remaining: hashes };
}

// ---- Short-lived MFA challenge (between password step and code step) ----

const MFA_PURPOSE = "mfa-challenge";
export const MFA_COOKIE = "claimtive_mfa";

export const mfaCookieOptions = {
  name: MFA_COOKIE,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 300 // 5 minutes
};

export async function signMfaChallenge(userId: string): Promise<string> {
  return new SignJWT({ sub: userId, purpose: MFA_PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(authSecretBytes());
}

export async function verifyMfaChallenge(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, authSecretBytes());
    if (payload.purpose !== MFA_PURPOSE) return null;
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}
