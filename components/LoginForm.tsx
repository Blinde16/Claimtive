"use client";

import { useFormState } from "react-dom";
import { login, verifyMfaLogin, type AuthState } from "@/app/actions/auth";
import { SubmitButton } from "./SubmitButton";

const initial: AuthState = {};

export function LoginForm() {
  const [loginState, loginAction] = useFormState(login, initial);
  const [mfaState, mfaAction] = useFormState(verifyMfaLogin, initial);

  // Show the code step once a password succeeds with MFA on, unless the
  // challenge expired (then fall back to email/password).
  const showMfa = loginState.mfaRequired && !mfaState.mfaExpired;

  if (showMfa) {
    return (
      <form action={mfaAction} className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Two-factor authentication
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Enter the 6-digit code from your authenticator app — or a backup code.
          </p>
        </div>
        {mfaState.error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {mfaState.error}
          </p>
        ) : null}
        <div>
          <label className="label" htmlFor="code">
            Authentication code
          </label>
          <input
            id="code"
            name="code"
            inputMode="text"
            autoComplete="one-time-code"
            autoFocus
            required
            placeholder="123456"
            className="input tracking-widest"
          />
        </div>
        <SubmitButton pendingLabel="Verifying…">Verify &amp; sign in</SubmitButton>
      </form>
    );
  }

  return (
    <form action={loginAction} className="space-y-4">
      {loginState.error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {loginState.error}
        </p>
      ) : mfaState.mfaExpired && mfaState.error ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {mfaState.error}
        </p>
      ) : null}
      <div>
        <label className="label" htmlFor="email">
          Work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="input"
          defaultValue="demo@claimtive.com"
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
          defaultValue="demo1234"
        />
      </div>
      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
