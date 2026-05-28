import { headers } from "next/headers";
import { prisma } from "./db";

export interface AuditInput {
  organizationId: string;
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: string;
}

/**
 * Write a HIPAA access/activity log row. Best-effort: a logging failure must
 * never break the underlying request, so all errors are swallowed (and logged
 * to stderr). Callers must pass NO PHI — only IDs and action metadata.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  let ipAddress: string | null = null;
  try {
    const fwd = headers().get("x-forwarded-for");
    ipAddress = fwd ? fwd.split(",")[0]!.trim() : null;
  } catch {
    // headers() is unavailable outside a request scope — fine, leave null.
  }

  try {
    await prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId ?? null,
        userEmail: input.userEmail ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        detail: input.detail ?? null,
        ipAddress
      }
    });
  } catch (err) {
    console.error("[audit] failed to record", input.action, err);
  }
}
