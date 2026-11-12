"use client";

/** Who the Reviewer is signed in as (every review is recorded under them), with a way to sign out. */
export function SignedInBadge({ user }: { user: string }) {
  async function signOut() {
    await fetch("/api/ats-reviewer/signout", { method: "POST" }).catch(() => {});
    window.location.reload();
  }
  return (
    <div className="signed-in-badge">
      Signed in as <strong>{user}</strong>
      <button className="secondary" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}
