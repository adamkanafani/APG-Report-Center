import { NextRequest, NextResponse } from "next/server";
import { checkPin, unlockCookie } from "@/atsReviewer/lib/pinLock";

/** Checks the reviewer PIN; a right one unlocks the ATS Report Reviewer in this browser. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const result = checkPin(typeof body.pin === "string" ? body.pin : "");
  if (!result.ok) {
    const error =
      result.reason === "not-set-up"
        ? "The ATS Report Reviewer is for the report reviewer only and isn't set up on this computer."
        : result.reason === "wait"
          ? `Too many wrong tries. Wait ${result.waitSeconds} seconds and try again.`
          : "That PIN isn't right.";
    return NextResponse.json({ error }, { status: result.reason === "wait" ? 429 : 401 });
  }
  const cookie = unlockCookie();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookie.name, cookie.value, { httpOnly: true, sameSite: "strict", path: "/", maxAge: cookie.maxAge });
  return response;
}
