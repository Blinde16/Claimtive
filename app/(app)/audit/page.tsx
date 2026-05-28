import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

export const metadata = { title: "Audit log" };

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Signed in",
  "claim.view": "Viewed claim",
  "file.upload": "Uploaded file",
  "claims.export": "Exported claims (CSV)",
  "claim.work.update": "Updated worklist",
  "contract.upload": "Uploaded fee schedule",
  "member.add": "Added member",
  "member.remove": "Removed member",
  "member.password_reset": "Reset member password",
  "password.change": "Changed password"
};

function actionLabel(a: string): string {
  return ACTION_LABELS[a] ?? a;
}

function fmt(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export default async function AuditPage() {
  const user = (await getCurrentUser())!;

  if (user.role !== "OWNER") {
    return (
      <div className="card p-10 text-center text-slate-500">
        The audit log is available to organization owners only.
      </div>
    );
  }

  const logs = await prisma.auditLog.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
    take: 200
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Audit log</h1>
        <p className="mt-1 text-sm text-slate-500">
          HIPAA access &amp; activity trail — who signed in, viewed or exported
          claims, uploaded files, and changed access. Most recent 200 events.
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Detail</th>
                <th className="px-4 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No activity recorded yet.
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100">
                    <td className="px-4 py-2 whitespace-nowrap font-mono text-xs text-slate-500">
                      {fmt(l.createdAt)}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {l.userEmail ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-800">{actionLabel(l.action)}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">
                      {l.targetType ? `${l.targetType}:${l.targetId ?? ""}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-500">{l.detail ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-400">
                      {l.ipAddress ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
