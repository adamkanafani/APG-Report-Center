import type { NextRequest } from "next/server";
import { lockedResponse } from "@/atsReviewer/lib/pinLock";
import { hasApiKey } from "@/atsReviewer/lib/review/ai";

/** Lets the start screen warn up front when the AI checks can't run on this computer. */
export async function GET(request: NextRequest) {
  const locked = lockedResponse(request);
  if (locked) return locked;
  return Response.json({ hasApiKey: hasApiKey() });
}
