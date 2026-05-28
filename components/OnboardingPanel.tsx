"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { loadSampleData, type OnboardingState } from "@/app/actions/onboarding";
import { SubmitButton } from "./SubmitButton";

const initial: OnboardingState = {};

export function OnboardingPanel() {
  const [state, formAction] = useFormState(loadSampleData, initial);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="card p-8 text-center">
        <h1 className="text-xl font-semibold text-slate-900">
          Welcome to Claimtive
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          Claimtive reads your insurer remittances and surfaces the denials and
          underpayments worth recovering. The fastest way to see how it works:
        </p>
        <form action={formAction} className="mt-6">
          <SubmitButton pendingLabel="Loading sample…" className="btn-primary">
            Load sample data &amp; explore the dashboard
          </SubmitButton>
        </form>
        {state.error ? (
          <p className="mt-3 text-sm text-rose-700">{state.error}</p>
        ) : null}
        {state.success ? (
          <p className="mt-3 text-sm text-emerald-700">{state.success}</p>
        ) : null}
        <p className="mt-2 text-xs text-slate-400">
          Synthetic sample data — loads into your empty workspace so you can
          explore safely.
        </p>
      </div>

      <div className="card p-6">
        <h2 className="text-sm font-semibold text-slate-900">
          Or set up with your own data
        </h2>
        <ol className="mt-3 space-y-3 text-sm text-slate-600">
          <li className="flex gap-3">
            <span className="font-semibold text-brand-600">1.</span>
            <span>
              <Link href="/contracts" className="font-semibold text-brand-600">
                Load your payer contracts
              </Link>{" "}
              — upload a fee-schedule CSV so underpayments can be detected.
              (Do this before remittances.)
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-brand-600">2.</span>
            <span>
              <Link href="/uploads" className="font-semibold text-brand-600">
                Upload a remittance (835)
              </Link>{" "}
              — denials are detected immediately; underpayments use your rates.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-brand-600">3.</span>
            <span>
              <Link href="/team" className="font-semibold text-brand-600">
                Invite your billing team
              </Link>{" "}
              so they can work the flagged claims.
            </span>
          </li>
        </ol>
      </div>
    </div>
  );
}
