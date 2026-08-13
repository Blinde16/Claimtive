"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { isResolutionOutcome, isWorkStatus } from "@/lib/worklist";
import { recordAudit } from "@/lib/audit";

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
  // Note: intentionally NOT behind denyDemoWrite (lib/demo.ts). Working the
  // list is the demo, the writes are confined to the demo org's own synthetic
  // claims, and re-seeding resets them.

  const claimId = (formData.get("claimId") as string | null)?.trim();
  const workStatus = (formData.get("workStatus") as string | null)?.trim();
  const workNoteRaw = (formData.get("workNote") as string | null) ?? "";
  const assignedToRaw = (formData.get("assignedToId") as string | null)?.trim() ?? "";
  const recoveredRaw = (formData.get("recoveredAmount") as string | null) ?? "";
  const resolutionRaw =
    (formData.get("resolutionOutcome") as string | null)?.trim() ?? "";

  if (!claimId) return { error: "Missing claim." };
  if (!workStatus || !isWorkStatus(workStatus)) {
    return { error: "Invalid status." };
  }

  // Parse the recovered amount tolerantly: strip "$" and thousands separators,
  // default to 0 when blank, and reject anything that isn't a non-negative number.
  const recoveredCleaned = recoveredRaw.replace(/[$,\s]/g, "");
  const recoveredAmount = recoveredCleaned === "" ? 0 : Number(recoveredCleaned);
  if (!Number.isFinite(recoveredAmount) || recoveredAmount < 0) {
    return { error: "Recovered amount must be a number of $0 or more." };
  }

  // Resolution outcome is optional; when present it must be one of the known values.
  let resolutionOutcome: string | null = null;
  if (resolutionRaw) {
    if (!isResolutionOutcome(resolutionRaw)) {
      return { error: "Invalid resolution outcome." };
    }
    resolutionOutcome = resolutionRaw;
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
      recoveredAmount,
      resolutionOutcome,
      workUpdatedAt: new Date()
    }
  });

  await recordAudit({
    organizationId: user.organizationId,
    userId: user.id,
    userEmail: user.email,
    action: "claim.work.update",
    targetType: "claim",
    targetId: claimId,
    detail: `status=${workStatus} recovered=${recoveredAmount}`
  });

  revalidatePath(`/claims/${claimId}`);
  revalidatePath("/claims");
  return { success: "Worklist updated." };
}
