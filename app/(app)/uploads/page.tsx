import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { UploadForm } from "@/components/UploadForm";

export const metadata = { title: "Uploads" };

export default async function UploadsPage() {
  const user = (await getCurrentUser())!;
  const files = await prisma.ediFile.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Uploads</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-6 lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">
            Upload EDI file
          </h2>
          <UploadForm />
        </section>

        <section className="card overflow-hidden lg:col-span-2">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Processed files
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-3 font-medium">File</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 text-right font-medium">Claims</th>
                  <th className="px-4 py-3 text-right font-medium">Denied</th>
                  <th className="px-4 py-3 text-right font-medium">Underpaid</th>
                  <th className="px-6 py-3 font-medium">Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {files.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                      No files yet. Upload an 835 or 837 to get started.
                    </td>
                  </tr>
                ) : (
                  files.map((f) => (
                    <tr key={f.id} className="border-b border-slate-100">
                      <td className="px-6 py-3 font-medium text-slate-800">
                        {f.fileName}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          {f.type === "X835" ? "835 Remit" : "837 Claim"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {f.claimCount}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-rose-600">
                        {formatCurrency(Number(f.totalDenied))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-amber-600">
                        {formatCurrency(Number(f.totalUnderpaid))}
                      </td>
                      <td className="px-6 py-3 text-slate-500">
                        {formatDate(f.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
