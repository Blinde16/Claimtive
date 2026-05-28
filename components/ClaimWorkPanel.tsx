"use client";

import { useFormState } from "react-dom";
import { updateClaimWork, type ClaimWorkState } from "@/app/actions/claims";
import { WORK_STATUSES, WORK_STATUS_LABELS } from "@/lib/worklist";
import { SubmitButton } from "./SubmitButton";

const initial: ClaimWorkState = {};

export function ClaimWorkPanel({
  claimId,
  workStatus,
  workNote,
  assignedToId,
  users
}: {
  claimId: string;
  workStatus: string;
  workNote: string | null;
  assignedToId: string | null;
  users: Array<{ id: string; name: string }>;
}) {
  const [state, formAction] = useFormState(updateClaimWork, initial);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="claimId" value={claimId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="workStatus">
            Status
          </label>
          <select
            id="workStatus"
            name="workStatus"
            defaultValue={workStatus}
            className="input w-full"
          >
            {WORK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {WORK_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="assignedToId">
            Assigned to
          </label>
          <select
            id="assignedToId"
            name="assignedToId"
            defaultValue={assignedToId ?? ""}
            className="input w-full"
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="workNote">
          Note
        </label>
        <textarea
          id="workNote"
          name="workNote"
          defaultValue={workNote ?? ""}
          rows={3}
          maxLength={2000}
          placeholder="e.g. Called Aetna 5/27, resubmitting with auth #12345"
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

      <SubmitButton pendingLabel="Saving…" className="btn-primary">
        Save worklist
      </SubmitButton>
    </form>
  );
}
