"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  signSession,
  verifySession,
  sessionCookieOptions,
  SESSION_COOKIE
} from "@/lib/auth/session";
import {
  checkRateLimit,
  clearRateLimit,
  registerFailure
} from "@/lib/auth/rateLimit";
import { recordAudit } from "@/lib/audit";
import {
  consumeBackupCode,
  decryptSecret,
  MFA_COOKIE,
  mfaCookieOptions,
  signMfaChallenge,
  verifyMfaChallenge,
  verifyMfaToken
} from "@/lib/auth/mfa";

export interface AuthState {
  error?: string;
  /** Password was correct but a TOTP code is required to finish signing in. */
  mfaRequired?: boolean;
  /** The MFA challenge expired — the user should re-enter email/password. */
  mfaExpired?: boolean;
}

// Lockout thresholds. Password: 5 failures / 15 min per email and per IP.
// Signup: 3 attempts / 1 hour per IP.
// MFA code: 6 failures / 10 min per user.
const LOGIN_MAX = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const SIGNUP_MAX = 3;
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
const MFA_MAX = 6;
const MFA_WINDOW_MS = 10 * 60 * 1000;

function getClientIp(): string {
  const h = headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function startSession(user: {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: string;
  tokenVersion: number;
}) {
  const token = await signSession({
    sub: user.id,
    orgId: user.organizationId,
    email: user.email,
    name: user.name,
    role: user.role,
    tv: user.tokenVersion
  });
  cookies().set({ ...sessionCookieOptions, value: token });
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function login(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password")
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  const email = parsed.data.email.toLowerCase();

  if (email === "demo@claimtive.com" && process.env.DEMO_ENABLED !== "true") {
    return { error: "Invalid email or password." };
  }

  const emailKey = `login:email:${email}`;
  const ipKey = `login:ip:${getClientIp()}`;

  const user = await prisma.user.findUnique({ where: { email } });

  // Lockout check BEFORE the CPU-heavy bcrypt compare — also blunts a hash DoS.
  if (
    checkRateLimit(emailKey, LOGIN_MAX, LOGIN_WINDOW_MS).limited ||
    checkRateLimit(ipKey, LOGIN_MAX, LOGIN_WINDOW_MS).limited
  ) {
    if (user) {
      await recordAudit({
        organizationId: user.organizationId,
        userId: user.id,
        userEmail: email,
        action: "auth.login_blocked"
      });
    }
    return {
      error: "Too many sign-in attempts. Please wait a few minutes and try again."
    };
  }

  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    registerFailure(emailKey, LOGIN_WINDOW_MS);
    registerFailure(ipKey, LOGIN_WINDOW_MS);
    if (user) {
      await recordAudit({
        organizationId: user.organizationId,
        userId: user.id,
        userEmail: email,
        action: "auth.login_failed"
      });
    }
    return { error: "Invalid email or password." };
  }

  // Password verified — clear the failure counters for this email + IP.
  clearRateLimit(emailKey);
  clearRateLimit(ipKey);

  // If MFA is on, hold off on the session — issue a short-lived challenge and
  // ask for the authenticator code.
  if (user.mfaEnabled) {
    const challenge = await signMfaChallenge(user.id);
    cookies().set({ ...mfaCookieOptions, value: challenge });
    return { mfaRequired: true };
  }

  await startSession(user);
  await recordAudit({
    organizationId: user.organizationId,
    userId: user.id,
    userEmail: user.email,
    action: "auth.login"
  });
  redirect("/dashboard");
}

export async function verifyMfaLogin(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const token = cookies().get(MFA_COOKIE)?.value;
  if (!token) {
    return { error: "Your sign-in timed out. Please enter your email and password again.", mfaExpired: true };
  }
  const userId = await verifyMfaChallenge(token);
  if (!userId) {
    cookies().delete(MFA_COOKIE);
    return { error: "Your sign-in timed out. Please enter your email and password again.", mfaExpired: true };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.mfaEnabled || !user.mfaSecret) {
    cookies().delete(MFA_COOKIE);
    return { error: "Two-factor isn't configured. Please sign in again.", mfaExpired: true };
  }

  // Throttle brute-forcing the 6-digit TOTP / backup codes.
  const mfaKey = `mfa:${user.id}`;
  if (checkRateLimit(mfaKey, MFA_MAX, MFA_WINDOW_MS).limited) {
    return {
      error: "Too many code attempts. Please wait a few minutes and try again.",
      mfaRequired: true
    };
  }

  const code = (formData.get("code") as string | null)?.trim() ?? "";
  if (!code) return { error: "Enter your 6-digit code.", mfaRequired: true };

  let ok = false;
  let usedBackup = false;
  const secret = decryptSecret(user.mfaSecret);
  if (/^\d{6}$/.test(code)) {
    ok = verifyMfaToken(code, secret);
  }
  if (!ok) {
    const bc = consumeBackupCode(code, user.mfaBackupCodes);
    if (bc.ok) {
      ok = true;
      usedBackup = true;
      await prisma.user.update({
        where: { id: user.id },
        data: { mfaBackupCodes: bc.remaining }
      });
    }
  }
  if (!ok) {
    registerFailure(mfaKey, MFA_WINDOW_MS);
    await recordAudit({
      organizationId: user.organizationId,
      userId: user.id,
      userEmail: user.email,
      action: "auth.mfa_failed"
    });
    return { error: "Invalid code. Try again, or use a backup code.", mfaRequired: true };
  }

  clearRateLimit(mfaKey);
  cookies().delete(MFA_COOKIE);
  await startSession(user);
  await recordAudit({
    organizationId: user.organizationId,
    userId: user.id,
    userEmail: user.email,
    action: "auth.login",
    detail: usedBackup ? "mfa (backup code)" : "mfa"
  });
  redirect("/dashboard");
}

const signupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  organization: z.string().min(1, "Organization is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters")
});

export async function signup(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const ipKey = `signup:ip:${getClientIp()}`;
  if (checkRateLimit(ipKey, SIGNUP_MAX, SIGNUP_WINDOW_MS).limited) {
    return {
      error: "Too many sign-up attempts from this location. Please try again in an hour."
    };
  }

  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    organization: formData.get("organization"),
    email: formData.get("email"),
    password: formData.get("password")
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // Count every attempt that passes validation — prevents mass account creation
  // and email enumeration via repeated signup calls from the same IP.
  registerFailure(ipKey, SIGNUP_WINDOW_MS);

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with that email already exists." };
  }

  let slug = slugify(parsed.data.organization) || "org";
  if (await prisma.organization.findUnique({ where: { slug } })) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name,
      role: "OWNER",
      passwordHash: await hashPassword(parsed.data.password),
      organization: {
        create: { name: parsed.data.organization, slug }
      }
    }
  });

  await startSession(user);
  redirect("/dashboard");
}

export async function logout() {
  // Bump tokenVersion so the just-issued JWT can't be replayed and any other
  // active sessions for this user are invalidated too ("sign out everywhere").
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    const payload = await verifySession(token);
    if (payload?.sub) {
      await prisma.user
        .update({
          where: { id: payload.sub },
          data: { tokenVersion: { increment: 1 } }
        })
        .catch(() => {
          /* logout proceeds regardless */
        });
    }
  }
  cookies().delete(SESSION_COOKIE);
  redirect("/login");
}
