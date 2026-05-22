"use client";

import { useFormState } from "react-dom";
import { signup, type AuthState } from "@/app/actions/auth";
import { SubmitButton } from "./SubmitButton";

const initial: AuthState = {};

export function SignupForm() {
  const [state, formAction] = useFormState(signup, initial);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}
      <div>
        <label className="label" htmlFor="name">
          Your name
        </label>
        <input id="name" name="name" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="organization">
          Organization
        </label>
        <input id="organization" name="organization" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="email">
          Work email
        </label>
        <input id="email" name="email" type="email" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          minLength={8}
          required
          className="input"
        />
        <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
      </div>
      <SubmitButton pendingLabel="Creating account…">Create account</SubmitButton>
    </form>
  );
}
