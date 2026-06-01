"use server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { generateAppealDraft, type AppealClaimInput } from "@/lib/ai/appeal";
import { AiDisabledError } from "@/lib/ai/vertex";
import { recordAudit } from "@/lib/audit";

export interface AppealState {
  error?: string;
  draft?: string;
}

export async function draftAppeal(
  _prev: AppealState,
  formData: FormData
): Promise<AppealState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You must be signed in." };

  const claimId = (formData.get("claimId") as string | null)?.trim();
  if (!claimId) return { error: "Missing claim." };

  const claim = await prisma.claim.findFirst({
    where: { id: claimId, organizationId: user.organizationId },
    select: {
      payerName: true,
      primaryDenialCode: true,
      primaryDenialReason: true,
      isDenied: true,
      isUnderpaid: true,
      deniedAmount: true,
      underpaidAmount: true,
      // Deliberately NOT selecting patientName / serviceDate / member info —
      // those never go to the model; they become placeholders in the letter.
      serviceLines: {
        select: {
          procedureCode: true,
          modifier: true,
          chargeAmount: true,
          paidAmount: true,
          contractedRate: true,
          denialReason: true
        },
        orderBy: { createdAt: "asc" }
      }
    }
  });
  if (!claim) return { error: "Claim not found." };

  if (!claim.isDenied && !claim.isUnderpaid) {
    return {
      error: "This claim isn't denied or underpaid, so there's nothing to appeal."
    };
  }

  const input: AppealClaimInput = {
    payerName: claim.payerName,
    primaryDenialCode: claim.primaryDenialCode,
    primaryDenialReason: claim.primaryDenialReason,
    isDenied: claim.isDenied,
    isUnderpaid: claim.isUnderpaid,
    deniedAmount: Number(claim.deniedAmount),
    underpaidAmount: Number(claim.underpaidAmount),
    services: claim.serviceLines.map((s) => ({
      procedureCode: s.procedureCode,
      modifier: s.modifier,
      chargeAmount: Number(s.chargeAmount),
      paidAmount: Number(s.paidAmount),
      contractedRate: s.contractedRate == null ? null : Number(s.contractedRate),
      denialReason: s.denialReason
    }))
  };

  let draft: string;
  try {
    draft = await generateAppealDraft(input);
  } catch (err) {
    if (err instanceof AiDisabledError) {
      return { error: "AI drafting isn't enabled on this environment." };
    }
    console.error("draftAppeal failed:", err);
    return { error: "Couldn't draft the appeal. Please try again." };
  }

  await recordAudit({
    organizationId: user.organizationId,
    userId: user.id,
    userEmail: user.email,
    action: "claim.appeal_draft",
    targetType: "claim",
    targetId: claimId
  });

  return { draft };
}
