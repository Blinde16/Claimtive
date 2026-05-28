"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { signSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";

export interface AuthState {
  error?: string;
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
}) {
  const token = await signSession({
    sub: user.id,
    orgId: user.organizationId,
    email: user.email,
    name: user.name,
    role: user.role
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

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() }
  });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: "Invalid email or password." };
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
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    organization: formData.get("organization"),
    email: formData.get("email"),
    password: formData.get("password")
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

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
  cookies().delete(SESSION_COOKIE);
  redirect("/login");
}
