"use client";

import { useRef } from "react";
import { useFormState } from "react-dom";
import { changePassword, type AccountState } from "@/app/actions/account";
import { SubmitButton } from "./SubmitButton";

const initial: AccountState = {};

export function ChangePasswordForm() {
  const [state, formAction] = useFormState(changePassword, initial);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await formAction(fd);
        formRef.current?.reset();
      }}
      className="max-w-sm space-y-4"
    >
      <div>
        <label className="label" htmlFor="currentPassword">
          Current password
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className="input w-full"
        />
      </div>
      <div>
        <label className="label" htmlFor="newPassword">
          New password
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="input w-full"
        />
      </div>
      <div>
        <label className="label" htmlFor="confirmPassword">
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="input w-full"
        />
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

      <SubmitButton pendingLabel="Updating…" className="btn-primary">
        Update password
      </SubmitButton>
    </form>
  );
}
