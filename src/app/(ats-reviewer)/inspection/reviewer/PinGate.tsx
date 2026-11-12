"use client";

import { useState } from "react";

/** The sign-in screen in front of the ATS Report Reviewer: its AI checks are paid per report, so
 *  only its named reviewers can open it, each under their own user name. */
export function PinGate({ configured }: { configured: boolean }) {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!user.trim() || !password) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/ats-reviewer/signin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user, password }) });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't sign in.");
      setPassword("");
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
            <p className="folder-picker-subtitle">For the report reviewers only. Its AI checks are paid per report, so sign in with your own reviewer user name and password -- every review is recorded under it.</p>
            <form onSubmit={signIn} className="signin-form">
              <input
                className="signin-input"
                autoComplete="username"
                autoFocus
                placeholder="User name"
                aria-label="User name"
                value={user}
                onChange={(e) => setUser(e.target.value.toUpperCase())}
              />
              <input
                className="signin-input"
                type="password"
                autoComplete="current-password"
                placeholder="Password"
                aria-label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="submit" disabled={!user.trim() || !password || checking}>
                {checking ? "Checking..." : "Sign in"}
              </button>
            </form>
            {error && <p className="folder-picker-error">{error}</p>}
          </>
        ) : (
          <p className="folder-picker-subtitle">The ATS Report Reviewer is for the report reviewers only and isn&apos;t set up on this computer.</p>
        )}
      </div>
    </div>
  );
}
