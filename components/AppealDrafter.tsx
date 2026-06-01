"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { draftAppeal, type AppealState } from "@/app/actions/appeal";
import { SubmitButton } from "./SubmitButton";

const initial: AppealState = {};

export function AppealDrafter({
  claimId,
  patientControlNumber
}: {
  claimId: string;
  patientControlNumber: string | null;
}) {
  const [state, formAction] = useFormState(draftAppeal, initial);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  // Seed the editable letter when a draft comes back.
  useEffect(() => {
    if (state.draft) setText(state.draft);
  }, [state.draft]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  };

  const download = () => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `appeal-${patientControlNumber ?? claimId.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Generates a first-draft appeal letter from this claim&apos;s denial data.
        The AI sees only the denial reason, codes, and amounts — never patient
        identifiers, which appear as{" "}
        <span className="font-mono">[PLACEHOLDERS]</span> for you to fill in.
        Review and edit before sending; Claimtive never sends it for you.
      </p>

      {!state.draft ? (
        <form
          action={async (fd) => {
            await formAction(fd);
          }}
        >
          <input type="hidden" name="claimId" value={claimId} />
          <SubmitButton pendingLabel="Drafting…" className="btn-primary">
            Draft appeal letter
          </SubmitButton>
        </form>
      ) : null}

      {state.error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}

      {state.draft ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs leading-relaxed text-slate-800"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copy} className="btn-secondary">
              {copied ? "Copied ✓" : "Copy"}
            </button>
            <button type="button" onClick={download} className="btn-secondary">
              Download .txt
            </button>
            <form
              action={async (fd) => {
                await formAction(fd);
              }}
            >
              <input type="hidden" name="claimId" value={claimId} />
              <SubmitButton pendingLabel="Re-drafting…" className="btn-secondary">
                Regenerate
              </SubmitButton>
            </form>
          </div>
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            AI-drafted — verify every fact and fill the{" "}
            <span className="font-mono">[PLACEHOLDERS]</span> before sending
            through your normal appeal channel.
          </p>
        </div>
      ) : null}
    </div>
  );
}
