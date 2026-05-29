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
      <div className="text-center">
        <h1 className="text-xl font-semibold text-slate-900">
          Welcome to Claimtive
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          Claimtive reads your insurer remittances and surfaces the denials and
          underpayments worth recovering. Pick the track that fits you.
        </p>
      </div>

      {/* Track 1 — Just exploring */}
      <div className="card p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
              Just exploring?
            </p>
            <h2 className="text-sm font-semibold text-slate-900">
              Load sample data and see the dashboard
            </h2>
          </div>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          One click loads a synthetic remittance with rates already in place, so
          you can see denials <strong>and</strong> underpayments straight away.
        </p>
        <form action={formAction} className="mt-4">
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

      {/* Track 2 — Ready with real data */}
      <div className="card p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
          Ready with real data?
        </p>
        <h2 className="text-sm font-semibold text-slate-900">
          Set up in three steps
        </h2>
        <ol className="mt-4 space-y-4 text-sm text-slate-600">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
              1
            </span>
            <span>
              <Link href="/contracts" className="font-semibold text-brand-600">
                Upload your contracted rates (Contracts)
              </Link>{" "}
              first, so we can catch underpayments. Underpayments are only
              detected when rates already exist.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
              2
            </span>
            <span>
              <Link href="/uploads" className="font-semibold text-brand-600">
                Upload your 835 remittance files (Uploads)
              </Link>
              . Denials are detected immediately; underpayments use the rates
              from step 1.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
              3
            </span>
            <span>
              Review your dashboard to work the flagged claims, then{" "}
              <Link href="/team" className="font-semibold text-brand-600">
                invite your billing team
              </Link>{" "}
              to help.
            </span>
          </li>
        </ol>
      </div>
    </div>
  );
}
