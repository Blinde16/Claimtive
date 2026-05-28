"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import {
  confirmExtractedRates,
  extractFeeSchedulePdf,
  type ConfirmRatesState,
  type PdfExtractState
} from "@/app/actions/contracts";
import { SubmitButton } from "./SubmitButton";

const extractInitial: PdfExtractState = {};
const confirmInitial: ConfirmRatesState = {};

interface EditableRate {
  procedureCode: string;
  modifier: string;
  allowedAmount: string;
  description: string;
  include: boolean;
}

export function ContractPdfExtractor() {
  const [extractState, extractAction] = useFormState(
    extractFeeSchedulePdf,
    extractInitial
  );
  const [confirmState, confirmAction] = useFormState(
    confirmExtractedRates,
    confirmInitial
  );

  const [rows, setRows] = useState<EditableRate[]>([]);
  const [payer, setPayer] = useState("");
  const [contractName, setContractName] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const extractFormRef = useRef<HTMLFormElement>(null);

  // Seed the editable table whenever a fresh extraction comes back.
  useEffect(() => {
    if (!extractState.preview) return;
    setRows(
      extractState.preview.rates.map((r) => ({
        procedureCode: r.procedureCode,
        modifier: r.modifier ?? "",
        allowedAmount: String(r.allowedAmount),
        description: r.description ?? "",
        include: true
      }))
    );
    setPayer(extractState.preview.payerName ?? "");
    setEffectiveDate(extractState.preview.effectiveDate ?? "");
    setContractName("");
  }, [extractState.preview]);

  const updateRow = (i: number, patch: Partial<EditableRate>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  // Serialize the included, valid rows for the confirm action.
  const includedRows = rows.filter(
    (r) =>
      r.include &&
      r.procedureCode.trim() !== "" &&
      r.allowedAmount.trim() !== "" &&
      Number.isFinite(Number(r.allowedAmount))
  );
  const ratesPayload = JSON.stringify(
    includedRows.map((r) => ({
      procedureCode: r.procedureCode.trim().toUpperCase(),
      modifier: r.modifier.trim() || null,
      allowedAmount: Number(r.allowedAmount)
    }))
  );

  const reset = () => {
    setRows([]);
    setPayer("");
    setContractName("");
    setEffectiveDate("");
    extractFormRef.current?.reset();
  };

  const hasPreview = Boolean(extractState.preview);
  const saved = Boolean(confirmState.success);

  return (
    <div className="space-y-4">
      {/* Step 1: upload the PDF */}
      <form
        ref={extractFormRef}
        action={async (formData) => {
          await extractAction(formData);
        }}
        className="space-y-3"
      >
        <div>
          <label className="label" htmlFor="contract-pdf">
            Fee schedule (PDF)
          </label>
          <input
            id="contract-pdf"
            name="file"
            type="file"
            accept=".pdf,application/pdf"
            required
            className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700"
          />
          <p className="mt-1 text-xs text-slate-500">
            Upload a signed fee-schedule exhibit or scanned contract. Claimtive
            reads it and proposes rates for you to review — nothing is saved or
            applied to your claims until you confirm.
          </p>
        </div>

        {extractState.error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {extractState.error}
          </p>
        ) : null}

        <SubmitButton pendingLabel="Reading PDF…" className="btn-primary">
          Extract rates from PDF
        </SubmitButton>
      </form>

      {/* Step 2: review + confirm */}
      {hasPreview && !saved ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Review extracted rates
            </h3>
            <span className="text-xs text-slate-500">
              {includedRows.length} of {rows.length} selected ·{" "}
              {extractState.preview?.fileName}
            </span>
          </div>

          {extractState.preview?.notes ? (
            <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
              <span className="font-semibold">Note from extraction:</span>{" "}
              {extractState.preview.notes}
            </p>
          ) : null}

          {extractState.preview && extractState.preview.warnings.length > 0 ? (
            <ul className="mb-3 list-inside list-disc rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {extractState.preview.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}

          <p className="mb-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-amber-700">
            AI-extracted from a document — verify each rate against your contract
            before saving. You are confirming these as the source of truth for
            underpayment detection.
          </p>

          {rows.length > 0 ? (
            <div className="max-h-80 overflow-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2 font-medium">Use</th>
                    <th className="px-2 py-2 font-medium">Code</th>
                    <th className="px-2 py-2 font-medium">Mod</th>
                    <th className="px-2 py-2 text-right font-medium">Allowed $</th>
                    <th className="px-2 py-2 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={i}
                      className={`border-t border-slate-100 ${r.include ? "" : "opacity-40"}`}
                    >
                      <td className="px-2 py-1">
                        <input
                          type="checkbox"
                          checked={r.include}
                          onChange={(e) => updateRow(i, { include: e.target.checked })}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          value={r.procedureCode}
                          onChange={(e) => updateRow(i, { procedureCode: e.target.value })}
                          className="w-20 rounded border border-slate-200 px-1.5 py-1 font-mono text-xs"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          value={r.modifier}
                          onChange={(e) => updateRow(i, { modifier: e.target.value })}
                          className="w-14 rounded border border-slate-200 px-1.5 py-1 font-mono text-xs"
                        />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <input
                          value={r.allowedAmount}
                          onChange={(e) => updateRow(i, { allowedAmount: e.target.value })}
                          inputMode="decimal"
                          className="w-24 rounded border border-slate-200 px-1.5 py-1 text-right tabular-nums"
                        />
                      </td>
                      <td className="px-2 py-1 text-xs text-slate-500">
                        {r.description || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-lg bg-white px-3 py-4 text-center text-sm text-slate-500">
              No rates were extracted. Try the CSV importer, or check that the PDF
              contains a dollar-based fee schedule.
            </p>
          )}

          {includedRows.length > 0 ? (
            <form
              action={async (formData) => {
                await confirmAction(formData);
              }}
              className="mt-4 space-y-3"
            >
              <input type="hidden" name="rates" value={ratesPayload} />
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="label" htmlFor="confirm-payer">
                    Payer <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="confirm-payer"
                    name="payer"
                    value={payer}
                    onChange={(e) => setPayer(e.target.value)}
                    required
                    placeholder="e.g. AETNA"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="confirm-contract">
                    Contract name
                  </label>
                  <input
                    id="confirm-contract"
                    name="contractName"
                    value={contractName}
                    onChange={(e) => setContractName(e.target.value)}
                    placeholder="e.g. Aetna Commercial 2026"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="confirm-effective">
                    Effective date
                  </label>
                  <input
                    id="confirm-effective"
                    name="effectiveDate"
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    className="input w-full"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Match the payer name exactly as it appears on remittances, so the
                rates apply to the right claims.
              </p>

              {confirmState.error ? (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {confirmState.error}
                </p>
              ) : null}

              <div className="flex gap-2">
                <SubmitButton pendingLabel="Saving…" className="btn-primary">
                  Confirm &amp; save {includedRows.length} rate(s)
                </SubmitButton>
                <button type="button" onClick={reset} className="btn-secondary">
                  Discard
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}

      {saved ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-800">
            {confirmState.success}
          </p>
          <button type="button" onClick={reset} className="btn-secondary mt-3">
            Extract another PDF
          </button>
        </div>
      ) : null}
    </div>
  );
}
