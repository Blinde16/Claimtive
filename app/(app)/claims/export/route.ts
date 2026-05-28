import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { buildClaimWhere } from "@/lib/claimsFilter";
import { workStatusLabel } from "@/lib/worklist";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  // Quote if it contains a comma, quote, or newline; double internal quotes.
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function isoDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

function money(d: unknown): string {
  return Number(d ?? 0).toFixed(2);
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(request.url);
  const where = buildClaimWhere(user.organizationId, {
    filter: searchParams.get("filter") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined
  });

  const claims = await prisma.claim.findMany({
    where,
    include: {
      ediFile: { select: { type: true, fileName: true } },
      assignedTo: { select: { name: true } }
    },
    orderBy: [
      { deniedAmount: "desc" },
      { underpaidAmount: "desc" },
      { createdAt: "desc" }
    ],
    take: 10000
  });

  await recordAudit({
    organizationId: user.organizationId,
    userId: user.id,
    userEmail: user.email,
    action: "claims.export",
    detail: `${claims.length} claims exported to CSV`
  });

  const header = [
    "Claim ID",
    "Patient",
    "Payer",
    "Service date",
    "Paid date",
    "Outcome",
    "Work status",
    "Assigned to",
    "Billed",
    "Paid",
    "Denied",
    "Underpaid",
    "Primary CARC",
    "Primary reason",
    "Note",
    "Source file"
  ];

  const outcome = (c: (typeof claims)[number]): string => {
    if (c.ediFile.type === "X837") return "Submitted";
    if (c.isDenied) return "Denied";
    if (c.isUnderpaid) return "Underpaid";
    return "Clean";
  };

  const lines = [header.map(csvCell).join(",")];
  for (const c of claims) {
    lines.push(
      [
        c.patientControlNumber ?? c.id,
        c.patientName ?? "",
        c.payerName ?? "",
        isoDate(c.serviceDate),
        isoDate(c.paidDate),
        outcome(c),
        workStatusLabel(c.workStatus),
        c.assignedTo?.name ?? "",
        money(c.totalCharge),
        money(c.totalPaid),
        money(c.deniedAmount),
        money(c.underpaidAmount),
        c.primaryDenialCode ?? "",
        c.primaryDenialReason ?? "",
        c.workNote ?? "",
        c.ediFile.fileName
      ]
        .map(csvCell)
        .join(",")
    );
  }

  const csv = lines.join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="claimtive-claims-${stamp}.csv"`
    }
  });
}
