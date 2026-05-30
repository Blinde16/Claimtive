"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { recordAudit } from "@/lib/audit";

export interface TeamState {
  error?: string;
  success?: string;
  /** Shown ONCE after creating a member, for the owner to relay securely. */
  tempPassword?: string;
}

const addSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  email: z.string().email("Enter a valid email"),
  role: z.enum(["OWNER", "MEMBER"])
});

/** A readable temporary password the owner relays; the member changes it after first login. */
function generateTempPassword(): string {
  // ~14 chars, url-safe, no ambiguous punctuation.
  return randomBytes(12).toString("base64").replace(/[+/=]/g, "").slice(0, 14);
}

export async function addTeamMember(
  _prev: TeamState,
  formData: FormData
): Promise<TeamState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You must be signed in." };
  if (user.role !== "OWNER") {
    return { error: "Only an owner can add team members." };
  }

  const parsed = addSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role")
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "A user with that email already exists." };
  }

  const tempPassword = generateTempPassword();
  const created = await prisma.user.create({
    data: {
      organizationId: user.organizationId,
      email,
      name: parsed.data.name,
      role: parsed.data.role,
      passwordHash: await hashPassword(tempPassword)
    }
  });

  await recordAudit({
    organizationId: user.organizationId,
    userId: user.id,
    userEmail: user.email,
    action: "member.add",
    targetType: "user",
    targetId: created.id,
    detail: `${email} as ${parsed.data.role}`
  });

  revalidatePath("/team");
  return {
    success: `Added ${parsed.data.name}. Share the temporary password securely — they can change it after signing in.`,
    tempPassword
  };
}

export async function removeTeamMember(
  _prev: TeamState,
  formData: FormData
): Promise<TeamState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You must be signed in." };
  if (user.role !== "OWNER") {
    return { error: "Only an owner can remove team members." };
  }

  const targetId = (formData.get("userId") as string | null)?.trim();
  if (!targetId) return { error: "Missing user." };
  if (targetId === user.id) {
    return { error: "You can't remove yourself." };
  }

  const target = await prisma.user.findFirst({
    where: { id: targetId, organizationId: user.organizationId },
    select: { id: true, role: true, name: true }
  });
  if (!target) return { error: "User not found in your organization." };

  // Never leave the org without an owner.
  if (target.role === "OWNER") {
    const ownerCount = await prisma.user.count({
      where: { organizationId: user.organizationId, role: "OWNER" }
    });
    if (ownerCount <= 1) {
      return { error: "Can't remove the last owner of the organization." };
    }
  }

  // FK relations (assignedClaims, uploadedFiles) are SetNull, so this is safe.
  await prisma.user.delete({ where: { id: target.id } });

  await recordAudit({
    organizationId: user.organizationId,
    userId: user.id,
    userEmail: user.email,
    action: "member.remove",
    targetType: "user",
    targetId: target.id,
    detail: target.name
  });

  revalidatePath("/team");
  return { success: `Removed ${target.name}.` };
}

export async function resetMemberPassword(
  _prev: TeamState,
  formData: FormData
): Promise<TeamState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You must be signed in." };
  if (user.role !== "OWNER") {
    return { error: "Only an owner can reset passwords." };
  }

  const targetId = (formData.get("userId") as string | null)?.trim();
  if (!targetId) return { error: "Missing user." };

  const target = await prisma.user.findFirst({
    where: { id: targetId, organizationId: user.organizationId },
    select: { id: true, name: true }
  });
  if (!target) return { error: "User not found in your organization." };

  const tempPassword = generateTempPassword();
  await prisma.user.update({
    where: { id: target.id },
    // Bump tokenVersion so any active sessions the member had are revoked — a
    // reset must lock out whoever held the old credentials.
    data: {
      passwordHash: await hashPassword(tempPassword),
      tokenVersion: { increment: 1 }
    }
  });

  await recordAudit({
    organizationId: user.organizationId,
    userId: user.id,
    userEmail: user.email,
    action: "member.password_reset",
    targetType: "user",
    targetId: target.id,
    detail: target.name
  });

  revalidatePath("/team");
  return {
    success: `Reset ${target.name}'s password. Share the temporary password securely.`,
    tempPassword
  };
}
