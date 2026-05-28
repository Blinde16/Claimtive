"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { ingestEdiFile } from "@/lib/ingest";
import { recordAudit } from "@/lib/audit";

export interface OnboardingState {
  error?: string;
  success?: string;
}

// A small, self-contained sample 835 remittance embedded in code so it is
// always available at runtime (not dependent on untraced files in the image).
// Synthetic data only — no real PHI.
const SAMPLE_835 = `ISA*00*          *00*          *ZZ*BCBSPAYER      *ZZ*PROVIDER123    *240115*1200*^*00501*000000001*0*P*:~
GS*HP*BCBSPAYER*PROVIDER123*20240115*1200*1*X*005010X221A1~
ST*835*0001~
BPR*I*4200.00*C*ACH*CCP*01*999999999*DA*123456789*1512345678**01*999988880*DA*98765*20240115~
TRN*1*CHKEFT0001*1512345678~
DTM*405*20240115~
N1*PR*BLUE CROSS BLUE SHIELD*PI*BCBS001~
N3*PO BOX 1000~
N4*CHICAGO*IL*60601~
N1*PE*MOUNTAIN VIEW SURGICAL*XX*1234567893~
LX*1~
CLP*PCN1001*1*1500.00*1200.00*150.00*12*PAYERCLM5001*11~
NM1*QC*1*DOE*JOHN****MI*987654321~
NM1*82*1*SMITH*ANNA****XX*1234567893~
DTM*232*20240102~
SVC*HC:99214*250.00*200.00**1~
DTM*472*20240102~
CAS*CO*45*25.00~
CAS*PR*1*25.00~
AMT*B6*225.00~
SVC*HC:29881*1250.00*1000.00**1~
DTM*472*20240102~
CAS*CO*45*125.00~
CAS*PR*1*125.00~
CLP*PCN1002*4*800.00*0.00*0.00*12*PAYERCLM5002*11~
NM1*QC*1*ROE*JANE****MI*876543210~
NM1*82*1*SMITH*ANNA****XX*1234567893~
DTM*232*20240105~
SVC*HC:64483*800.00*0.00**1~
DTM*472*20240105~
CAS*CO*197*800.00~
LQ*HE*N130~
CLP*PCN1003*1*600.00*300.00*0.00*12*PAYERCLM5003*11~
NM1*QC*1*POE*RICHARD****MI*765432109~
NM1*82*1*SMITH*ANNA****XX*1234567893~
DTM*232*20240108~
SVC*HC:99213*200.00*120.00**1~
DTM*472*20240108~
CAS*CO*45*80.00~
SVC*HC:20610*400.00*180.00**1~
DTM*472*20240108~
CAS*CO*45*100.00~
CAS*CO*97*120.00~
LQ*HE*N115~
SE*44*0001~
GE*1*1~
IEA*1*000000001~`;

/**
 * One-click onboarding: ingest a synthetic sample remittance so a brand-new
 * workspace immediately has a populated dashboard to explore. Guarded to empty
 * workspaces so it can never mix sample data into a clinic's real data.
 */
export async function loadSampleData(
  _prev: OnboardingState,
  _formData: FormData
): Promise<OnboardingState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You must be signed in." };

  const existing = await prisma.claim.count({
    where: { organizationId: user.organizationId }
  });
  if (existing > 0) {
    return {
      error:
        "Your workspace already has claims. Sample data can only be loaded into an empty workspace."
    };
  }

  try {
    const result = await ingestEdiFile({
      organizationId: user.organizationId,
      uploadedById: user.id,
      fileName: "sample-remittance.835.edi",
      content: SAMPLE_835
    });
    await recordAudit({
      organizationId: user.organizationId,
      userId: user.id,
      userEmail: user.email,
      action: "onboarding.sample_loaded",
      detail: `${result.claimCount} sample claims`
    });
    revalidatePath("/dashboard");
    revalidatePath("/claims");
    revalidatePath("/uploads");
    return {
      success: `Loaded ${result.claimCount} sample claims. Explore your dashboard!`
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to load sample data."
    };
  }
}
