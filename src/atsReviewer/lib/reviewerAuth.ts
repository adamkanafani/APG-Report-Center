import { createHash, createHmac, scryptSync, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { NextResponse, type NextRequest } from "next/server";

// The ATS Report Reviewer runs paid Claude AI checks, so it opens only for its named reviewers,
// each with a user name and password -- so every sign-in and every review is on record against
// the person who ran it (see the usage log below).
//
// No password is stored anywhere in this (public) repo. Setup ("Set Reviewer Users.bat" ->
// scripts/set-reviewer-users.mjs) writes each user's salted scrypt hash to the computer's
// .env.local as ATS_REVIEWER_USERS="BFULLER=scrypt:<salt>:<hash>;HROY=scrypt:<salt>:<hash>",
// next to ANTHROPIC_API_KEY. A right sign-in sets an httpOnly cookie, signed with those hashes,
// that names the user and keeps this browser signed in for SIGNED_IN_HOURS; every Reviewer API
// route checks it, so the page can't be skipped by calling the API directly. Changing any user's
// password signs everyone out.

export const SESSION_COOKIE = "ats-reviewer-session";
const USERS_ENV = "ATS_REVIEWER_USERS";
const SIGNED_IN_HOURS = 12;

type StoredUser = { salt: Buffer; hash: Buffer };

function storedUsers(): { raw: string; users: Map<string, StoredUser> } | null {
  const raw = process.env[USERS_ENV]?.trim();
  if (!raw) return null;
  const users = new Map<string, StoredUser>();
  for (const entry of raw.split(";")) {
    const m = entry.trim().match(/^([A-Za-z0-9._-]+)=scrypt:([0-9a-f]{32}):([0-9a-f]{64})$/i);
    if (m) users.set(m[1].toUpperCase(), { salt: Buffer.from(m[2], "hex"), hash: Buffer.from(m[3], "hex") });
  }
  return users.size > 0 ? { raw, users } : null;
}

/** False when setup never stored any reviewer on this computer -- the Reviewer then stays locked. */
export function reviewersConfigured(): boolean {
  return storedUsers() !== null;
}

// A six-digit password is a million guesses, so wrong guesses slow down: after 5 in a row, one try
// every 30 seconds until a right sign-in.
let failures = 0;
let nextTryAt = 0;

export type SignInCheck = { ok: true; user: string } | { ok: false; reason: "not-set-up" | "wrong" | "wait"; waitSeconds?: number };

export function checkSignIn(userName: string, password: string): SignInCheck {
  const stored = storedUsers();
  if (!stored) return { ok: false, reason: "not-set-up" };
  const now = Date.now();
  if (now < nextTryAt) return { ok: false, reason: "wait", waitSeconds: Math.ceil((nextTryAt - now) / 1000) };
  const user = userName.trim().toUpperCase();
  const record = stored.users.get(user);
  // Hash even for an unknown user, so a wrong user name takes as long as a wrong password.
  const given = scryptSync(String(password), record?.salt ?? Buffer.alloc(16), 32);
  if (record && timingSafeEqual(given, record.hash)) {
    failures = 0;
    nextTryAt = 0;
    return { ok: true, user };
  }
  failures++;
  if (failures >= 5) nextTryAt = now + 30_000;
  return { ok: false, reason: "wrong" };
}

const sign = (secret: string, user: string, expires: number) => createHmac("sha256", secret).update(`ats-reviewer:${user}:${expires}`).digest("hex");

/** The cookie that keeps this browser signed in as `user`, to set after a right sign-in. */
export function sessionCookie(user: string): { name: string; value: string; maxAge: number } {
  const stored = storedUsers();
  if (!stored) throw new Error("No reviewers are set up on this computer.");
  const maxAge = SIGNED_IN_HOURS * 3600;
  const expires = Date.now() + maxAge * 1000;
  return { name: SESSION_COOKIE, value: `${user}.${expires}.${sign(stored.raw, user, expires)}`, maxAge };
}

/** Who a cookie signs in, or null if it isn't a current, genuine session for a user who still exists. */
export function signedInUser(value: string | undefined): string | null {
  const stored = storedUsers();
  if (!stored || !value) return null;
  const [user, expiresText, sig] = value.split(".");
  const expires = Number(expiresText);
  if (!user || !stored.users.has(user) || !Number.isFinite(expires) || expires < Date.now() || !sig) return null;
  const expected = Buffer.from(sign(stored.raw, user, expires), "hex");
  const got = Buffer.from(sig, "hex");
  return got.length === expected.length && timingSafeEqual(got, expected) ? user : null;
}

/** For the top of every Reviewer API route: the signed-in user, or a 401 response to return. */
export function requireReviewer(request: NextRequest): { user: string } | NextResponse {
  const user = signedInUser(request.cookies.get(SESSION_COOKIE)?.value);
  if (user) return { user };
  return NextResponse.json({ error: "The ATS Report Reviewer is locked. Sign in with your reviewer user name and password." }, { status: 401 });
}

/** An opaque per-user id for the Anthropic API's metadata.user_id (the API asks for a hash, not a name). */
export function apiUserId(user: string): string {
  return createHash("sha256").update(`apg-ats-reviewer:${user}`).digest("hex").slice(0, 32);
}

// ---- Usage log ------------------------------------------------------------------------------
// One JSON line per event on this computer: sign-ins (good and bad), sign-outs, and every review
// with who ran it, which reports, and the AI tokens it used -- so each reviewer's usage, and whose
// account any run was under, is on record.
export const USAGE_LOG = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "APGReportCenter", "ats-reviewer-usage.jsonl");

export async function logUsage(event: Record<string, unknown>): Promise<void> {
  try {
    await fs.mkdir(path.dirname(USAGE_LOG), { recursive: true });
    await fs.appendFile(USAGE_LOG, JSON.stringify({ time: new Date().toISOString(), computer: os.hostname(), windowsUser: os.userInfo().username, ...event }) + "\n");
  } catch (err) {
    console.error("Couldn't write the reviewer usage log:", err);
  }
}
