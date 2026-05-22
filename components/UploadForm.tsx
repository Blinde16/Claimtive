"use client";

import { useRef } from "react";
import { useFormState } from "react-dom";
import { uploadEdi, type UploadState } from "@/app/actions/uploads";
import { SubmitButton } from "./SubmitButton";

const initial: UploadState = {};

export function UploadForm() {
  const [state, formAction] = useFormState(uploadEdi, initial);
  const formRef = useRef<HTMLFormElement>(null);

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
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.success}
        </p>
      ) : null}

      <SubmitButton pendingLabel="Processing…" className="btn-primary">
        Upload &amp; process
      </SubmitButton>
    </form>
  );
}
