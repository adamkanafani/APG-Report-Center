import type { NextRequest } from "next/server";
import { requireReviewer } from "@/atsReviewer/lib/reviewerAuth";
import { hasApiKey } from "@/atsReviewer/lib/review/ai";

/** Lets the start screen warn up front when the AI checks can't run on this computer. */
export async function GET(request: NextRequest) {
  const auth = requireReviewer(request);
  if (auth instanceof Response) return auth;
  return Response.json({ hasApiKey: hasApiKey() });
}
