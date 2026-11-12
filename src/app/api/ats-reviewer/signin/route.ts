import { NextRequest, NextResponse } from "next/server";
import { checkSignIn, logUsage, sessionCookie } from "@/atsReviewer/lib/reviewerAuth";

/** Signs a reviewer in with their user name and password; every attempt goes in the usage log. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const userName = typeof body.user === "string" ? body.user : "";
  const result = checkSignIn(userName, typeof body.password === "string" ? body.password : "");
  if (!result.ok) {
    if (result.reason !== "not-set-up") await logUsage({ event: "sign-in failed", user: userName.trim().toUpperCase() || "(blank)", reason: result.reason });
    const error =
      result.reason === "not-set-up"
        ? "The ATS Report Reviewer isn't set up on this computer."
        : result.reason === "wait"
          ? `Too many wrong tries. Wait ${result.waitSeconds} seconds and try again.`
          : "That user name and password don't match.";
    return NextResponse.json({ error }, { status: result.reason === "wait" ? 429 : 401 });
  }
  await logUsage({ event: "signed in", user: result.user });
  const cookie = sessionCookie(result.user);
  const response = NextResponse.json({ ok: true, user: result.user });
  response.cookies.set(cookie.name, cookie.value, { httpOnly: true, sameSite: "strict", path: "/", maxAge: cookie.maxAge });
  return response;
}
