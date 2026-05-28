"use client";

import { useRef } from "react";
import { useFormState } from "react-dom";
import {
  addTeamMember,
  removeTeamMember,
  resetMemberPassword,
  type TeamState
} from "@/app/actions/team";
import { SubmitButton } from "./SubmitButton";

const initial: TeamState = {};

export interface TeamMemberRow {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function TeamManager({
  isOwner,
  currentUserId,
  members
}: {
  isOwner: boolean;
  currentUserId: string;
  members: TeamMemberRow[];
}) {
  const [addState, addAction] = useFormState(addTeamMember, initial);
  const [removeState, removeAction] = useFormState(removeTeamMember, initial);
  const [resetState, resetAction] = useFormState(resetMemberPassword, initial);
  const addFormRef = useRef<HTMLFormElement>(null);

  return (
    <div className="space-y-6">
      {isOwner ? (
        <section className="card p-6">
          <h2 className="text-sm font-semibold text-slate-900">Add a team member</h2>
          <p className="mb-4 mt-1 text-xs text-slate-500">
            Creates a login and a one-time temporary password to share with them
            securely. They can change it after signing in.
          </p>
          <form
            ref={addFormRef}
            action={async (fd) => {
              await addAction(fd);
              addFormRef.current?.reset();
            }}
            className="grid gap-3 sm:grid-cols-4"
          >
            <input name="name" placeholder="Full name" required className="input" />
            <input name="email" type="email" placeholder="Work email" required className="input" />
            <select name="role" defaultValue="MEMBER" className="input">
              <option value="MEMBER">Member</option>
              <option value="OWNER">Owner</option>
            </select>
            <SubmitButton pendingLabel="Adding…" className="btn-primary">
              Add member
            </SubmitButton>
          </form>

          {addState.error ? (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {addState.error}
            </p>
          ) : null}
          {addState.success ? (
            <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <p>{addState.success}</p>
              {addState.tempPassword ? (
                <p className="mt-1">
                  Temporary password:{" "}
                  <span className="rounded bg-white px-2 py-0.5 font-mono text-emerald-900 ring-1 ring-emerald-200">
                    {addState.tempPassword}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Members</h2>
        </div>
        {removeState.error ? (
          <p className="mx-6 mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {removeState.error}
          </p>
        ) : null}
        {removeState.success ? (
          <p className="mx-6 mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {removeState.success}
          </p>
        ) : null}
        {resetState.error ? (
          <p className="mx-6 mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {resetState.error}
          </p>
        ) : null}
        {resetState.success ? (
          <div className="mx-6 mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <p>{resetState.success}</p>
            {resetState.tempPassword ? (
              <p className="mt-1">
                Temporary password:{" "}
                <span className="rounded bg-white px-2 py-0.5 font-mono text-emerald-900 ring-1 ring-emerald-200">
                  {resetState.tempPassword}
                </span>
              </p>
            ) : null}
          </div>
        ) : null}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-6 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              {isOwner ? <th className="px-6 py-3 font-medium text-right">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-slate-100">
                <td className="px-6 py-3 font-medium text-slate-800">
                  {m.name}
                  {m.id === currentUserId ? (
                    <span className="ml-2 text-xs text-slate-400">(you)</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-slate-600">{m.email}</td>
                <td className="px-4 py-3">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {m.role === "OWNER" ? "Owner" : "Member"}
                  </span>
                </td>
                {isOwner ? (
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-4">
                      <form action={resetAction} className="inline">
                        <input type="hidden" name="userId" value={m.id} />
                        <button
                          type="submit"
                          className="text-sm font-medium text-slate-500 hover:text-slate-700"
                        >
                          Reset password
                        </button>
                      </form>
                      {m.id === currentUserId ? null : (
                        <form action={removeAction} className="inline">
                          <input type="hidden" name="userId" value={m.id} />
                          <button
                            type="submit"
                            className="text-sm font-medium text-rose-600 hover:text-rose-700"
                          >
                            Remove
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
