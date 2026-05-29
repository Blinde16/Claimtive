"use client";

import Link from "next/link";
import { useRef } from "react";
import { useFormState } from "react-dom";
import { uploadEdi, type UploadState } from "@/app/actions/uploads";
import { SubmitButton } from "./SubmitButton";

const initial: UploadState = {};

export function UploadForm() {
  const [state, formAction] = useFormState(uploadEdi, initial);
  const formRef = useRef<HTMLFormElement>(null);

  // The success message says "remittance" for an 835 and "claim" for an 837.
  // Remittances are where underpayment detection applies, so nudge the user
  // toward loading contracted rates if they haven't already.
  const processedRemittance = /\bremittance\b/.test(state.success ?? "");

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="space-y-4"
    >
      <div>
        <label className="label" htmlFor="file">
          EDI file (X12 835 remittance or 837 claim)
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".edi,.txt,.835,.837,.x12,.dat"
          required
          className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700"
        />
        <p className="mt-1 text-xs text-slate-500">
          Up to 10 MB. The transaction type is detected automatically.
        </p>
      </div>

      {state.error ? (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <p className="font-semibold">We couldn&apos;t process that file.</p>
          <p className="mt-0.5">{state.error}</p>
          <p className="mt-1 text-xs text-rose-600">
            Check that it&apos;s an X12 835 or 837 file under 10 MB, then try
            again.
          </p>
        </div>
      ) : null}
      {state.success ? (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <p>{state.success}</p>
          {processedRemittance ? (
            <p className="mt-1 text-xs text-emerald-700">
              Tip: load your contracted rates on the{" "}
              <Link href="/contracts" className="font-semibold underline">
                Contracts page
              </Link>{" "}
              to also surface underpayments.
            </p>
          ) : null}
        </div>
      ) : null}

      <SubmitButton pendingLabel="Processing…" className="btn-primary">
        Upload &amp; process
      </SubmitButton>
    </form>
  );
}
