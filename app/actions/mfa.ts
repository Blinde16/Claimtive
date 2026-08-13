"use server";

import QRCode from "qrcode";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import {
  decryptSecret,
  encryptSecret,
  generateBackupCodes,
  generateMfaSecret,
  hashBackupCode,
  mfaKeyUri,
  verifyMfaToken
} from "@/lib/auth/mfa";
import { recordAudit } from "@/lib/audit";
import { denyDemoWrite } from "@/lib/demo";

export interface MfaState {
  error?: string;
  enrolling?: { qrDataUrl: string; secret: string };
  backupCodes?: string[];
  success?: string;
}

/** Step 1: generate a secret, store it (disabled), return a QR to scan. */
export async function beginMfaEnroll(): Promise<MfaState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You must be signed in." };
  // Enrolling MFA on the shared demo account would lock everyone else out of
  // it permanently — the enroller is the only one holding the TOTP secret.
  const denied = denyDemoWrite(user);
  if (denied) return denied;

  const secret = generateMfaSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaSecret: encryptSecret(secret), mfaEnabled: false }
  });

  const uri = mfaKeyUri(user.email, secret);
  const qrDataUrl = await QRCode.toDataURL(uri);
  return { enrolling: { qrDataUrl, secret } };
}

/** Step 2: confirm a code against the pending secret, then enable + issue backup codes. */
export async function confirmMfaEnroll(code: string): Promise<MfaState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You must be signed in." };
  const denied = denyDemoWrite(user);
  if (denied) return denied;

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { mfaSecret: true }
  });
  if (!record?.mfaSecret) {
    return { error: "Start enrollment first." };
  }

  const secret = decryptSecret(record.mfaSecret);
  if (!verifyMfaToken(code ?? "", secret)) {
    return { error: "That code didn't match. Check your authenticator app and try again." };
  }

  const backupCodes = generateBackupCodes();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      mfaEnabled: true,
      mfaBackupCodes: backupCodes.map(hashBackupCode)
    }
  });

  await recordAudit({
    organizationId: user.organizationId,
    userId: user.id,
    userEmail: user.email,
    action: "mfa.enabled"
  });

  return {
    success: "Two-factor authentication is on.",
    backupCodes
  };
}

/** Disable MFA (requires current password). */
export async function disableMfa(password: string): Promise<MfaState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You must be signed in." };
  const denied = denyDemoWrite(user);
  if (denied) return denied;

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true }
  });
  if (!record || !(await verifyPassword(password ?? "", record.passwordHash))) {
    return { error: "Incorrect password." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [] }
  });

  await recordAudit({
    organizationId: user.organizationId,
    userId: user.id,
    userEmail: user.email,
    action: "mfa.disabled"
  });

  return { success: "Two-factor authentication is off." };
}
