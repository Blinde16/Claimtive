"use client";

import { useState } from "react";
import {
  beginMfaEnroll,
  confirmMfaEnroll,
  disableMfa,
  type MfaState
} from "@/app/actions/mfa";

export function MfaManager({ enabled }: { enabled: boolean }) {
  const [isOn, setIsOn] = useState(enabled);
  const [enroll, setEnroll] = useState<MfaState["enrolling"] | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const begin = async () => {
    setBusy(true);
    setError(null);
    const res = await beginMfaEnroll();
    setBusy(false);
    if (res.error) setError(res.error);
    else if (res.enrolling) setEnroll(res.enrolling);
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const res = await confirmMfaEnroll(code);
    setBusy(false);
    if (res.error) setError(res.error);
    else if (res.backupCodes) {
      setBackupCodes(res.backupCodes);
      setEnroll(null);
      setIsOn(true);
      setCode("");
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setError(null);
    const res = await disableMfa(password);
    setBusy(false);
    if (res.error) setError(res.error);
    else {
      setIsOn(false);
      setPassword("");
      setBackupCodes(null);
    }
  };

  // Just-enrolled: show the one-time backup codes.
  if (backupCodes) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Two-factor authentication is on. Save these backup codes somewhere safe
          — each works once if you lose your authenticator. They won&apos;t be
          shown again.
        </p>
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-4 font-mono text-sm">
          {backupCodes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <button onClick={() => setBackupCodes(null)} className="btn-secondary">
          I&apos;ve saved them
        </button>
      </div>
    );
  }

  // Enrolling: show the QR + confirm a code.
  if (enroll) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Scan this QR code with an authenticator app (Google Authenticator,
          Authy, 1Password…), then enter the 6-digit code it shows.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={enroll.qrDataUrl} alt="MFA QR code" className="h-44 w-44" />
        <p className="text-xs text-slate-500">
          Can&apos;t scan? Enter this key manually:{" "}
          <span className="font-mono">{enroll.secret}</span>
        </p>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            inputMode="numeric"
            className="input w-40 tracking-widest"
          />
          <button onClick={confirm} disabled={busy || !code} className="btn-primary">
            {busy ? "Verifying…" : "Confirm & enable"}
          </button>
        </div>
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      </div>
    );
  }

  // Enabled: offer disable (password-gated).
  if (isOn) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          ✓ Two-factor authentication is on for your account.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Current password to disable"
            className="input w-64"
          />
          <button onClick={turnOff} disabled={busy || !password} className="btn-secondary">
            {busy ? "Disabling…" : "Disable"}
          </button>
        </div>
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      </div>
    );
  }

  // Disabled: offer to enable.
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Add a second step at sign-in with an authenticator app. Strongly
        recommended for accounts that can access patient data.
      </p>
      <button onClick={begin} disabled={busy} className="btn-primary">
        {busy ? "Starting…" : "Enable two-factor authentication"}
      </button>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
