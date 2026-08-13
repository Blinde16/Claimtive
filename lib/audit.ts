import { headers } from "next/headers";
import { resolveClientIp } from "./client-ip";
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
    // Must be the last hop we can trust, not the first entry in the header:
    // an attacker controls the left end of x-forwarded-for, so the old
    // first-entry read let anyone stamp a forged source address into the HIPAA
    // access log. See lib/client-ip.ts.
    ipAddress = resolveClientIp(headers());
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
