import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { isAiEnabled } from "@/lib/ai/vertex";
import { formatCurrencyPrecise } from "@/lib/format";
import { ContractUploadForm } from "@/components/ContractUploadForm";
import { ContractPdfExtractor } from "@/components/ContractPdfExtractor";

export const metadata = { title: "Contracts" };

export default async function ContractsPage() {
  const user = (await getCurrentUser())!;
  const aiEnabled = isAiEnabled();
  const payers = await prisma.payer.findMany({
    where: { organizationId: user.organizationId },
    include: {
      contracts: {
        include: {
          rates: { orderBy: { procedureCode: "asc" } }
        }
      }
    },
    orderBy: { name: "asc" }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          Payer contracts &amp; rates
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Contracted allowed amounts per procedure code. These power underpayment
          detection — paid amounts below these rates are flagged automatically.
        </p>
      </div>

      <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-700">
        Load your contracted rates <strong>before</strong> uploading remittances
        — underpayments are detected at import time, so rates must exist first.
      </div>

      <section className="card p-6">
        <h2 className="text-sm font-semibold text-slate-900">
          Upload a fee schedule
        </h2>
        <p className="mb-4 mt-1 text-xs text-slate-500">
          Add one fee schedule per payer. Rates are applied to remittances
          imported after they&apos;re loaded.
        </p>
        <ContractUploadForm />
      </section>

      {aiEnabled ? (
        <section className="card p-6">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              Extract rates from a contract PDF
            </h2>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
              AI-assisted
            </span>
          </div>
          <p className="mb-4 mt-1 text-xs text-slate-500">
            No clean spreadsheet? Upload the contract PDF and Claimtive will read
            the fee schedule and propose rates. You review and confirm every rate
            before it powers underpayment detection.
          </p>
          <ContractPdfExtractor />
        </section>
      ) : null}

      {payers.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">
          No payers yet. They are created automatically when you upload EDI files.
        </div>
      ) : (
        payers.map((payer) => (
          <div key={payer.id} className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  {payer.name}
                </h2>
                {payer.externalId ? (
                  <p className="text-xs text-slate-500">
                    Payer ID: {payer.externalId}
                  </p>
                ) : null}
              </div>
            </div>

            {payer.contracts.length === 0 ? (
              <p className="px-6 py-4 text-sm text-slate-500">
                No contract loaded for this payer.
              </p>
            ) : (
              payer.contracts.map((contract) => (
                <div key={contract.id} className="px-6 py-4">
                  <p className="mb-3 text-sm font-medium text-slate-700">
                    {contract.name}
                    <span className="ml-2 text-xs text-slate-400">
                      {contract.rates.length} rates
                    </span>
                  </p>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
                    {contract.rates.map((rate) => (
                      <div
                        key={rate.id}
                        className="flex items-center justify-between border-b border-slate-100 py-1 text-sm"
                      >
                        <span className="font-mono text-slate-700">
                          {rate.procedureCode}
                          {rate.modifier ? `-${rate.modifier}` : ""}
                        </span>
                        <span className="tabular-nums text-slate-900">
                          {formatCurrencyPrecise(Number(rate.allowedAmount))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        ))
      )}
    </div>
  );
}
