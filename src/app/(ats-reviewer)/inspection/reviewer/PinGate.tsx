"use client";

import { useState } from "react";

/** The PIN screen in front of the ATS Report Reviewer (its AI checks cost money per report). */
export function PinGate({ configured }: { configured: boolean }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length !== 6) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/ats-reviewer/unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't check the PIN.");
      setPin("");
    } catch {
      setError("Couldn't reach the app. Is the Report Center still running?");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="folder-picker">
      <a className="home-link" href="/">
        ← Report Center
      </a>
      <div className="folder-picker-card pin-gate">
        <div className="app-logo">
          <h1>ATS Report Reviewer</h1>
        </div>
        {configured ? (
          <>
            <p className="folder-picker-subtitle">For the report reviewer only. Its AI checks are paid per report, so it opens with the reviewer&apos;s 6-digit PIN.</p>
            <form onSubmit={unlock} className="pin-form">
              <input
                className="pin-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                maxLength={6}
                placeholder="••••••"
                aria-label="Reviewer PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              <button type="submit" disabled={pin.length !== 6 || checking}>
                {checking ? "Checking..." : "Unlock"}
              </button>
            </form>
            {error && <p className="folder-picker-error">{error}</p>}
          </>
        ) : (
          <p className="folder-picker-subtitle">
            The ATS Report Reviewer is for the report reviewer only and isn&apos;t set up on this computer.
          </p>
        )}
      </div>
    </div>
  );
}
