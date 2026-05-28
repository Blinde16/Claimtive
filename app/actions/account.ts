"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export interface AccountState {
  error?: string;
  success?: string;
}

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password")
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "New passwords do not match",
    path: ["confirmPassword"]
  });

export async function changePassword(
  _prev: AccountState,
  formData: FormData
): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You must be signed in." };

  const parsed = schema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword")
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true }
  });
  if (!record) return { error: "Account not found." };

  const ok = await verifyPassword(parsed.data.currentPassword, record.passwordHash);
  if (!ok) return { error: "Current password is incorrect." };

  if (parsed.data.newPassword === parsed.data.currentPassword) {
    return { error: "New password must be different from the current one." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) }
  });

  return { success: "Password updated." };
}
