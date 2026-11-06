import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

// The ATS Report Reviewer runs paid Claude AI checks, so it opens only with the reviewer PIN.
//
// The PIN itself is never stored anywhere in this (public) repo. Setup writes a salted scrypt hash
// of it to the computer's .env.local as ATS_REVIEWER_PIN_HASH ("scrypt:<salt hex>:<hash hex>"),
// next to ANTHROPIC_API_KEY. A right PIN sets an httpOnly cookie, signed with that hash, that
// keeps this browser unlocked for UNLOCK_HOURS; every Reviewer API route checks it, so the page
// can't be skipped by calling the API directly. Changing the PIN signs everyone out.

export const UNLOCK_COOKIE = "ats-reviewer-unlock";
const HASH_ENV = "ATS_REVIEWER_PIN_HASH";
const UNLOCK_HOURS = 12;

/** "scrypt:<salt>:<hash>" for a PIN -- what setup writes to .env.local. */
export function hashPin(pin: string, salt: Buffer = randomBytes(16)): string {
  return `scrypt:${salt.toString("hex")}:${scryptSync(pin, salt, 32).toString("hex")}`;
}

function storedHash(): { raw: string; salt: Buffer; hash: Buffer } | null {
  const raw = process.env[HASH_ENV]?.trim();
  const m = raw?.match(/^scrypt:([0-9a-f]{32}):([0-9a-f]{64})$/i);
  if (!raw || !m) return null;
  return { raw, salt: Buffer.from(m[1], "hex"), hash: Buffer.from(m[2], "hex") };
}

/** False when setup never stored a PIN on this computer -- the Reviewer then stays locked. */
export function pinConfigured(): boolean {
  return storedHash() !== null;
}

// Six digits is a million guesses, so wrong guesses slow down: after 5 in a row, one try every
// 30 seconds until the right PIN goes in.
let failures = 0;
let nextTryAt = 0;

export type PinCheck = { ok: true } | { ok: false; reason: "not-set-up" | "wrong" | "wait"; waitSeconds?: number };

export function checkPin(pin: string): PinCheck {
  const stored = storedHash();
  if (!stored) return { ok: false, reason: "not-set-up" };
  const now = Date.now();
  if (now < nextTryAt) return { ok: false, reason: "wait", waitSeconds: Math.ceil((nextTryAt - now) / 1000) };
  const given = scryptSync(String(pin), stored.salt, 32);
  if (timingSafeEqual(given, stored.hash)) {
    failures = 0;
    nextTryAt = 0;
    return { ok: true };
  }
  failures++;
  if (failures >= 5) nextTryAt = now + 30_000;
  return { ok: false, reason: "wrong" };
}

const sign = (secret: string, expires: number) => createHmac("sha256", secret).update(`ats-reviewer-unlocked:${expires}`).digest("hex");

/** The cookie that keeps this browser unlocked, to set after a right PIN. */
export function unlockCookie(): { name: string; value: string; maxAge: number } {
  const stored = storedHash();
  if (!stored) throw new Error("No reviewer PIN is set up on this computer.");
  const maxAge = UNLOCK_HOURS * 3600;
  const expires = Date.now() + maxAge * 1000;
  return { name: UNLOCK_COOKIE, value: `${expires}.${sign(stored.raw, expires)}`, maxAge };
}

/** Whether a cookie value is a current, genuine unlock. */
export function isUnlocked(value: string | undefined): boolean {
  const stored = storedHash();
  if (!stored || !value) return false;
  const [expiresText, sig] = value.split(".");
  const expires = Number(expiresText);
  if (!Number.isFinite(expires) || expires < Date.now() || !sig) return false;
  const expected = Buffer.from(sign(stored.raw, expires), "hex");
  const got = Buffer.from(sig, "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** For the top of every Reviewer API route: a 401 unless this browser is unlocked. */
export function lockedResponse(request: NextRequest): NextResponse | null {
  if (isUnlocked(request.cookies.get(UNLOCK_COOKIE)?.value)) return null;
  return NextResponse.json({ error: "The ATS Report Reviewer is locked. Enter the reviewer PIN to use it." }, { status: 401 });
}
