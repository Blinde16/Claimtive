"use client";

import { useRef } from "react";
import { useFormState } from "react-dom";
import {
  uploadFeeSchedule,
  type ContractUploadState
} from "@/app/actions/contracts";
import { SubmitButton } from "./SubmitButton";

const initial: ContractUploadState = {};

const TEMPLATE = `payer,procedure_code,modifier,allowed_amount
AETNA,99213,,130.00
AETNA,29881,,1100.00
BLUE CROSS BLUE SHIELD,99214,25,210.00
`;

const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`;

export function ContractUploadForm() {
  const [state, formAction] = useFormState(uploadFeeSchedule, initial);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
      }}
      className="space-y-4"
    >
      <div>
        <label className="label" htmlFor="contract-file">
          Fee schedule (CSV)
        </label>
        <input
          id="contract-file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700"
        />
        <p className="mt-1 text-xs text-slate-500">
          Columns: <span className="font-mono">procedure_code</span>,{" "}
          <span className="font-mono">modifier</span> (optional),{" "}
          <span className="font-mono">allowed_amount</span>, and optionally{" "}
          <span className="font-mono">payer</span>.{" "}
          <a href={templateHref} download="claimtive-fee-schedule-template.csv" className="font-semibold text-brand-600">
            Download template
          </a>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="payer">
            Payer (if no payer column)
          </label>
          <input
            id="payer"
            name="payer"
            type="text"
            placeholder="e.g. AETNA"
            className="input w-full"
          />
          <p className="mt-1 text-xs text-slate-500">
            Match the payer name exactly as it appears on remittances.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="contractName">
            Contract name (optional)
          </label>
          <input
            id="contractName"
            name="contractName"
            type="text"
            placeholder="e.g. Aetna Commercial 2026"
            className="input w-full"
          />
        </div>
      </div>

      {state.error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.success}
        </p>
      ) : null}

      {state.summary && state.summary.rowErrors.length > 0 ? (
        <details className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <summary className="cursor-pointer font-medium">
            {state.summary.skippedRows} row(s) skipped — view details
          </summary>
          <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs">
            {state.summary.rowErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <SubmitButton pendingLabel="Importing…" className="btn-primary">
        Import rates
      </SubmitButton>
    </form>
  );
}
