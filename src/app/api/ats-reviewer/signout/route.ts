import { NextRequest, NextResponse } from "next/server";
import { logUsage, SESSION_COOKIE, signedInUser } from "@/atsReviewer/lib/reviewerAuth";

/** Signs the reviewer out of this browser. */
export async function POST(request: NextRequest) {
  const user = signedInUser(request.cookies.get(SESSION_COOKIE)?.value);
  if (user) await logUsage({ event: "signed out", user });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
