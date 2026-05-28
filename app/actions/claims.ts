"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { isWorkStatus } from "@/lib/worklist";

export interface ClaimWorkState {
  error?: string;
  success?: string;
}

export async function updateClaimWork(
  _prev: ClaimWorkState,
  formData: FormData
): Promise<ClaimWorkState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You must be signed in." };

  const claimId = (formData.get("claimId") as string | null)?.trim();
  const workStatus = (formData.get("workStatus") as string | null)?.trim();
  const workNoteRaw = (formData.get("workNote") as string | null) ?? "";
  const assignedToRaw = (formData.get("assignedToId") as string | null)?.trim() ?? "";

  if (!claimId) return { error: "Missing claim." };
  if (!workStatus || !isWorkStatus(workStatus)) {
    return { error: "Invalid status." };
  }

  // Scope the claim to the caller's org.
  const claim = await prisma.claim.findFirst({
    where: { id: claimId, organizationId: user.organizationId },
    select: { id: true }
  });
  if (!claim) return { error: "Claim not found." };

  // Validate the assignee (if any) belongs to the same org.
  let assignedToId: string | null = null;
  if (assignedToRaw) {
    const assignee = await prisma.user.findFirst({
      where: { id: assignedToRaw, organizationId: user.organizationId },
      select: { id: true }
    });
    if (!assignee) return { error: "Assignee not in your organization." };
    assignedToId = assignee.id;
  }

  const workNote = workNoteRaw.trim().slice(0, 2000) || null;

  await prisma.claim.update({
    where: { id: claimId },
    data: {
      workStatus,
      workNote,
      assignedToId,
      workUpdatedAt: new Date()
    }
  });

  revalidatePath(`/claims/${claimId}`);
  revalidatePath("/claims");
  return { success: "Worklist updated." };
}
